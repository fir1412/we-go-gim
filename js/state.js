// App state held in memory, persisted through db.js.
import * as db from './db.js';
import { EXERCISES, PROGRAM, DEFAULT_SETTINGS, seedSessions, SEED_BODY } from './seed.js';
import { suggest, dowOf, warmup, estimateDay, invalidateCaches, trimToFit, planSec } from './engine.js';

export const S = {
  backend: null,
  exercises: [], exById: {},
  program: null,
  settings: null,
  sessions: [], body: [], cardio: [],
  daily: {}, // date -> {protein, kcal, water, steps, sleep}
  draft: null,
  readiness: { date: null, sleep: null, pain: false }, // sleep stays null until the user taps an option
};

let rerender = () => {};
export const onChange = fn => { rerender = fn; };
export const refresh = () => rerender();
/** Call after changing a session or exercise in place, so cached history (XP, exposures) is rebuilt. */
export const touch = () => invalidateCaches();

/** Local calendar date. `?today=YYYY-MM-DD` in the URL overrides it for testing. */
export function todayIso() {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const uid = (p = 'x') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function indexExercises() {
  invalidateCaches();
  S.exById = Object.fromEntries(S.exercises.map(e => [e.id, e]));
}
const byDateDesc = (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.end || 0) - (a.end || 0));

export async function load() {
  S.backend = await db.init();
  let settings = await db.getKv('settings');
  if (!settings) {
    // First run: exercise library, programme and default settings. No history ships with the app.
    settings = structuredClone(DEFAULT_SETTINGS);
    await db.putMany('exercises', structuredClone(EXERCISES));
    await db.setKv('program', structuredClone(PROGRAM));
    await db.putMany('sessions', seedSessions(settings.gymId));
    await db.putMany('body', structuredClone(SEED_BODY));
    await db.setKv('settings', settings);
  }
  S.settings = { ...structuredClone(DEFAULT_SETTINGS), ...settings, equip: { ...DEFAULT_SETTINGS.equip, ...(settings.equip || {}) } };
  let exs = await db.all('exercises');
  // Library exercises added in an update reach existing installs too (never ones the user deleted).
  const have = new Set(exs.map(e => e.id)), gone = new Set(S.settings.deletedExercises || []);
  const added = EXERCISES.filter(e => !have.has(e.id) && !gone.has(e.id)).map(e => structuredClone(e));
  if (added.length) { await db.putMany('exercises', added); exs = exs.concat(added); }
  S.exercises = exs.sort((a, b) => a.name.localeCompare(b.name));
  indexExercises();
  S.program = (await db.getKv('program')) || structuredClone(PROGRAM);
  S.sessions = (await db.all('sessions')).sort(byDateDesc);
  invalidateCaches();
  S.body = (await db.all('body')).sort((a, b) => a.date.localeCompare(b.date));
  S.cardio = (await db.all('cardio')).sort((a, b) => b.date.localeCompare(a.date));
  S.draft = await db.getKv('draft');
  S.daily = {};
  for (const x of await db.all('kv')) if (x.key.startsWith('daily:')) S.daily[x.key.slice(6)] = x.value;
  const r = await db.getKv('readiness');
  S.readiness = r && r.date === todayIso() ? r : { date: todayIso(), sleep: null, pain: false };
}

// ---- settings / program / exercises ---------------------------------------
export async function saveSettings(patch) {
  S.settings = { ...S.settings, ...patch };
  await db.setKv('settings', S.settings);
  refresh();
}
export async function saveProgram(program) {
  S.program = program;
  await db.setKv('program', program);
  refresh();
}
export async function saveExercise(ex) {
  const i = S.exercises.findIndex(e => e.id === ex.id);
  if (i >= 0) S.exercises[i] = ex; else S.exercises.push(ex);
  S.exercises.sort((a, b) => a.name.localeCompare(b.name));
  indexExercises();
  await db.put('exercises', ex);
  refresh();
}
export async function deleteExercise(id) {
  if (EXERCISES.some(e => e.id === id)) await saveSettings({ deletedExercises: [...new Set([...(S.settings.deletedExercises || []), id])] });
  S.exercises = S.exercises.filter(e => e.id !== id);
  indexExercises();
  await db.del('exercises', id);
  refresh();
}
export async function setReadiness(patch) {
  S.readiness = { ...S.readiness, ...patch, date: todayIso() };
  await db.setKv('readiness', S.readiness);
  refresh();
}

// ---- programme helpers -----------------------------------------------------
export const dayFor = dow => S.program.days.find(d => d.dow === dow) || { dow, name: 'Rest', sub: '', color: 'rest', slots: [] };
export const dayForDate = iso => dayFor(dowOf(iso));

export function deloadActive(date = todayIso()) {
  return !!(S.settings.deloadUntil && date <= S.settings.deloadUntil);
}
export function isPoor() {
  return S.readiness.sleep === '<6' || !!S.readiness.pain;
}

export function suggestionCtx(date = todayIso()) {
  return { sessions: S.sessions, gymId: S.settings.gymId, poor: isPoor(), deload: deloadActive(date), equip: S.settings.equip, date };
}

// ---- workout draft -----------------------------------------------------------
function entryFromSlot(slot, ctx) {
  const ex = S.exById[slot.exId];
  const sg = suggest(slot, ex, ctx);
  const sets = sg.reps.map(r => ({ w: sg.w, r, done: false }));
  if (wantsWarmup(ex) && sg.w) sets.unshift(...warmup(sg.w, ex, S.settings.equip));
  return { uid: uid('e'), exId: ex.id, slot: { ...slot }, sg: { t: sg.t, why: sg.why, rir: sg.rir, w: sg.w, reps: sg.reps, inc: sg.inc }, sets, rir: null, pain: false, note: '' };
}

/** Auto warm-ups: true = every kg lift, 'barbell' = barbell and Smith lifts only, false = off. */
export function wantsWarmup(ex) {
  const a = S.settings.autoWarmup;
  return a === true || (a === 'barbell' && (ex.equip === 'barbell' || ex.equip === 'smith'));
}

/** Readiness to store with a workout: only what the user actually told us (null when nothing was tapped). */
const readinessNow = () => (S.readiness.sleep == null && !S.readiness.pain ? null : { sleep: S.readiness.sleep ?? null, pain: !!S.readiness.pain });

/** Per-slot work-set counts for a day after an optional "how long today?" limit. counts: suggested sets per slot. */
export function trimmedCounts(day, counts, minutes = null) {
  return trimToFit(day.slots, counts, S.exById, S.sessions, minutes);
}

/** opts.minutes: short-session limit (20/30/45); trims sets and accessories to fit. */
export async function startWorkout(day, date = todayIso(), { minutes = null } = {}) {
  const ctx = suggestionCtx(date);
  const slots = day.slots.filter(s => S.exById[s.exId]);
  let entries = slots.map(s => entryFromSlot(s, ctx));
  let trimmed = false;
  if (minutes > 0 && entries.length) {
    const counts = trimToFit(slots, entries.map(e => e.sg.reps.length), S.exById, S.sessions, minutes);
    entries = entries.filter((e, i) => {
      const n = counts[i];
      if (!n) { trimmed = true; return false; }
      if (n < e.sg.reps.length) {
        trimmed = true;
        let k = 0; // keep warm-ups plus the first n work sets
        e.sets = e.sets.filter(s => s.warm || k++ < n);
        e.sg = { ...e.sg, reps: e.sg.reps.slice(0, n) };
      }
      return true;
    });
  }
  // Plan the time from the sets actually suggested (a deload has fewer than the programme).
  const planned = { ...day, slots: entries.map(e => ({ ...e.slot, sets: e.sg.reps.length })) };
  const plannedSec = !entries.length ? null
    : trimmed ? planSec(planned.slots, planned.slots.map(s => s.sets), S.exById, S.sessions)
    : estimateDay(planned, S.exById, S.sessions);
  S.draft = {
    id: uid('s'), date, dow: day.dow, name: day.name, color: day.color, gymId: S.settings.gymId,
    past: date < todayIso(), minutes: null, ...(trimmed ? { short: minutes } : {}),
    start: Date.now(), readiness: date < todayIso() ? null : readinessNow(),
    deload: ctx.deload, plannedSec,
    entries,
    hr: null, feel: null, note: '', timer: null, summary: false,
  };
  await saveDraft();
}

export async function startFromSession(sess) {
  const ctx = suggestionCtx();
  S.draft = {
    id: uid('s'), date: todayIso(), dow: dowOf(todayIso()), name: sess.name, color: sess.color || 'upper', gymId: S.settings.gymId,
    start: Date.now(), readiness: readinessNow(), deload: ctx.deload,
    entries: sess.entries.filter(e => S.exById[e.exId]).map(e => {
      const planned = S.program.days.flatMap(d => d.slots).find(s => s.exId === e.exId);
      const slot = e.slot || (planned ? { ...planned, group: '' } : { exId: e.exId, sets: Math.max(1, e.sets.filter(s => !s.warm).length), lo: 8, hi: 12, group: '' });
      return entryFromSlot({ ...slot, exId: e.exId }, ctx);
    }),
    hr: null, feel: null, note: '', timer: null, summary: false,
  };
  await saveDraft();
}

export function newEntry(exId, slot = null) {
  const s = { sets: 3, lo: 8, hi: 12, group: '', ...(slot || {}), exId };
  return entryFromSlot(s, suggestionCtx(S.draft?.date));
}

export async function saveDraft() {
  if (S.draft) await db.setKv('draft', S.draft); else await db.del('kv', 'draft');
}

export async function discardDraft() {
  S.draft = null;
  await saveDraft();
}

export async function commitDraft() {
  const d = S.draft;
  const sess = {
    id: d.id, date: d.date, name: d.name, color: d.color, gymId: d.gymId,
    // A backfilled past workout has no real clock: keep only the duration typed in, and drop tick times
    // so they don't teach the rest-time estimate.
    start: d.past ? null : d.start, end: d.past ? null : Date.now(), minutes: d.past ? d.minutes ?? null : undefined,
    readiness: d.readiness, deload: !!d.deload, ...(d.past ? { backfilled: true } : {}),
    hr: d.hr, feel: d.feel, note: d.note, ...(d.cardio?.length ? { cardio: d.cardio.map(c => ({ type: c.type, min: c.min, intensity: c.intensity, ...(c.km ? { km: c.km } : {}) })) } : {}),
    entries: d.entries.map(e => ({ exId: e.exId, slot: e.slot, sug: e.sg?.t || null, sets: e.sets.map(s => ({ w: s.w, r: s.r, done: !!s.done, ...(s.warm ? { warm: true } : {}), ...(s.at && !d.past ? { at: s.at } : {}) })), rir: e.rir, pain: e.pain, note: e.note })),
  };
  await saveSession(sess);
  // Cardio done in the workout also lands in the cardio log.
  for (const c of d.cardio || []) await saveCardio({ id: uid('c'), date: d.date, type: c.type, min: c.min, intensity: c.intensity, ...(c.km ? { km: c.km } : {}), note: '', sessionId: sess.id });
  S.draft = null;
  await saveDraft();
  return sess;
}

// ---- sessions / body / cardio -----------------------------------------------
export async function saveSession(sess) {
  const i = S.sessions.findIndex(s => s.id === sess.id);
  if (i >= 0) S.sessions[i] = sess; else S.sessions.push(sess);
  S.sessions.sort(byDateDesc);
  invalidateCaches();
  await db.put('sessions', sess);
  refresh();
}
export async function deleteSession(id) {
  S.sessions = S.sessions.filter(s => s.id !== id);
  await db.del('sessions', id);
  refresh();
}
export async function saveBody(rec) {
  const i = S.body.findIndex(b => b.id === rec.id);
  if (i >= 0) S.body[i] = rec; else S.body.push(rec);
  S.body.sort((a, b) => a.date.localeCompare(b.date));
  await db.put('body', rec);
  refresh();
}
export async function deleteBody(id) {
  S.body = S.body.filter(b => b.id !== id);
  await db.del('body', id);
  refresh();
}
export async function saveCardio(rec) {
  const i = S.cardio.findIndex(b => b.id === rec.id);
  if (i >= 0) S.cardio[i] = rec; else S.cardio.push(rec);
  S.cardio.sort((a, b) => b.date.localeCompare(a.date));
  await db.put('cardio', rec);
  refresh();
}
export async function deleteCardio(id) {
  S.cardio = S.cardio.filter(b => b.id !== id);
  await db.del('cardio', id);
  refresh();
}

// ---- whole-database operations (backup / restore / reset) --------------------
export async function exportAll() {
  return {
    app: 'setlist', version: 1, exported: new Date().toISOString(),
    settings: S.settings, program: S.program, exercises: S.exercises,
    sessions: S.sessions, body: S.body, cardio: S.cardio, daily: S.daily,
  };
}

/** Throws a readable error if a backup's records are malformed. Nothing is written until this passes. */
export function validateBackup(data) {
  if (!data || data.app !== 'setlist' || !Array.isArray(data.sessions)) throw new Error('This file is not a we go gim backup.');
  const bad = (what, i) => { throw new Error(`Backup rejected: ${what} #${i + 1} is malformed. Nothing was changed.`); };
  const iso = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  data.sessions.forEach((s, i) => { if (!s || typeof s.id !== 'string' || !iso(s.date) || !Array.isArray(s.entries) || s.entries.some(e => !e || typeof e.exId !== 'string' || !Array.isArray(e.sets))) bad('session', i); });
  (data.exercises || []).forEach((e, i) => { if (!e || typeof e.id !== 'string' || typeof e.name !== 'string' || !['kg', 'kg/DB', 'L', 'bw'].includes(e.unit)) bad('exercise', i); });
  (data.body || []).forEach((b, i) => { if (!b || typeof b.id !== 'string' || !iso(b.date) || !(+b.kg > 0)) bad('weigh-in', i); });
  (data.cardio || []).forEach((c, i) => { if (!c || typeof c.id !== 'string' || !iso(c.date)) bad('cardio entry', i); });
  if (data.program && !Array.isArray(data.program.days)) bad('programme', 0);
}

export async function importAll(data, { merge = false } = {}) {
  validateBackup(data);
  await db.del('kv', 'draft');
  S.draft = null;
  if (!merge) for (const s of ['sessions', 'exercises', 'body', 'cardio']) await db.clear(s);
  await db.putMany('exercises', data.exercises || []);
  await db.putMany('sessions', data.sessions || []);
  await db.putMany('body', data.body || []);
  await db.putMany('cardio', data.cardio || []);
  if (!merge || !S.program) await db.setKv('program', data.program || PROGRAM);
  if (!merge) await db.setKv('settings', data.settings || DEFAULT_SETTINGS);
  if (data.daily && typeof data.daily === 'object') for (const [d, v] of Object.entries(data.daily)) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === 'object') await db.setKv('daily:' + d, v);
  await load();
  refresh();
}

export async function resetAll() {
  for (const s of db.STORES) await db.clear(s);
  await load();
  refresh();
}

export async function removeSeedData() {
  const ids = S.sessions.filter(s => s.seed).map(s => s.id);
  for (const id of ids) await db.del('sessions', id);
  S.sessions = S.sessions.filter(s => !s.seed);
  for (const b of S.body.filter(b => b.seed)) await db.del('body', b.id);
  S.body = S.body.filter(b => !b.seed);
  refresh();
}

// ---- daily targets: protein, calories, water, steps, sleep ------------------------------------
export const DAILY_FIELDS = ['protein', 'kcal', 'water', 'steps', 'sleep'];
/** Targets from settings, falling back to sensible defaults (protein ~1.8 g per kg of body weight). */
export function dailyTargets() {
  const t = S.settings.targets || {};
  const bw = S.body[S.body.length - 1]?.kg;
  // A target set to null by the user is hidden; one never set uses the default.
  const pick = (k, dflt) => (k in t ? t[k] : dflt);
  return {
    protein: pick('protein', bw ? Math.round(bw * 1.8 / 5) * 5 : 140),
    kcal: pick('kcal', null),
    water: pick('water', 3),
    steps: pick('steps', 8000),
    sleep: pick('sleep', 8),
  };
}
export async function saveDaily(date, patch) {
  const cur = S.daily[date] || {};
  const next = { ...cur, ...patch };
  for (const k of DAILY_FIELDS) if (next[k] == null || !(next[k] >= 0)) delete next[k];
  S.daily[date] = next;
  await db.setKv('daily:' + date, next);
  refresh();
}
