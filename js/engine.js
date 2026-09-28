// Pure training logic. No DOM, no storage: safe to unit-test in Node.

export const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export const round = (x, step = 0.5) => Math.round(x / step) * step;
/** The heaviest load (kg) and most reps (or seconds, for timed sets) a set can have; anything above is a typo or junk. */
export const MAX_KG = 1500, MAX_REPS = 3600;
/** Names without hidden control or direction characters (which can disguise text), trimmed and length-capped. */
export const cleanText = (s, max = 80) => String(s ?? '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const fill = (n, v) => Array.from({ length: n }, () => v);
const EPS = 1e-6;

/** Epley estimate. Returns null when it can't be computed. */
export function e1rm(w, r) {
  if (!(w > 0) || !(r > 0)) return null;
  return r === 1 ? w : w * (1 + r / 30);
}

export const isKg = u => u === 'kg' || u === 'kg/DB';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
let zhDates = false;
/** Month names for dates inside suggestion text, set with the app language (ui.setDateLang). */
export const setEngineMonths = names => { MONTHS.splice(0, 12, ...names); zhDates = /月/.test(names[0]); };
export const shortDate = iso => (zhDates ? `${MONTHS[+iso.slice(5, 7) - 1]}${+iso.slice(8, 10)}日` : `${+iso.slice(8, 10)} ${MONTHS[+iso.slice(5, 7) - 1]}`);

/** Working sets of an entry: done and not warm-up. */
export function workSets(entry) {
  return (entry.sets || []).filter(s => s.done && !s.warm);
}

// ---- caches -----------------------------------------------------------------------
// Big histories (hundreds of sessions) make per-render scans add up, so derived data is cached per
// sessions array. A cache entry is trusted only while the array still holds the same session objects
// in the same order; state.js also calls invalidateCaches() whenever a session or exercise is saved,
// which covers edits made inside a session object.
let cacheGen = 0;
const caches = new WeakMap();
export function invalidateCaches() { cacheGen++; }
function cacheFor(sessions) {
  let c = caches.get(sessions);
  const ok = c && c.gen === cacheGen && c.snap.length === sessions.length && c.snap.every((x, i) => x === sessions[i]);
  if (!ok) { c = { gen: cacheGen, snap: sessions.slice(), m: new Map() }; caches.set(sessions, c); }
  return c.m;
}
/** Memoise fn() for this sessions array under a key; `dep` (an object) must also match. */
function memo(sessions, key, dep, fn) {
  const m = cacheFor(sessions);
  const hit = m.get(key);
  if (hit && hit.dep === dep) return hit.val;
  const val = fn();
  m.set(key, { dep, val });
  return val;
}
/** exId -> [{s, e}] in sessions order. */
function exIndex(sessions) {
  return memo(sessions, 'idx', null, () => {
    const idx = new Map();
    for (const s of sessions) for (const e of s.entries || []) {
      let l = idx.get(e.exId);
      if (!l) idx.set(e.exId, (l = []));
      l.push({ s, e });
    }
    return idx;
  });
}

/** Past exposures of an exercise, newest first.
 *  For exercises flagged perGym (machines, cables), only sessions at the same gym count. */
export function exposures(sessions, ex, { gymId = null, before = null } = {}) {
  const out = [];
  for (const { s, e } of exIndex(sessions).get(ex.id) || []) {
    if (before && s.date > before) continue;
    if (ex.perGym && gymId && s.gymId && s.gymId !== gymId) continue;
    const ws = workSets(e);
    if (ws.length) out.push({ date: s.date, sessionId: s.id, entry: e, sets: ws, pain: !!e.pain, rir: e.rir ?? null, approx: !!s.approx });
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Heaviest load in an exposure and the reps done at that load. */
export function topLoad(exp) {
  const w = Math.max(...exp.sets.map(s => +s.w || 0));
  const reps = exp.sets.filter(s => (+s.w || 0) === w).map(s => (s.r == null || s.r === '' || !Number.isFinite(+s.r) || +s.r <= 0 ? null : +s.r));
  return { w, reps };
}

/** Only recent history decides the trend, so an old peak from months ago doesn't flag a plateau. */
export const TREND_WINDOW_DAYS = 84;
function recentWindow(exps) {
  if (!exps.length || !exps[0].date) return exps;
  const cutoff = addDays(exps[0].date, -TREND_WINDOW_DAYS);
  return exps.filter(e => !e.date || e.date >= cutoff);
}

/** One comparable number per exposure, higher is better. */
export function score(exp, unit) {
  if (isKg(unit)) {
    let best = 0;
    for (const s of exp.sets) best = Math.max(best, e1rm(+s.w, +s.r) || 0);
    return best || null;
  }
  // Cable levels and bodyweight: load first, then total reps at that load.
  const { w, reps } = topLoad(exp);
  if (!reps.length || reps.some(r => r == null)) return null;
  return w * 1000 + reps.reduce((a, b) => a + b, 0);
}

/** Progress status from exposures (newest first).
 *  plateau: three comparable exposures without beating the best before them.
 *  watch: two in a row without improvement. */
export function trend(exps, unit) {
  const sc = recentWindow(exps).map(e => score(e, unit)).filter(v => v != null).reverse(); // oldest -> newest
  const n = sc.length;
  if (n < 2) return { status: n ? 'new' : 'none', scores: sc };
  const bestBefore = k => Math.max(...sc.slice(0, n - k));
  if (n >= 4 && Math.max(...sc.slice(-3)) <= bestBefore(3) + EPS) return { status: 'plateau', scores: sc };
  if (n >= 3 && Math.max(...sc.slice(-2)) <= bestBefore(2) + EPS) return { status: 'watch', scores: sc };
  if (sc[n - 1] > Math.max(...sc.slice(0, n - 1)) + EPS) return { status: 'up', scores: sc };
  if (sc[n - 1] < sc[n - 2] - EPS) return { status: 'down', scores: sc };
  return { status: 'flat', scores: sc };
}

/** Next load reachable with the available dumbbells (at or above target). */
export function snapLoad(w, ex, equip) {
  if (ex.unit === 'kg/DB' && equip?.dumbbells?.length) {
    const up = equip.dumbbells.filter(d => d >= w - EPS).sort((a, b) => a - b)[0];
    return up ?? Math.max(...equip.dumbbells);
  }
  return round(w, ex.unit === 'L' ? 1 : 0.25);
}

/** Largest reachable load at or below w (never rounds up). */
function snapDown(w, ex, equip) {
  if (ex.unit === 'kg/DB' && equip?.dumbbells?.length) {
    const d = equip.dumbbells.filter(x => x <= w + EPS).sort((a, b) => b - a)[0];
    return d ?? Math.min(...equip.dumbbells);
  }
  const step = Math.min(2.5, ex.inc > 0 ? ex.inc : 2.5);
  return Math.floor(w / step + EPS) * step;
}

// ---- display units -------------------------------------------------------------------
// Loads are always stored in kg. With lb chosen in Settings, kg loads are shown and typed in lb.
// Cable/machine levels are never converted.
export const LB_KG = 0.45359237;
let UNITS = 'kg';
let BW_LABEL = 'BW';
export function setUnits(u) { UNITS = u === 'lb' ? 'lb' : 'kg'; }
export const getUnits = () => UNITS;
/** Label used for bodyweight loads ("BW" in gym terms, "Bodyweight" in plain wording). */
export function setBwLabel(s) { BW_LABEL = s || 'BW'; }
/** kg -> display number (lb rounded to 0.5). Blank/invalid values pass through. */
export function toDisp(kg) {
  if (kg == null || kg === '' || !Number.isFinite(+kg)) return kg;
  return UNITS === 'lb' ? Math.round(+kg / LB_KG * 2) / 2 : +kg;
}
/** Display number -> kg (lb converted, kept to 3 decimals). Blank becomes null. */
export function fromDisp(v) {
  if (v == null || v === '') return null;
  if (!Number.isFinite(+v)) return v;
  return UNITS === 'lb' ? Math.round(+v * LB_KG * 1000) / 1000 : +v;
}
/** A kg step (increment, plate jump) as a tidy display step: lb snaps to 2.5 lb. */
export function stepDisp(kg) {
  return UNITS === 'lb' ? Math.max(2.5, Math.round(+kg / LB_KG / 2.5) * 2.5) : +(+kg).toFixed(2);
}
const dispNum = kg => String(+(+toDisp(kg)).toFixed(2));

export function fmtLoad(ex, w) {
  if (ex.unit === 'bw') return +w > 0 ? (BW_LABEL === 'BW' ? `BW+${dispNum(w)}` : `${BW_LABEL} + ${dispNum(w)} ${UNITS}`) : BW_LABEL;
  if (w == null || w === '') return '—';
  if (ex.unit === 'L') return 'L' + w;
  return dispNum(w);
}

export function unitShort(u) {
  return u === 'kg/DB' ? `${UNITS} ea` : u === 'kg' ? UNITS : '';
}

export function unitLong(u) {
  return u === 'kg/DB' ? `${UNITS} per dumbbell` : u === 'kg' ? `${UNITS} total` : u === 'L' ? 'cable/machine level' : 'bodyweight';
}

export function incLabel(ex, step = ex.inc || 1) {
  if (ex.unit === 'L') return `+${step} level`;
  if (ex.unit === 'bw') return `+${stepDisp(2.5)} ${UNITS}`;
  return `+${stepDisp(step)} ${UNITS}`;
}

/**
 * Suggest today's sets for a programme slot.
 * slot: {exId, sets, lo, hi}; ex: exercise; ctx: {sessions, gymId, poor, deload, equip, date}
 * Returns {t, w, reps[], why, rir}
 *   t: cal | check | log | hold | load | reps | plat | deload
 */
export function suggest(slot, ex, ctx) {
  const lo = Math.max(1, +slot.lo || 8), hi = Math.max(lo, +slot.hi || lo), n = Math.max(1, Math.round(+slot.sets) || 3);
  const mid = Math.round((lo + hi) / 2);
  const exps = exposures(ctx.sessions || [], ex, { gymId: ctx.gymId, before: ctx.date });
  const unitWord = ex.unit === 'L' ? ' level' : ' ' + UNITS;
  const caution = ex.caution ? ' ' + ex.caution : '';

  if (ex.unitUnclear) {
    const w = exps[0] ? topLoad(exps[0]).w : null;
    return { t: 'check', w, reps: fill(n, lo), rir: '1-2', why: 'Old entries for this lift mix per-side and total load. Pick one unit in the exercise settings so progress means something.' };
  }
  if (!exps.length) {
    const where = ex.perGym && ctx.gymId ? ' at this gym' : '';
    return { t: 'cal', w: null, reps: fill(n, mid), rir: '2', why: (ex.hint ? ex.hint + ' ' : '') + `No comparable log for this exercise${where}. Find a load for about ${mid} reps with 2 left in the tank. That becomes your baseline.` };
  }
  const last = exps[0];
  const { w, reps: lastReps } = topLoad(last);
  if (lastReps.some(r => r == null) || (ex.unit !== 'bw' && !(w > 0))) {
    const what = ex.unit !== 'bw' && !(w > 0) ? 'reps but no load' : `the load (${fmtLoad(ex, w)}) but no reps`;
    return { t: 'log', w: w > 0 ? w : null, reps: fill(n, lo), rir: '2', why: `Last log has ${what}. Log every set today to unlock suggestions.` };
  }
  const prev = lastReps.slice(0, n);
  while (prev.length < n) prev.push(prev[prev.length - 1]);
  const held = prev.map(x => Math.min(x, hi));

  if (ctx.deload) {
    const dn = Math.max(1, Math.round(n * 0.55));
    let dw = w;
    if (isKg(ex.unit)) {
      dw = snapDown(w * 0.9, ex, ctx.equip);
      if (!(dw < w) || dw <= 0) dw = snapDown(w * 0.8, ex, ctx.equip) || w;
    } else if (ex.unit === 'L') dw = Math.max(1, w - (ex.inc || 1));
    return { t: 'deload', w: dw, reps: fill(dn, lo), rir: '3-4', why: 'Deload week: about half the sets at roughly 85–90% of normal load, 3–4 reps in reserve. No strength testing.' };
  }
  if (ctx.poor) {
    return { t: 'hold', w, reps: held, rir: '2-3', why: 'Low readiness today. Repeat last load and reps and stop 2–3 reps short of failure.' };
  }
  if (last.pain) {
    return { t: 'hold', w, reps: held, rir: '2-3', why: `You flagged pain on this lift last time (${shortDate(last.date)}). Hold the load and stop if it returns.` };
  }
  // Last set went to failure (0 reps left) and reps fell below the range: keep the load, no +1 rep.
  const failedShort = String(last.rir) === '0' && lastReps.slice(0, n).some(x => x < lo);
  if (failedShort) {
    const next0 = prev.map(x => clamp(x, lo, hi));
    return { t: 'reps', w, reps: next0, rir: '1-2', why: `Last time the final set went to failure (0 reps left) and reps fell short of ${lo}–${hi}. Same load; aim to get every set into the range with a rep or two to spare.${caution}` };
  }
  // Only add load when every planned set actually reached the top (a single logged set doesn't count for three).
  if (lastReps.length >= n && lastReps.slice(0, n).every(x => x >= hi)) {
    if (ex.unit === 'bw') {
      return { t: 'load', w: w + 2.5, inc: 2.5, reps: fill(n, lo), rir: '1-3', why: `Every set reached ${hi}. Add ${stepDisp(2.5)} ${UNITS} with a belt (or slow the tempo); reps drop back toward ${lo}.` };
    }
    const nw = snapLoad(w + (ex.inc || 1), ex, ctx.equip);
    if (!(nw > w + EPS)) {
      return { t: 'reps', w, reps: fill(n, hi), rir: '1-2', why: `Every set reached ${hi}, but there's no heavier dumbbell in your equipment list. Add a set, slow the lowering to 3 seconds, or switch to a harder variation.` };
    }
    const step = +(nw - w).toFixed(2);
    const per = ex.unit === 'L' ? ' level' : ex.unit === 'kg/DB' ? ` ${UNITS} per dumbbell` : ' ' + UNITS;
    return { t: 'load', w: nw, inc: step, reps: fill(n, lo), rir: '1-3', why: `Every set reached ${hi} last time. Add ${ex.unit === 'L' ? step : stepDisp(step)}${per} and let reps drop back toward ${lo}.${caution}` };
  }
  const next = prev.map(x => clamp(x + 1, lo, hi));
  const tr = trend(exps, ex.unit);
  if (tr.status === 'plateau' || tr.status === 'watch') {
    const why = tr.status === 'plateau'
      ? `No gain in load or clean reps for 3 comparable sessions. Check sleep, effort and exercise order; if it stays flat, a deload or a variation swap is reasonable.${caution}`
      : `Two sessions without beating your best on this lift. One more flat session confirms a plateau. Log RIR on every set.${caution}`;
    return { t: 'plat', status: tr.status, w, reps: next, rir: '1-2', why };
  }
  return { t: 'reps', w, reps: next, rir: '1-3', why: `Last time ${lastReps.join('·')} at ${fmtLoad(ex, w)}${unitShort(ex.unit) ? ' ' + unitShort(ex.unit) : ''}. Keep the load and add a rep per set until all ${n} sets reach ${hi}, then add ${ex.unit === 'L' ? ex.inc || 1 : stepDisp(ex.inc || 1)}${unitWord}.${caution}` };
}

/** What to do next time, judged from a just-finished entry. */
export function nextFor(entry, slot, ex) {
  const d = workSets(entry);
  if (!d.length) return { t: 'none', text: 'Not logged' };
  if (entry.pain) return { t: 'hold', text: 'Pain flagged · hold load' };
  if (!slot) return { t: 'reps', text: 'Logged' };
  const lo = +slot.lo, hi = +slot.hi, sets = +slot.sets;
  const { reps } = topLoad({ sets: d });
  if (reps.some(r => r == null)) return { t: 'log', text: 'Reps missing' };
  if (reps.length >= sets && reps.every(r => r >= hi)) return { t: 'load', text: `${incLabel(ex)} next time` };
  if (reps.some(r => r < lo)) return { t: 'hold', text: 'Below range · repeat load' };
  return { t: 'reps', text: '+1 rep next time' };
}

/** Volume in kg. Dumbbell loads count both hands. Cable levels and bodyweight return 0. */
export function volume(ex, sets) {
  if (!isKg(ex.unit)) return 0;
  const k = ex.unit === 'kg/DB' ? 2 : 1;
  return sets.reduce((a, s) => a + (+s.w || 0) * (+s.r || 0) * k, 0);
}

/** Warm-up ramp toward a working load. */
export function warmup(w, ex, equip) {
  if (!isKg(ex.unit) || !(w > 0)) return [];
  const barbell = ex.equip === 'barbell' || ex.equip === 'smith';
  const bar = barbell ? (ex.equip === 'smith' ? (equip?.smithBarKg ?? equip?.barKg ?? 20) : (equip?.barKg ?? 20)) : 0;
  const steps = w >= 40 ? [[0.4, 8], [0.6, 5], [0.8, 3]] : w >= 15 ? [[0.5, 8], [0.75, 4]] : [[0.6, 8]];
  const out = [];
  // Barbell and Smith lifts start with the empty bar.
  if (barbell && bar > 0 && bar < w - EPS) out.push({ w: bar, r: 10, warm: true, done: false });
  for (const [p, r] of steps) {
    let x = Math.max(bar, p * w);
    x = ex.unit === 'kg/DB' ? snapDown(x, ex, equip) : round(x, 2.5);
    if (x >= w || x <= 0 || (out.length && out[out.length - 1].w === x)) continue;
    out.push({ w: x, r, warm: true, done: false });
  }
  return out;
}

/** Plates per side for barbell/Smith loads, greedy with the available plates. */
export function platesPerSide(total, barKg, plates) {
  let rem = (total - barKg) / 2;
  if (rem < -EPS) return { ok: false, plates: [], rem: +rem.toFixed(3) };
  const res = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    while (rem >= p - EPS) { res.push(p); rem -= p; }
  }
  return { ok: Math.abs(rem) < 1e-6, plates: res, rem: +rem.toFixed(3) };
}

/** Closest available dumbbell to a target. */
export function nearestDumbbell(w, dumbbells) {
  if (!dumbbells?.length) return null;
  return dumbbells.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a));
}

/** Weekly direct sets per muscle from a programme. */
export function weeklySets(program, exById) {
  const t = {};
  for (const d of program.days) for (const s of d.slots) {
    const ex = exById[s.exId];
    if (!ex) continue;
    for (const m of ex.muscles || []) t[m] = (t[m] || 0) + (+s.sets || 0);
  }
  return t;
}

export const MUSCLES = ['Chest', 'Back', 'Quads', 'Hamstrings', 'Glutes', 'Front delts', 'Side delts', 'Rear delts', 'Biceps', 'Triceps', 'Calves', 'Abs', 'Forearms', 'Neck'];

/** Per-muscle trend from the most recently trained lift with 2+ scoreable exposures. */
export function muscleTrends(sessions, exercises) {
  return memo(sessions, 'trends', exercises, () => muscleTrendsRaw(sessions, exercises));
}
function muscleTrendsRaw(sessions, exercises) {
  const out = [];
  for (const m of MUSCLES) {
    let best = null;
    for (const ex of exercises) {
      if ((ex.muscles || [])[0] !== m) continue;
      const exps = exposures(sessions, ex).filter(e => score(e, ex.unit) != null);
      if (exps.length < 2) continue;
      if (!best || exps[0].date > best.exps[0].date || (exps[0].date === best.exps[0].date && exps.length > best.exps.length)) best = { ex, exps };
    }
    if (!best) continue;
    const exps = best.exps.slice(0, 8);
    const tr = trend(exps, best.ex.unit);
    out.push({ muscle: m, ex: best.ex, status: tr.status, scores: tr.scores, from: topLoad(exps[exps.length - 1]), to: topLoad(exps[0]), n: exps.length });
  }
  return out;
}

const DAY = 86400000;
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
export const dowOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay();

/** Monday-based week start. */
export function weekStart(iso) {
  return addDays(iso, -((dowOf(iso) + 6) % 7));
}

/** Deload triggers from the programme notes. */
export function deloadCheck(sessions, exercises, today) {
  const recent = sessions.filter(s => !s.seed && s.date <= today && daysBetween(s.date, today) <= 14);
  const reasons = [];
  const falling = [];
  const last3w = sessions.filter(s => s.date <= today && daysBetween(s.date, today) <= 21);
  for (const ex of exercises) {
    const exps = exposures(last3w, ex);
    if (exps.length < 3) continue;
    const sc = exps.slice(0, 3).map(e => score(e, ex.unit));
    if (sc.some(v => v == null)) continue;
    if (sc[0] < sc[1] - EPS && sc[1] < sc[2] - EPS) falling.push(ex.name);
  }
  if (falling.length) reasons.push(`Performance fell two sessions running on ${falling.slice(0, 3).join(', ')}`);
  // Lifts trained in the last 2 weeks with no progress for 3 sessions (a plateau).
  const upto = sessions.filter(s => s.date <= today);
  const stuck = [];
  let active = 0;
  for (const ex of exercises) {
    const exps = exposures(upto, ex);
    if (exps.length < 4 || daysBetween(exps[0].date, today) > 14) continue;
    active++;
    if (trend(exps.slice(0, 8), ex.unit).status === 'plateau') stuck.push(ex.name);
  }
  // Accessories stall all the time; only a broad stall (3+ lifts and 30%+ of what you train) points to fatigue.
  const broad = stuck.length >= 3 && stuck.length >= 0.3 * active;
  if (stuck.length >= 2) reasons.push(`${stuck.length} lifts stuck for 3 sessions (${stuck.slice(0, 3).join(', ')})`);
  const painEx = new Set();
  for (const s of recent) for (const e of s.entries || []) if (e.pain) painEx.add(e.exId);
  if (painEx.size >= 2) reasons.push(`Pain flagged on ${painEx.size} different exercises in the last 2 weeks`);
  const low = recent.filter(s => s.feel != null && s.feel <= 2).length;
  if (low >= 3) reasons.push(`${low} sessions rated low energy or motivation in the last 2 weeks`);
  const tired = recent.filter(s => s.readiness?.sleep === '<6').length;
  if (tired >= 3) reasons.push(`${tired} sessions after under 6 h sleep in the last 2 weeks`);
  return { should: falling.length >= 2 || broad || reasons.length >= 2, reasons };
}

/** Least-squares slope in units per week from [{date, v}]. */
export function weeklyRate(points) {
  if (points.length < 2) return null;
  const t0 = Date.parse(points[0].date);
  const xs = points.map(p => (Date.parse(p.date) - t0) / (7 * DAY)), ys = points.map(p => +p.v);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? num / den : null;
}

/**
 * Compare exposure i (newest-first list) with the one before it.
 * Returns {dir: first|up|down|same, kind: load|reps|sets, text, pr, prevDate}. Load changes win over rep changes;
 * a changed load is reported as the load step, not as better/worse strength.
 */
export function compareExposure(exps, i, unit) {
  const cur = exps[i], prev = exps[i + 1];
  if (!cur) return null;
  const sc = score(cur, unit);
  const older = exps.slice(i + 1).map(e => score(e, unit)).filter(v => v != null);
  const pr = sc != null && older.length > 0 && sc > Math.max(...older) + EPS;
  if (!prev) return { dir: 'first', text: 'first log', pr: false };
  const a = topLoad(cur), b = topLoad(prev);
  const unitWord = unit === 'L' ? ' lvl' : ' ' + UNITS;
  if (Math.abs(a.w - b.w) > EPS) {
    const d = unit === 'L' ? +(a.w - b.w).toFixed(2) : +(toDisp(a.w) - toDisp(b.w)).toFixed(2);
    return { dir: d > 0 ? 'up' : 'down', kind: 'load', text: `${d > 0 ? '+' : ''}${d}${unitWord}`, pr, prevDate: prev.date };
  }
  // Reps are compared set by set over the sets both sessions have; a different set count is reported separately.
  const k = Math.min(a.reps.length, b.reps.length);
  const sum = r => r.slice(0, k).reduce((x, y) => x + (y || 0), 0);
  const d = sum(a.reps) - sum(b.reps), ds = a.reps.length - b.reps.length;
  const setTxt = ds ? `${ds > 0 ? '+' : '−'}${Math.abs(ds)} set${Math.abs(ds) === 1 ? '' : 's'}` : '';
  if (!d && !ds) return { dir: 'same', kind: 'reps', text: 'same as last', pr, prevDate: prev.date };
  const repTxt = d ? `${d > 0 ? '+' : ''}${d} rep${Math.abs(d) === 1 ? '' : 's'}` : 'same reps';
  const dir = d ? (d > 0 ? 'up' : 'down') : ds > 0 ? 'up' : 'down';
  return { dir, kind: d ? 'reps' : 'sets', text: setTxt ? `${repTxt} · ${setTxt}` : repTxt, pr, prevDate: prev.date };
}

/** Personal records per exercise: heaviest load and best e1RM. */
export function personalBests(exps, unit) {
  let heavy = null, best = null;
  for (const e of exps) for (const s of e.sets) {
    if (s.r == null) continue;
    if (!heavy || +s.w > heavy.w) heavy = { w: +s.w, r: +s.r, date: e.date };
    if (isKg(unit)) {
      const v = e1rm(+s.w, +s.r);
      if (v && (!best || v > best.v)) best = { v, w: +s.w, r: +s.r, date: e.date };
    }
  }
  return { heavy, best };
}

// ---- XP & levels -------------------------------------------------------------------
// Every hard (working) set earns XP: 10 for the main muscle, 5 for each helper muscle.
// Beating your best estimated max (or load × reps for levels/bodyweight) on a lift earns a bonus.
export const XP_SET = 10, XP_HELPER = 5, XP_PR = 40;

/** Cumulative XP needed to reach level L (level 1 starts at 0). */
export const xpForLevel = L => 50 * (L - 1) * L;
export function levelFor(xp) {
  let L = 1;
  while (xp >= xpForLevel(L + 1)) L++;
  const base = xpForLevel(L), next = xpForLevel(L + 1);
  return { level: L, xp, base, next, into: xp - base, need: next - base, pct: (xp - base) / (next - base) };
}
export const TITLES = [[1, 'Rookie'], [3, 'Apprentice'], [5, 'Solid'], [7, 'Strong'], [10, 'Beast'], [14, 'Elite'], [20, 'Legend']];
export const titleFor = L => TITLES.filter(([l]) => L >= l).pop()[1];

/**
 * XP per muscle from all sessions, oldest first.
 * Returns {muscles: {name: {xp, week, events:[{date, xp, why}], lastDate}}, total, levelUps:[{date, muscle, level}]}
 */
export function muscleXP(sessions, exById, today = null) {
  return memo(sessions, 'xp|' + today, exById, () => muscleXPRaw(sessions, exById, today));
}
function muscleXPRaw(sessions, exById, today) {
  const out = {}, best = {}, levelUps = [];
  const get = m => (out[m] ||= { xp: 0, week: 0, events: [], lastDate: null });
  const chron = [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.end || 0) - (b.end || 0)));
  const weekFrom = today ? addDays(today, -6) : null;
  for (const s of chron) {
    if (today && s.date > today) continue;
    const gain = {};
    const why = {};
    const sets = {};
    for (const e of s.entries || []) {
      const ex = exById[e.exId];
      if (!ex) continue;
      const ws = workSets(e).filter(x => x.r != null && +x.r > 0);
      if (!ws.length) continue;
      const ms = ex.muscles || [];
      ms.forEach((m, i) => { gain[m] = (gain[m] || 0) + ws.length * (i === 0 ? XP_SET : XP_HELPER); });
      ms.forEach(m => { (sets[m] ||= 0); sets[m] += ws.length; });
      const sc = score({ sets: ws }, ex.unit);
      // Machines and cables are only compared with themselves at the same gym.
      const key = ex.perGym && s.gymId ? `${ex.id}@${s.gymId}` : ex.id;
      if (sc != null) {
        if (best[key] != null && sc > best[key] + EPS) {
          ms.forEach((m, i) => { gain[m] = (gain[m] || 0) + (i === 0 ? XP_PR : XP_PR / 2); (why[m] ||= []).push(`PR on ${ex.name}`); });
        }
        best[key] = Math.max(best[key] ?? -Infinity, sc);
      }
    }
    for (const [m, g] of Object.entries(gain)) {
      const rec = get(m);
      const before = levelFor(rec.xp).level;
      rec.xp += g;
      rec.lastDate = s.date;
      if (weekFrom && s.date >= weekFrom) rec.week += g;
      const n = sets[m] || 0;
      rec.events.push({ date: s.date, xp: g, sets: n, pr: !!why[m], why: `${n} set${n === 1 ? '' : 's'} · ${why[m] ? why[m].join(', ') : s.name}`, sessionId: s.id, session: s.name });
      const after = levelFor(rec.xp).level;
      if (after > before) levelUps.push({ date: s.date, muscle: m, level: after, imported: !!(s.imported || s.seed) });
    }
  }
  const total = Object.values(out).reduce((a, r) => a + r.xp, 0);
  return { muscles: out, total, levelUps };
}

/** XP a programme day would earn if every planned set is done (no PR bonus). {muscle: xp} */
export function plannedXP(day, exById) {
  const out = {};
  for (const sl of day?.slots || []) {
    const ex = exById[sl.exId];
    if (!ex) continue;
    (ex.muscles || []).forEach((m, i) => { out[m] = (out[m] || 0) + (+sl.sets || 0) * (i === 0 ? XP_SET : XP_HELPER); });
  }
  return out;
}

/** XP earned per session id: {sessionId: {total, muscles: {m: xp}}} */
export function xpBySession(data) {
  const out = {};
  for (const [m, r] of Object.entries(data.muscles)) for (const e of r.events) {
    const o = (out[e.sessionId] ||= { total: 0, muscles: {} });
    o.total += e.xp; o.muscles[m] = (o.muscles[m] || 0) + e.xp;
  }
  return out;
}

/** Overall athlete level: slower curve on total XP. */
export function athleteLevel(total) {
  const r = levelFor(total / 4);
  return { ...r, xp: total, base: r.base * 4, next: r.next * 4, into: total - r.base * 4, need: (r.next - r.base) * 4 };
}

// ---- workout duration ----------------------------------------------------------------
// Every ticked set gets a timestamp (`at`). The gap between two ticks on the same exercise is
// one "set cycle" (rest + the set). We learn your real cycle per exercise from history.
const median = xs => { const a = [...xs].sort((x, y) => x - y); const n = a.length; return n ? (n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2) : null; };
export const TRANSITION_SEC = 75;   // moving to the next exercise, setting up
export const SET_WORK_SEC = 40;     // time under the bar when no history exists

/** Seconds from one set to the next for an exercise: learned median, else rest + work. */
export function setCycleSec(ex, sessions) {
  const gaps = [];
  for (const { e } of exIndex(sessions).get(ex.id) || []) {
    const ts = (e.sets || []).filter(x => x.done && !x.warm && x.at).map(x => x.at).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) {
      const g = (ts[i] - ts[i - 1]) / 1000;
      if (g >= 20 && g <= 600) gaps.push(g); // ignore double-taps and long interruptions
    }
  }
  const m = median(gaps.slice(0, 30)); // sessions are newest first: learn from the recent ones
  return m ?? (ex.rest || 90) + SET_WORK_SEC;
}

/** Planned length of a programme day in seconds. Uses past durations of the same workout when available. */
export function estimateDay(day, exById, sessions) {
  let sec = 0;
  day.slots.forEach((sl, i) => {
    const ex = exById[sl.exId];
    if (!ex) return;
    sec += (+sl.sets || 0) * setCycleSec(ex, sessions) + (i ? TRANSITION_SEC : 0);
  });
  const past = sessions.filter(s => s.name === day.name && s.start && s.end && s.end > s.start).map(s => (s.end - s.start) / 1000).filter(x => x > 300 && x < 4 * 3600);
  const m = median(past.slice(0, 6));
  return m ? Math.round(0.5 * sec + 0.5 * m) : Math.round(sec);
}

/**
 * Time left in a running workout, in seconds.
 * Based on the planned sets still to do × each exercise's expected set cycle. Today's actual pace is
 * blended in only once there is enough of it (5+ work sets over 8+ minutes), and then only partly,
 * so a few quick early sets can't halve the estimate.
 */
export const PACE_MIN_SETS = 5, PACE_MIN_SEC = 8 * 60;
export function estimateRemaining(entries, exById, sessions, now = Date.now(), start = null) {
  let left = 0, plannedDone = 0, firstAt = Infinity, lastAt = 0, doneCount = 0;
  entries.forEach((e, i) => {
    const ex = exById[e.exId];
    if (!ex) return;
    const cyc = setCycleSec(ex, sessions);
    const work = e.sets.filter(s => !s.warm);
    const todo = work.filter(s => !s.done).length, done = work.length - todo;
    if (todo) left += todo * cyc + (done === 0 && i > 0 ? TRANSITION_SEC : 0);
    for (const s of work) if (s.done && s.at) { firstAt = Math.min(firstAt, s.at); lastAt = Math.max(lastAt, s.at); doneCount++; plannedDone += cyc; }
  });
  let pace = 1;
  const span = isFinite(firstAt) ? (lastAt - firstAt) / 1000 : 0;
  if (doneCount >= PACE_MIN_SETS && span >= PACE_MIN_SEC && plannedDone > 0) {
    // n ticks span n-1 set cycles.
    const ratio = clamp(span / (plannedDone * (doneCount - 1) / doneCount), 0.75, 1.4);
    const weight = Math.min(0.6, doneCount / 20);
    pace = 1 + (ratio - 1) * weight;
  }
  return Math.round(left * pace);
}

// ---- short sessions -------------------------------------------------------------------
export const SESSION_LENGTHS = [20, 30, 45];

/** Raw plan length in seconds for per-slot set counts (no blend with past durations). */
export function planSec(slots, counts, exById, sessions) {
  let sec = 0, first = true;
  slots.forEach((sl, i) => {
    const ex = exById[sl.exId], n = +counts[i] || 0;
    if (!ex || !n) return;
    sec += n * setCycleSec(ex, sessions) + (first ? 0 : TRANSITION_SEC);
    first = false;
  });
  return Math.round(sec);
}

/**
 * Trim a day to fit about `minutes`. counts: planned work sets per slot (e.g. after a deload).
 * Priority: the first two exercises are the main lifts. In order: accessories lose sets down to 2,
 * then accessories are dropped from the end, then main lifts go down to 2 sets, then to 1.
 * Returns new counts; 0 means skipped today. No minutes (full) returns the counts unchanged.
 */
export function trimToFit(slots, counts, exById, sessions, minutes) {
  const out = counts.map(n => +n || 0);
  if (!(minutes > 0)) return out;
  const target = minutes * 60;
  const est = () => planSec(slots, out, exById, sessions);
  if (est() <= target) return out;
  const idx = out.map((n, i) => i).filter(i => exById[slots[i].exId] && out[i] > 0);
  const main = idx.slice(0, 2), acc = idx.slice(2);
  const shave = (list, floor) => {
    let changed = true;
    while (est() > target && changed) {
      changed = false;
      for (const i of [...list].reverse()) {
        if (out[i] > floor) { out[i]--; changed = true; if (est() <= target) return; }
      }
    }
  };
  shave(acc, 2);
  for (const i of [...acc].reverse()) { if (est() <= target) break; out[i] = 0; }
  shave(main, 2);
  shave(main, 1);
  return out;
}
