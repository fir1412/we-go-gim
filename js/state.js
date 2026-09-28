// App state held in memory, persisted through db.js.
import * as db from './db.js';
import { EXERCISES, PROGRAM, DEFAULT_SETTINGS, seedSessions, SEED_BODY } from './seed.js';
import { suggest, dowOf, warmup, estimateDay } from './engine.js';

export const S = {
  backend: null,
  exercises: [], exById: {},
  program: null,
  settings: null,
  sessions: [], body: [], cardio: [],
  draft: null,
  readiness: { date: null, sleep: '7+', pain: false },
};

let rerender = () => {};
export const onChange = fn => { rerender = fn; };
export const refresh = () => rerender();

/** Local calendar date. `?today=YYYY-MM-DD` in the URL overrides it for testing. */
export function todayIso() {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const uid = (p = 'x') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function indexExercises() {
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
  S.exercises = (await db.all('exercises')).sort((a, b) => a.name.localeCompare(b.name));
  indexExercises();
  S.program = (await db.getKv('program')) || structuredClone(PROGRAM);
  S.sessions = (await db.all('sessions')).sort(byDateDesc);
  S.body = (await db.all('body')).sort((a, b) => a.date.localeCompare(b.date));
  S.cardio = (await db.all('cardio')).sort((a, b) => b.date.localeCompare(a.date));
  S.draft = await db.getKv('draft');
  const r = await db.getKv('readiness');
  S.readiness = r && r.date === todayIso() ? r : { date: todayIso(), sleep: '7+', pain: false };
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
  if (S.settings.autoWarmup && sg.w) sets.unshift(...warmup(sg.w, ex, S.settings.equip));
  return { uid: uid('e'), exId: ex.id, slot: { ...slot }, sg: { t: sg.t, why: sg.why, rir: sg.rir, w: sg.w, reps: sg.reps, inc: sg.inc }, sets, rir: null, pain: false, note: '' };
}

export async function startWorkout(day, date = todayIso()) {
  const ctx = suggestionCtx(date);
  const entries = day.slots.filter(s => S.exById[s.exId]).map(s => entryFromSlot(s, ctx));
  // Plan the time from the sets actually suggested (a deload has fewer than the programme).
  const planned = { ...day, slots: entries.map(e => ({ ...e.slot, sets: e.sg.reps.length })) };
  S.draft = {
    id: uid('s'), date, dow: day.dow, name: day.name, color: day.color, gymId: S.settings.gymId,
    start: Date.now(), readiness: { sleep: S.readiness.sleep, pain: S.readiness.pain },
    deload: ctx.deload, plannedSec: entries.length ? estimateDay(planned, S.exById, S.sessions) : null,
    entries,
    hr: null, feel: null, note: '', timer: null, summary: false,
  };
  await saveDraft();
}

export async function startFromSession(sess) {
  const ctx = suggestionCtx();
  S.draft = {
    id: uid('s'), date: todayIso(), dow: dowOf(todayIso()), name: sess.name, color: sess.color || 'upper', gymId: S.settings.gymId,
    start: Date.now(), readiness: { sleep: S.readiness.sleep, pain: S.readiness.pain }, deload: ctx.deload,
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
    start: d.start, end: Date.now(), readiness: d.readiness, deload: !!d.deload,
    hr: d.hr, feel: d.feel, note: d.note,
    entries: d.entries.map(e => ({ exId: e.exId, slot: e.slot, sug: e.sg?.t || null, sets: e.sets.map(s => ({ w: s.w, r: s.r, done: !!s.done, ...(s.warm ? { warm: true } : {}), ...(s.at ? { at: s.at } : {}) })), rir: e.rir, pain: e.pain, note: e.note })),
  };
  await saveSession(sess);
  S.draft = null;
  await saveDraft();
  return sess;
}

// ---- sessions / body / cardio -----------------------------------------------
export async function saveSession(sess) {
  const i = S.sessions.findIndex(s => s.id === sess.id);
  if (i >= 0) S.sessions[i] = sess; else S.sessions.push(sess);
  S.sessions.sort(byDateDesc);
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
    sessions: S.sessions, body: S.body, cardio: S.cardio,
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
