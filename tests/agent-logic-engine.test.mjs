// Agent-written logic/data-integrity probes. Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { EXERCISES, PROGRAM, DEFAULT_SETTINGS } from '../js/seed.js';
import { sampleSessions as seedSessions } from './fixtures.mjs';

const exById = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const equip = DEFAULT_SETTINGS.equip;
const sess = (date, entries, extra = {}) => ({ id: 's-' + date + (extra.sfx || ''), date, gymId: 'g1', entries, ...extra });
const ent = (exId, sets, extra = {}) => ({ exId, sets, pain: false, rir: null, ...extra });
const st = (w, r, extra = {}) => ({ w, r, done: true, ...extra });
const ctx = (sessions, extra = {}) => ({ sessions, gymId: 'g1', poor: false, deload: false, equip, date: '2026-09-28', ...extra });
const sane = sg => {
  assert.ok(Array.isArray(sg.reps) && sg.reps.length > 0, 'reps non-empty');
  assert.ok(sg.reps.every(r => Number.isFinite(r)), 'reps finite: ' + JSON.stringify(sg.reps));
  if (sg.t !== 'cal') assert.ok(Number.isFinite(sg.w), 'w finite: ' + sg.w);
};
const kgEx = { id: 'k', name: 'K', unit: 'kg', equip: 'machine', inc: 2.5, muscles: ['Chest'] };
const dbEx = { id: 'd', name: 'D', unit: 'kg/DB', equip: 'db', inc: 2.5, muscles: ['Chest'] };
const lEx = { id: 'l', name: 'L', unit: 'L', equip: 'cable', inc: 1, perGym: true, muscles: ['Chest'] };

// ---------- seeded programme sanity on 2026-09-28 ----------
test('every seeded programme slot yields a sane suggestion on every day of week', () => {
  const sessions = seedSessions();
  for (const d of PROGRAM.days) for (const s of d.slots) {
    for (const extra of [{}, { poor: true }, { deload: true }]) {
      const sg = E.suggest(s, exById[s.exId], ctx(sessions, extra));
      assert.ok(sg.reps.length > 0, s.exId);
      if (sg.w != null) assert.ok(Number.isFinite(sg.w), s.exId + ' ' + sg.w);
    }
  }
});

test('seed matches handoff numbers', () => {
  const ss = seedSessions();
  const b = ss.find(s => s.date === '2026-09-21').entries.find(e => e.exId === 'bench');
  assert.deepEqual(b.sets.map(x => [x.w, x.r]), [[25, 8], [25, 8], [25, 8], [25, 8]]);
  const sq = E.exposures(ss, exById.squat).map(e => E.topLoad(e).w).reverse();
  assert.deepEqual(sq, [45, 45, 50, 60]);
});

test('seeded Push day suggestions on 2026-09-28', () => {
  const ss = seedSessions();
  const push = PROGRAM.days.find(d => d.dow === 1);
  const out = Object.fromEntries(push.slots.map(s => [s.exId, E.suggest(s, exById[s.exId], ctx(ss))]));
  assert.equal(out.bench.t, 'reps'); assert.equal(out.bench.w, 25); assert.deepEqual(out.bench.reps, [9, 9, 9]);
  assert.equal(out.incline.w, 25); assert.deepEqual(out.incline.reps, [9, 9, 9]);
  for (const k of ['mshp', 'fly', 'lat', 'ohext']) assert.equal(out[k].t, 'cal', k);
});

// ---------- CONFIRMED-BUG probes (expected to FAIL on current code) ----------
test('BUG: deload for kg load 10 must be below working load (snapDown rounds, not floors)', () => {
  const ss = [sess('2026-09-20', [ent('k', [st(10, 8), st(10, 8)])])];
  const sg = E.suggest({ exId: 'k', sets: 2, lo: 8, hi: 12 }, kgEx, ctx(ss, { deload: true }));
  assert.ok(sg.w < 10, `deload w=${sg.w} not below 10`);
});

test('BUG: deload kg/DB without dumbbell list at 10 kg must go down', () => {
  const ss = [sess('2026-09-20', [ent('d', [st(10, 8)])])];
  const sg = E.suggest({ exId: 'd', sets: 3, lo: 8, hi: 12 }, dbEx, ctx(ss, { deload: true, equip: null }));
  assert.ok(sg.w < 10, `deload w=${sg.w}`);
});

test('BUG: DB at max dumbbell (40) topping range must not suggest "Add 0 kg" load', () => {
  const ss = [sess('2026-09-20', [ent('d', [st(40, 12), st(40, 12), st(40, 12)])])];
  const sg = E.suggest({ exId: 'd', sets: 3, lo: 8, hi: 12 }, dbEx, ctx(ss));
  assert.ok(!(sg.t === 'load' && sg.inc <= 0), `t=${sg.t} w=${sg.w} inc=${sg.inc} why=${sg.why}`);
});

test('BUG: DB logged above rack max (45) must not suggest negative increment', () => {
  const ss = [sess('2026-09-20', [ent('d', [st(45, 12), st(45, 12), st(45, 12)])])];
  const sg = E.suggest({ exId: 'd', sets: 3, lo: 8, hi: 12 }, dbEx, ctx(ss));
  assert.ok(!(sg.t === 'load' && sg.w < 45), `w=${sg.w} inc=${sg.inc}`);
});

test('BUG: one top set at hi should not trigger load jump for 3-set slot (padding)', () => {
  const ss = [sess('2026-09-20', [ent('k', [st(30, 12)])])];
  const sg = E.suggest({ exId: 'k', sets: 3, lo: 8, hi: 12 }, kgEx, ctx(ss));
  assert.notEqual(sg.t, 'load', `single set of 12 → ${sg.t} ${sg.w}`);
});

test('BUG: suggest and nextFor disagree when a back-off set is lighter', () => {
  const e = ent('k', [st(30, 12), st(30, 12), st(27.5, 12)]);
  const slot = { exId: 'k', sets: 3, lo: 8, hi: 12 };
  const nf = E.nextFor(e, slot, kgEx);
  const sg = E.suggest(slot, kgEx, ctx([sess('2026-09-20', [e])]));
  assert.equal(nf.t === 'load', sg.t === 'load', `nextFor=${nf.t} suggest=${sg.t}`);
});

test('BUG: kg exposure with missing weight must not suggest 0 kg "reps"', () => {
  const ss = [sess('2026-09-20', [ent('k', [st(null, 8), st('', 8)])])];
  const sg = E.suggest({ exId: 'k', sets: 2, lo: 8, hi: 12 }, kgEx, ctx(ss));
  assert.ok(sg.t === 'log' || sg.t === 'cal' || sg.w > 0, `t=${sg.t} w=${sg.w}`);
});

test('perGym: sessions with no gym recorded match any gym (the app always stamps one)', () => {
  const ss = [{ id: 'x', date: '2026-09-20', entries: [ent('l', [st(8, 12)])] }];
  const sg = E.suggest({ exId: 'l', sets: 2, lo: 10, hi: 15 }, lEx, ctx(ss, { gymId: 'g2' }));
  assert.equal(sg.t, 'reps');
  const other = [{ id: 'y', date: '2026-09-20', gymId: 'g1', entries: [ent('l', [st(8, 12)])] }];
  assert.equal(E.suggest({ exId: 'l', sets: 2, lo: 10, hi: 15 }, lEx, ctx(other, { gymId: 'g2' })).t, 'cal');
});

test('BUG?: approx March peak makes DB shoulder press read "watch" on first real week', () => {
  const upper = PROGRAM.days.find(d => d.dow === 5).slots.find(s => s.exId === 'shp');
  const sg = E.suggest(upper, exById.shp, ctx(seedSessions(), { date: '2026-10-02' }));
  assert.notEqual(sg.t, 'plat', `shp → ${sg.t}/${sg.status}: ${sg.why}`);
});

test('BUG: slot.sets missing/0 gives empty reps array', () => {
  const ss = [sess('2026-09-20', [ent('k', [st(30, 10)])])];
  for (const n of [0, undefined, '']) {
    const sg = E.suggest({ exId: 'k', sets: n, lo: 8, hi: 12 }, kgEx, ctx(ss));
    assert.ok(sg.reps.length > 0, `sets=${n} → reps=${JSON.stringify(sg.reps)}`);
  }
});

test('BUG: non-numeric reps produce NaN reps', () => {
  const ss = [sess('2026-09-20', [ent('k', [st(30, 'x')])])];
  sane(E.suggest({ exId: 'k', sets: 2, lo: 8, hi: 12 }, kgEx, ctx(ss)));
});

test('lo>hi: suggestion reps stay within [min,max]', () => {
  const ss = [sess('2026-09-20', [ent('k', [st(30, 9)])])];
  const sg = E.suggest({ exId: 'k', sets: 2, lo: 12, hi: 8 }, kgEx, ctx(ss));
  assert.ok(sg.reps.every(r => r >= 8 && r <= 12), JSON.stringify(sg));
});

// ---------- expected-pass probes ----------
test('warm-up-only exposures are ignored', () => {
  const ss = [sess('2026-09-20', [ent('k', [st(20, 8, { warm: true })])])];
  assert.equal(E.suggest({ exId: 'k', sets: 3, lo: 8, hi: 12 }, kgEx, ctx(ss)).t, 'cal');
});

test('string values parse; mixed loads use heaviest', () => {
  const ss = [sess('2026-09-20', [ent('k', [st('30', '10'), st('32.5', '8'), st('30', '12')])])];
  const sg = E.suggest({ exId: 'k', sets: 3, lo: 8, hi: 12 }, kgEx, ctx(ss));
  assert.equal(sg.w, 32.5); assert.deepEqual(sg.reps, [9, 9, 9]); sane(sg);
});

test('pull-ups at top of range add 2.5 kg', () => {
  const ss = [sess('2026-09-20', [ent('pullup', [st(0, 8), st(0, 8), st(0, 8)])])];
  const sg = E.suggest({ exId: 'pullup', sets: 3, lo: 5, hi: 8 }, exById.pullup, ctx(ss));
  assert.equal(sg.t, 'load'); assert.equal(sg.w, 2.5); assert.deepEqual(sg.reps, [5, 5, 5]);
  const bw = E.suggest({ exId: 'pullup', sets: 3, lo: 5, hi: 8 }, exById.pullup, ctx([sess('2026-09-20', [ent('pullup', [st(null, 6)])])]));
  sane(bw); assert.equal(bw.w, 0);
});

test('float increments 12.5+2.5 and DB snap', () => {
  const ss = [sess('2026-09-20', [ent('d', [st(12.5, 12), st(12.5, 12)])])];
  const sg = E.suggest({ exId: 'd', sets: 2, lo: 8, hi: 12 }, dbEx, ctx(ss));
  assert.equal(sg.w, 15);
});

test('same-date sessions: an earlier session today counts for a second workout', () => {
  const today = sess('2026-09-28', [ent('k', [st(50, 10)])]);
  const future = sess('2026-09-29', [ent('k', [st(90, 10)])], { sfx: 'f' });
  const sg = E.suggest({ exId: 'k', sets: 1, lo: 8, hi: 12 }, kgEx, ctx([future, today]));
  assert.equal(sg.w, 50);
});

test('slot.sets larger than last exposure pads with last rep', () => {
  const ss = [sess('2026-09-20', [ent('k', [st(30, 10), st(30, 9)])])];
  assert.deepEqual(E.suggest({ exId: 'k', sets: 4, lo: 8, hi: 12 }, kgEx, ctx(ss)).reps, [11, 10, 10, 10]);
});

test('zero increment for L falls back to 1', () => {
  const ex = { ...lEx, inc: 0 };
  const ss = [sess('2026-09-20', [ent('l', [st(5, 15), st(5, 15)])])];
  assert.equal(E.suggest({ exId: 'l', sets: 2, lo: 10, hi: 15 }, ex, ctx(ss)).w, 6);
});

test('deload rounding across units', () => {
  const mk = (ex, w) => E.suggest({ exId: ex.id, sets: 3, lo: 8, hi: 12 }, ex, ctx([sess('2026-09-20', [ent(ex.id, [st(w, 8)])])], { deload: true }));
  const r = { kg60: mk(kgEx, 60).w, db25: mk(dbEx, 25).w, L8: mk(lEx, 8).w, reps: mk(kgEx, 60).reps.length };
  assert.equal(r.kg60, 52.5); assert.equal(r.db25, 22.5); assert.equal(r.L8, 7); assert.equal(r.reps, 2);
});

test('trend ignores null scores; plateau after 3 non-improving', () => {
  const mk = (r) => ({ sets: [{ w: 30, r, done: true }] });
  const exps = [mk(8), mk(null), mk(8), mk(8), mk(10)]; // newest first
  assert.equal(E.trend(exps, 'kg').status, 'plateau');
  assert.equal(E.trend([mk(8), mk(8), mk(10)], 'kg').status, 'watch');
});

test('warm-ups stay below work load, platesPerSide exact/shortfall', () => {
  for (const w of [20, 22.5, 25, 40, 42.5, 60, 100, 12.5, 7.5]) {
    for (const ex of [exById.squat, exById.bench, kgEx]) {
      const wu = E.warmup(w, ex, equip);
      assert.ok(wu.every(x => x.w < w && x.w > 0), `${ex.id} ${w} ${JSON.stringify(wu)}`);
    }
  }
  assert.deepEqual(E.platesPerSide(62.5, 20, equip.plates), { ok: true, plates: [20, 1.25], rem: 0 });
  assert.equal(E.platesPerSide(61, 20, equip.plates).ok, false);
  assert.equal(E.platesPerSide(15, 20, equip.plates).ok, false);
});

test('weekStart stable across DST boundaries', () => {
  assert.equal(E.weekStart('2026-03-29'), '2026-03-23');
  assert.equal(E.weekStart('2026-10-25'), '2026-10-19');
  assert.equal(E.weekStart('2026-10-26'), '2026-10-26');
  assert.equal(E.addDays('2026-03-28', 1), '2026-03-29');
});

test('volume: DB both hands, L zero', () => {
  assert.equal(E.volume(dbEx, [st(25, 8)]), 400);
  assert.equal(E.volume(lEx, [st(8, 8)]), 0);
});
