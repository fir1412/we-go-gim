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

/** Machines and cables differ from gym to gym and rep-max formulas don't carry over to them, so only free
 *  weights (barbell, Smith, dumbbells) get an estimated one-rep max. The name check covers imported lifts
 *  whose equipment was guessed as "machine". */
const TIMED_IDS = new Set(['farmer', 'suitcase', 'platepinch', 'deadhang', 'plank', 'sideplank', 'hollow', 'wallsit']);
const TIMED_NAME = /seconds as reps|\b(farmer'?s?|suitcase) (carry|walk)|plate pinch|dead ?hang|plank|wall ?sit|hollow (hold|body)/i;
/** Holds and carries logged as seconds in the reps box: rep-max formulas mean nothing for them. */
export function isTimed(ex) {
  return !!ex && (ex.timed === true || TIMED_IDS.has(ex.id) || TIMED_NAME.test(ex.name || ''));
}

export function hasEstMax(ex) {
  if (!ex || !isKg(ex.unit) || ex.perGym || ex.equip === 'cable' || isTimed(ex)) return false;
  return ex.equip !== 'machine' || /\b(barbell|smith|dumbbells?|db|ez)\b/i.test(ex.name || '');
}

/** Machine loads in kg: the top load, with the reps done at it as a tie-breaker that never moves the kg shown. */
function loadScore(exp) {
  const { w, reps } = topLoad(exp);
  if (!reps.length || reps.some(r => r == null)) return null;
  return w + Math.min(999, reps.reduce((a, b) => a + b, 0)) / 1e4;
}

/** The number a lift's trend is judged (and shown) on: estimated max for free weights, top load for kg machines,
 *  level/bodyweight load plus reps otherwise. */
export function trendScore(exp, ex) {
  return isKg(ex.unit) && !hasEstMax(ex) ? loadScore(exp) : score(exp, ex.unit);
}

/** How much lower (or higher) the latest number must be than the first one in the window to count as a real change. */
export const TREND_BAND = 0.05;

/**
 * Progress status from exposures (newest first). `unitOrEx` is a unit ('kg', 'L', …) or an exercise, which
 * scores machines on their load instead of an estimated max.
 * The label always agrees with the numbers shown: `from` is the first comparable exposure in the recent window
 * and `to` the latest, and `scores` runs from `from` to `to`.
 *  down: latest clearly lower than the start (more than TREND_BAND).  up: latest clearly higher, or higher and not stalled.
 *  plateau / watch (also in `stall`, used for advice): three / two comparable exposures without beating the best
 *  before them, while the numbers stay within the band.  flat: otherwise.
 */
export function trend(exps, unitOrEx) {
  const fn = typeof unitOrEx === 'object' && unitOrEx ? e => trendScore(e, unitOrEx) : e => score(e, unitOrEx);
  const pts = recentWindow(exps).map(e => ({ e, v: fn(e) })).filter(p => p.v != null).reverse(); // oldest -> newest
  const sc = pts.map(p => p.v);
  const n = sc.length;
  const base = { scores: sc, n, from: n ? sc[0] : null, to: n ? sc[n - 1] : null, fromExp: n ? pts[0].e : null, toExp: n ? pts[n - 1].e : null };
  if (n < 2) return { ...base, status: n ? 'new' : 'none', stall: null };
  const bestBefore = k => Math.max(...sc.slice(0, n - k));
  const stall = n >= 4 && Math.max(...sc.slice(-3)) <= bestBefore(3) + EPS ? 'plateau'
    : n >= 3 && Math.max(...sc.slice(-2)) <= bestBefore(2) + EPS ? 'watch' : null;
  const from = sc[0], to = sc[n - 1];
  let status;
  if (to < from * (1 - TREND_BAND) - EPS) status = 'down';
  else if (to > from * (1 + TREND_BAND) + EPS) status = 'up';
  else if (stall) status = stall;
  else if (to > from + EPS) status = 'up';
  else status = 'flat';
  return { ...base, status, stall };
}

/** "82 → 67.2 kg", "L12 × 10·10 → L11 × 12·12", "Bodyweight + 20 kg → Bodyweight + 25 kg" for a trend from
 *  trend() or muscleTrends(). Uses the same two exposures the status was judged on. */
export function trendRange(ex, tr) {
  if (!tr?.fromExp || !tr.toExp) return '';
  const num = (v, alt) => (typeof v === 'number' ? v : alt);
  const d1 = kg => String(+(+toDisp(kg)).toFixed(1));
  if (hasEstMax(ex)) return `${d1(num(tr.from, tr.fromScore))} → ${d1(num(tr.to, tr.toScore))}${unitShort(ex.unit) ? ' ' + unitShort(ex.unit) : ''}`;
  const a = topLoad(tr.fromExp), b = topLoad(tr.toExp);
  const u = isKg(ex.unit) && unitShort(ex.unit) ? ' ' + unitShort(ex.unit) : '';
  // Same load at both ends (or bodyweight with nothing added): the reps tell the story.
  if (Math.abs(a.w - b.w) < EPS) {
    const side = x => `${fmtLoad(ex, x.w)}${u} × ${x.reps.map(r => r ?? '?').join('·')}`;
    return `${side(a)} → ${side(b)}`;
  }
  return `${fmtLoad(ex, a.w)} → ${fmtLoad(ex, b.w)}${u}`;
}

/** Next load reachable with the available dumbbells (at or above target). */
export function snapLoad(w, ex, equip) {
  if (ex.unit === 'kg/DB' && equip?.dumbbells?.length) {
    const up = equip.dumbbells.filter(d => d >= w - KG_TOL).sort((a, b) => a - b)[0];
    return up ?? Math.max(...equip.dumbbells);
  }
  if (lbMode(ex)) return lbSnap(w);
  return round(w, ex.unit === 'L' ? 1 : 0.25);
}

/** Largest reachable load at or below w (never rounds up). */
function snapDown(w, ex, equip) {
  if (ex.unit === 'kg/DB' && equip?.dumbbells?.length) {
    const d = equip.dumbbells.filter(x => x <= w + KG_TOL).sort((a, b) => b - a)[0];
    return d ?? Math.min(...equip.dumbbells);
  }
  if (lbMode(ex)) return lbSnap(w, 'down');
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
/** kg -> display number (lb rounded to 0.5, kg to 0.01 so loads entered in lb never show as 13.381). Blank/invalid values pass through. */
export function toDisp(kg) {
  if (kg == null || kg === '' || !Number.isFinite(+kg)) return kg;
  return UNITS === 'lb' ? Math.round(+kg / LB_KG * 2) / 2 : Math.round(+kg * 100) / 100;
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
const kg2 = x => Math.round(x * 100) / 100;
/** A load typed or stepped on screen -> kg to store, rounded to 0.01 kg (still shows as the same lb number). */
export function kgFromDisp(v) {
  const kg = fromDisp(v);
  return typeof kg === 'number' && Number.isFinite(kg) ? kg2(kg) : kg;
}

/**
 * One −/+ step on a load (kg in, kg out) for the workout screen.
 * Dumbbells with a rack listed step to the next dumbbell the user owns. In lb, the step is a tidy lb step and
 * the result is stored to 0.01 kg. In kg, a load left over from lb (off the 0.25 kg grid) snaps to the step grid.
 * Cable levels step plainly. Never below 0.
 */
export function stepLoad(w, ex, dir, { step = ex?.inc || 2.5, dumbbells = null } = {}) {
  const cur = Math.max(0, +w || 0), d = dir < 0 ? -1 : 1;
  if (ex?.unit === 'kg/DB' && dumbbells?.length) {
    const rack = [...new Set(dumbbells.map(Number).filter(x => x > 0))].sort((a, b) => a - b);
    const nx = d > 0 ? rack.find(x => x > cur + KG_TOL) : rack.filter(x => x < cur - KG_TOL).pop();
    if (nx != null) return nx;
  }
  if (ex?.unit === 'L') return Math.max(0, +(cur + step * d).toFixed(2));
  if (UNITS === 'lb') return Math.max(0, kgFromDisp(Math.max(0, (+toDisp(cur) || 0) + stepDisp(step) * d)));
  const offGrid = Math.abs(cur * 4 - Math.round(cur * 4)) > 0.01;
  if (offGrid && step > 0) {
    const n = d > 0 ? Math.floor(cur / step + EPS) + 1 : Math.ceil(cur / step - EPS) - 1;
    return Math.max(0, +(n * step).toFixed(2));
  }
  return Math.max(0, +(cur + step * d).toFixed(2));
}

/** Bars that are not the Olympic bar: their weight varies (EZ bar about 7 to 10 kg, trap bar 20 to 30 kg). */
const ODD_BAR_IDS = new Set(['ezcurl', 'trapdl', 'skull']); // skull crushers are usually done with an EZ bar
const ODD_BAR_NAME = /\b(ez|trap|hex)\b/i;
export const isOddBar = ex => ex?.equip === 'barbell' && !/\b(straight|olympic)\b/i.test(ex.name || '') && (ODD_BAR_IDS.has(ex.id) || ODD_BAR_NAME.test(ex.name || ''));
/**
 * Bar weight in kg for plate maths and warm-ups: the Smith bar, the Olympic bar, 0 for non-barbell lifts,
 * and null (unknown) for EZ and trap bars unless the user set `equip.ezBarKg`.
 */
export function barKgFor(ex, equip) {
  if (ex?.equip === 'smith') return +(equip?.smithBarKg ?? equip?.barKg ?? 20);
  if (ex?.equip !== 'barbell') return 0;
  if (isOddBar(ex)) {
    const trap = ex.id === 'trapdl' || /\b(trap|hex)\b/i.test(ex.name || '');
    return !trap && +equip?.ezBarKg > 0 ? +equip.ezBarKg : null;
  }
  return +(equip?.barKg ?? 20);
}

// ---- stale drafts and rest timers (a draft left overnight, or the phone clock changed) --------------------
export const STALE_DRAFT_MS = 12 * 3600000, MAX_REST_MS = 3600000;
/** Minutes since a workout started, and whether the start is too long ago (or in the future) to count as a clock. */
export function draftClock(start, now = Date.now()) {
  if (!(+start > 0)) return { mins: 0, stale: false };
  const ms = now - start;
  return { mins: Math.max(0, Math.floor(ms / 60000)), stale: ms > STALE_DRAFT_MS || ms < -60000 };
}
/** A rest timer ending more than an hour from now (the clock went back) or with no valid end: treat it as closed. */
export function timerStale(t, now = Date.now()) {
  if (!t) return false;
  return !Number.isFinite(+t.end) || +t.end - now > MAX_REST_MS;
}

/**
 * Move a workout entry up (dir -1) or down (dir 1) without splitting a superset: all members of its group
 * move together, and a single exercise jumps over a whole superset. Returns a new array, or null when it
 * can't move. A superset that is already split is joined up at its first member.
 */
export function moveEntry(entries, i, dir) {
  const a = entries || [], e = a[i];
  if (!e) return null;
  const key = x => x?.slot?.group || null;
  const size = g => (g ? a.filter(x => key(x) === g).length : 0);
  const unit = x => (size(key(x)) > 1 ? a.filter(y => key(y) === key(x)) : [x]);
  const block = unit(e);
  const start = a.indexOf(block[0]);
  const rest = a.filter(x => !block.includes(x));
  let at = a.slice(0, start).filter(x => !block.includes(x)).length;
  const split = block.some((x, k) => a.indexOf(x) !== start + k);
  if (!split) {
    if (dir < 0) {
      if (at === 0) return null;
      const g = key(rest[at - 1]);
      at--;
      if (size(g) > 1) while (at > 0 && key(rest[at - 1]) === g) at--;
    } else {
      if (at >= rest.length) return null;
      const g = key(rest[at]);
      at++;
      if (size(g) > 1) while (at < rest.length && key(rest[at]) === g) at++;
    }
  }
  rest.splice(at, 0, ...block);
  return rest;
}

// lb mode: loads are worked out in lb and stored back as kg (3 decimals), which always shows as the same lb.
/** Barbell totals move in 5 lb (a 2.5 lb plate per side); dumbbells and machines use the same 5 lb grid. */
export const LB_STEP = 5;
/** kg values stored from lb carry up to 0.0005 kg of rounding; comparisons allow for it. */
const KG_TOL = 0.01;
const lbMode = ex => UNITS === 'lb' && isKg(ex?.unit);
/** A kg load in lb, cleaned of the 3-decimal storage rounding (45.359 kg -> 100 lb). */
const lbOf = kg => Math.round(+kg / LB_KG * 100) / 100;
const lbToKg = lb => Math.round(lb * LB_KG * 1000) / 1000;
/** kg load snapped to the lb grid ('near', 'up' or 'down'); the result is kg that shows as a clean lb number. */
function lbSnap(kg, dir = 'near', step = LB_STEP) {
  const x = lbOf(kg) / step;
  const n = dir === 'up' ? Math.ceil(x - EPS) : dir === 'down' ? Math.floor(x + EPS) : Math.round(x);
  return lbToKg(n * step);
}
/** The kg increment as the lb step that is really applied: whole grid steps, at least one. */
const lbStep = (inc, step = LB_STEP) => Math.max(step, Math.round((+inc || 0) / LB_KG / step) * step);
/** Next load above w on the lb grid, `stepLb` further on. */
function lbNext(w, stepLb, step = LB_STEP) {
  const cur = lbOf(w);
  let n = Math.round((cur + stepLb) / step) * step;
  if (n <= cur + EPS) n += step;
  return lbToKg(n);
}
/** The step (in display units) that a load increase will use for this exercise. */
function incStepDisp(ex, equip, inc = ex.inc || 1) {
  if (ex.unit === 'L') return inc;
  if (UNITS !== 'lb') return stepDisp(inc);
  if (ex.unit === 'bw') return LB_STEP;
  return ex.unit === 'kg/DB' && equip?.dumbbells?.length ? lbStep(inc, 2.5) : lbStep(inc);
}

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
  if (ex.unit === 'bw') return `+${UNITS === 'lb' ? LB_STEP : stepDisp(2.5)} ${UNITS}`;
  return `+${UNITS === 'lb' ? lbStep(step) : stepDisp(step)} ${UNITS}`;
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
    else if (ex.unit === 'bw') dw = 0; // a deload is bodyweight only: the belt weight comes off
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
      if (UNITS === 'lb') {
        const bw = lbNext(w, LB_STEP), d = +(toDisp(bw) - toDisp(w)).toFixed(2);
        return { t: 'load', w: bw, inc: +(bw - w).toFixed(3), reps: fill(n, lo), rir: '1-3', why: `Every set reached ${hi}. Add ${d} ${UNITS} with a belt (or slow the tempo); reps drop back toward ${lo}.` };
      }
      return { t: 'load', w: w + 2.5, inc: 2.5, reps: fill(n, lo), rir: '1-3', why: `Every set reached ${hi}. Add ${stepDisp(2.5)} ${UNITS} with a belt (or slow the tempo); reps drop back toward ${lo}.` };
    }
    // lb: the step is taken in lb and the new load lands on the lb grid (or the next dumbbell in the list).
    const lbDb = lbMode(ex) && ex.unit === 'kg/DB' && ctx.equip?.dumbbells?.length;
    const nw = !lbMode(ex) ? snapLoad(w + (ex.inc || 1), ex, ctx.equip)
      : lbDb ? snapLoad(lbToKg(lbOf(w) + incStepDisp(ex, ctx.equip)), ex, ctx.equip)
      : lbNext(w, incStepDisp(ex, ctx.equip));
    if (!(nw > w + EPS)) {
      return { t: 'reps', w, reps: fill(n, hi), rir: '1-2', why: `Every set reached ${hi}, but there's no heavier dumbbell in your equipment list. Add a set, slow the lowering to 3 seconds, or switch to a harder variation.` };
    }
    const step = +(nw - w).toFixed(lbMode(ex) ? 3 : 2);
    // The text states the change as it will show on screen.
    const shown = ex.unit === 'L' ? step : lbMode(ex) ? +(toDisp(nw) - toDisp(w)).toFixed(2) : stepDisp(step);
    const per = ex.unit === 'L' ? ' level' : ex.unit === 'kg/DB' ? ` ${UNITS} per dumbbell` : ' ' + UNITS;
    return { t: 'load', w: nw, inc: step, reps: fill(n, lo), rir: '1-3', why: `Every set reached ${hi} last time. Add ${shown}${per} and let reps drop back toward ${lo}.${caution}` };
  }
  const next = prev.map(x => clamp(x + 1, lo, hi));
  const tr = trend(exps, ex.unit);
  if (tr.stall) {
    const why = tr.stall === 'plateau'
      ? `No gain in load or clean reps for 3 comparable sessions. Check sleep, effort and exercise order; if it stays flat, a deload or a variation swap is reasonable.${caution}`
      : `Two sessions without beating your best on this lift. One more flat session confirms a plateau. Log RIR on every set.${caution}`;
    return { t: 'plat', status: tr.stall, w, reps: next, rir: '1-2', why };
  }
  return { t: 'reps', w, reps: next, rir: '1-3', why: `Last time ${lastReps.join('·')} at ${fmtLoad(ex, w)}${unitShort(ex.unit) ? ' ' + unitShort(ex.unit) : ''}. Keep the load and add a rep per set until all ${n} sets reach ${hi}, then add ${incStepDisp(ex, ctx.equip)}${unitWord}.${caution}` };
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
  const bar = barbell ? (barKgFor(ex, equip) || 0) : 0; // an EZ or trap bar of unknown weight: no empty-bar set
  const steps = w >= 40 ? [[0.4, 8], [0.6, 5], [0.8, 3]] : w >= 15 ? [[0.5, 8], [0.75, 4]] : [[0.6, 8]];
  const out = [];
  // Barbell and Smith lifts start with the empty bar.
  if (barbell && bar > 0 && bar < w - EPS) out.push({ w: bar, r: 10, warm: true, done: false });
  for (const [p, r] of steps) {
    let x = Math.max(bar, p * w);
    x = ex.unit === 'kg/DB' ? snapDown(x, ex, equip) : lbMode(ex) ? lbSnap(x) : round(x, 2.5);
    if (x >= w || x <= 0 || (out.length && out[out.length - 1].w === x)) continue;
    out.push({ w: x, r, warm: true, done: false });
  }
  return out;
}

/** Standard lb plates, used in lb mode when the plate list in Settings holds kg plates. */
export const LB_PLATES = [45, 35, 25, 10, 5, 2.5];
const MAX_PLATES = 100;
/**
 * Plates per side for barbell/Smith loads, greedy with the available plates. total and barKg are kg.
 * Works in the display unit: in lb mode the plates are lb plates (the Settings list when it was typed in lb,
 * else LB_PLATES) and a kg bar counts as the nearest 5 lb (20 kg = 45 lb).
 * Returns { ok, plates (in `unit`), rem (kg per side still missing), unit ('kg' | 'lb') }.
 */
export function platesPerSide(total, barKg, plates) {
  const lb = UNITS === 'lb';
  const onHalfLb = kg => { const x = kg / LB_KG * 2; return Math.abs(x - Math.round(x)) < 0.02; };
  let list = (Array.isArray(plates) ? plates : []).map(Number).filter(p => Number.isFinite(p) && p >= 0.25);
  let T = +total, B = +barKg || 0;
  if (lb) {
    list = list.length && list.every(onHalfLb) ? list.map(p => Math.round(p / LB_KG * 2) / 2) : LB_PLATES;
    T = lbOf(T);
    B = onHalfLb(B) ? Math.round(B / LB_KG * 2) / 2 : Math.round(B / LB_KG / 5) * 5;
  }
  const tol = lb ? 0.01 : 0.005;
  const out = (ok, res, r) => {
    const o = { ok, plates: res, rem: +(lb ? r * LB_KG : r).toFixed(3) || 0 };
    if (lb) o.unit = 'lb'; else Object.defineProperty(o, 'unit', { value: 'kg', enumerable: false });
    return o;
  };
  let rem = (T - B) / 2;
  if (!Number.isFinite(rem)) return out(false, [], 0);
  if (rem < -tol) return out(false, [], rem);
  const res = [];
  for (const p of [...new Set(list)].sort((a, b) => b - a)) {
    while (rem >= p - tol && res.length < MAX_PLATES) { res.push(p); rem -= p; }
  }
  return out(Math.abs(rem) < tol, res, rem);
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
      const exps = exposures(sessions, ex).filter(e => trendScore(e, ex) != null);
      if (exps.length < 2) continue;
      if (!best || exps[0].date > best.exps[0].date || (exps[0].date === best.exps[0].date && exps.length > best.exps.length)) best = { ex, exps };
    }
    if (!best) continue;
    // from/to/scores/n all come from the same window the status is judged on, so the label matches the numbers.
    const tr = trend(best.exps.slice(0, 8), best.ex);
    out.push({
      muscle: m, ex: best.ex, status: tr.status, stall: tr.stall, scores: tr.scores,
      from: topLoad(tr.fromExp), to: topLoad(tr.toExp), fromScore: tr.from, toScore: tr.to, fromExp: tr.fromExp, toExp: tr.toExp, n: tr.n,
    });
  }
  return out;
}

const DAY = 86400000;
export const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
export const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
export const dowOf = iso => new Date(iso + 'T00:00:00Z').getUTCDay();
/** A real calendar date 'YYYY-MM-DD' from 1970 to 2100 (no 2026-02-30, 2026-00-10 or 0000-00-00). */
export function validIso(d) {
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const y = +d.slice(0, 4);
  if (y < 1970 || y > 2100) return false;
  const t = Date.parse(d + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d;
}

/**
 * One programme day per weekday. A day whose weekday is taken (or isn't 0–6) moves to the next free weekday,
 * in order; with all seven taken it merges into the day already on its weekday. Empty days (rest placeholders)
 * never push a training day away and are dropped when their weekday is taken. `key` names the list of
 * exercises ('slots' in a programme, 'items' in a pasted split). Returns new day objects; order is kept.
 */
export function dedupeDays(days, key = 'slots') {
  const list = (Array.isArray(days) ? days : []).filter(d => d && typeof d === 'object');
  const has = d => Array.isArray(d[key]) && d[key].length > 0;
  const okDow = v => Number.isInteger(v) && v >= 0 && v <= 6;
  const out = list.map(d => ({ ...d, dow: Number.isFinite(+d.dow) && d.dow !== null && d.dow !== '' ? +d.dow : NaN, [key]: Array.isArray(d[key]) ? [...d[key]] : [] }));
  const owner = new Map(); // dow -> day
  const moved = [];
  // Training days keep their own weekday when it's free (first one wins)…
  for (const d of out) if (has(d)) { if (okDow(d.dow) && !owner.has(d.dow)) owner.set(d.dow, d); else moved.push(d); }
  // …then the rest go to the next free weekday after theirs, or merge.
  const drop = new Set();
  for (const d of moved) {
    const from = okDow(d.dow) ? d.dow : 0;
    let dow = null;
    for (let k = 1; k <= 7; k++) { const c = (from + k) % 7; if (!owner.has(c)) { dow = c; break; } }
    if (dow != null) { d.dow = dow; owner.set(dow, d); continue; }
    const host = owner.get(okDow(d.dow) ? d.dow : 1);
    host[key].push(...d[key]);
    drop.add(d);
  }
  for (const d of out) if (!has(d)) { if (okDow(d.dow) && !owner.has(d.dow)) owner.set(d.dow, d); else drop.add(d); }
  return out.filter(d => !drop.has(d));
}

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
    if (trend(exps.slice(0, 8), ex.unit).stall === 'plateau') stuck.push(ex.name);
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
  const cur = exps[i];
  if (!cur) return null;
  // The same exercise logged twice in one workout is not "the session before": compare with earlier workouts only.
  const same = e => e === cur || (cur.sessionId != null && e.sessionId === cur.sessionId);
  const earlier = exps.slice(i + 1).filter(e => !same(e));
  const prev = earlier[0];
  const sc = score(cur, unit);
  const older = earlier.map(e => score(e, unit)).filter(v => v != null);
  const pr = sc != null && older.length > 0 && sc > Math.max(...older) + EPS;
  if (!prev) return { dir: 'first', text: 'first log', pr: false };
  const a = topLoad(cur), b = topLoad(prev);
  const unitWord = unit === 'L' ? ' lvl' : ' ' + UNITS;
  if (Math.abs(a.w - b.w) > EPS) {
    const d = unit === 'L' ? +(a.w - b.w).toFixed(2) : +(toDisp(a.w) - toDisp(b.w)).toFixed(2);
    return { dir: d > 0 ? 'up' : 'down', kind: 'load', text: `${d > 0 ? '+' : ''}${d}${unitWord}`, pr, prevDate: prev.date, prevSessionId: prev.sessionId };
  }
  // Reps are compared set by set over the sets both sessions have; a different set count is reported separately.
  const k = Math.min(a.reps.length, b.reps.length);
  const sum = r => r.slice(0, k).reduce((x, y) => x + (y || 0), 0);
  const d = sum(a.reps) - sum(b.reps), ds = a.reps.length - b.reps.length;
  const setTxt = ds ? `${ds > 0 ? '+' : '−'}${Math.abs(ds)} set${Math.abs(ds) === 1 ? '' : 's'}` : '';
  if (!d && !ds) return { dir: 'same', kind: 'reps', text: 'same as last', pr, prevDate: prev.date, prevSessionId: prev.sessionId };
  const repTxt = d ? `${d > 0 ? '+' : ''}${d} rep${Math.abs(d) === 1 ? '' : 's'}` : 'same reps';
  const dir = d ? (d > 0 ? 'up' : 'down') : ds > 0 ? 'up' : 'down';
  return { dir, kind: d ? 'reps' : 'sets', text: setTxt ? `${repTxt} · ${setTxt}` : repTxt, pr, prevDate: prev.date, prevSessionId: prev.sessionId };
}

/** A best more than this many times the next-best workout's is treated as a typing or import slip. */
export const OUTLIER_RATIO = 1.5;
/** ...and more than this many kg above it: small loads (5 vs 3 kg added to a pull-up) differ by big ratios for real. */
export const OUTLIER_MIN_GAP = 10;

/** Drop the top value when it stands alone far above the next-best value (one step only, so a second
 *  look never eats into real bests). cands: [{v, key, ...}] one per workout; every workout at the dropped value goes. A value from the newest workout is never dropped (a real jump shows
 *  there first, and a fresh typo is easy to spot and fix). */
function dropOutliers(cands, newestKey) {
  const list = [...cands].sort((a, b) => b.v - a.v);
  // Too little history to call anything a slip (two workouts of 20 kg and 60 kg can both be real).
  if (list.length < 4) return { top: list[0] || null, ignored: [] };
  const top = list[0], next = list.find(c => c.v < top?.v - EPS);
  if (!top || !next || !(next.v > 0) || !(top.v > OUTLIER_RATIO * next.v + EPS) || top.v - next.v <= OUTLIER_MIN_GAP) return { top: top || null, ignored: [] };
  const out = list.filter(c => c.v >= top.v - EPS);
  if (out.some(c => c.key === newestKey)) return { top, ignored: [] };
  return { top: list[out.length], ignored: out };
}

/**
 * Personal records per exercise: heaviest load and best estimated max (e1RM).
 * `unitOrEx` is a unit or an exercise; with an exercise, machines and cables get no estimated max (see hasEstMax).
 * A workout whose best is more than OUTLIER_RATIO × the next-best workout's is left out and listed in `ignored`
 * (the stored log is untouched).
 */
export function personalBests(exps, unitOrEx) {
  const ex = typeof unitOrEx === 'object' && unitOrEx ? unitOrEx : null;
  const unit = ex ? ex.unit : unitOrEx;
  const wantMax = ex ? hasEstMax(ex) : isKg(unit);
  const heavyBy = new Map(), bestBy = new Map();
  exps.forEach((e, i) => {
    const key = e.sessionId ?? `#${i}`;
    for (const s of e.sets) {
      if (s.r == null || !(+s.r > 0)) continue;
      const h = heavyBy.get(key);
      if (!h || +s.w > h.w) heavyBy.set(key, { v: +s.w, key, w: +s.w, r: +s.r, date: e.date });
      if (wantMax) {
        const v = e1rm(+s.w, +s.r);
        const b = bestBy.get(key);
        if (v && (!b || v > b.v)) bestBy.set(key, { v, key, w: +s.w, r: +s.r, date: e.date });
      }
    }
  });
  const newest = exps.length ? (exps[0].sessionId ?? '#0') : null;
  // Cable/machine levels are small numbers that differ per gym (7 vs 4 is normal), so they're not filtered.
  const H = unit === 'L' ? { top: [...heavyBy.values()].sort((a, b) => b.v - a.v)[0] || null, ignored: [] } : dropOutliers([...heavyBy.values()], newest), B = dropOutliers([...bestBy.values()], newest);
  const strip = c => ({ w: c.w, r: c.r, date: c.date });
  const heavy = H.top && { w: H.top.w, r: H.top.r, date: H.top.date };
  const best = B.top && { v: B.top.v, w: B.top.w, r: B.top.r, date: B.top.date };
  const seen = new Set(), ignored = [];
  for (const c of [...H.ignored, ...B.ignored]) {
    const k = `${c.key}|${c.w}|${c.r}`;
    if (!seen.has(k)) { seen.add(k); ignored.push(strip(c)); }
  }
  return { heavy, best, ignored };
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
