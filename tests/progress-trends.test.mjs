// Progress analysis: trend labels agree with the numbers shown, implausible bests are left out,
// and a lift logged twice in one workout is never compared with its own twin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

const kgEx = { id: 'rdl', name: 'Romanian deadlift', unit: 'kg', equip: 'barbell', muscles: ['Hamstrings'] };
const machEx = { id: 'mchest', name: 'Machine chest press', unit: 'kg', equip: 'machine', perGym: true, muscles: ['Chest'] };
const cableEx = { id: 'crunch', name: 'Cable crunch', unit: 'L', equip: 'cable', perGym: true, muscles: ['Abs'] };
const bwEx = { id: 'pullup', name: 'Pull-up', unit: 'bw', equip: 'bw', muscles: ['Back'] };
const dbEx = { id: 'bench', name: 'Flat DB bench press', unit: 'kg/DB', equip: 'db', muscles: ['Chest'] };

const day = n => E.addDays('2026-06-01', n);
let sid = 0;
/** Sessions from [[w, reps...], ...] (oldest first), one per week. */
const sessionsFor = (ex, rows, start = 0) => rows.map(([w, ...reps], i) => ({
  id: `s${++sid}`, date: day(start + i * 7), gymId: 'g1',
  entries: [{ exId: ex.id, sets: reps.map(r => ({ w, r, done: true })) }],
}));
const trendOf = (ex, rows) => E.trend(E.exposures(sessionsFor(ex, rows), ex).slice(0, 8), ex);
/** Direction the shown numbers move in. */
const dir = tr => (tr.to > tr.from * 1.05 ? 'up' : tr.to < tr.from * 0.95 ? 'down' : 'level');

test('a clear drop across the window is "down", with numbers that fall', () => {
  // 82 → 67.2 used to read "stuck"
  const tr = trendOf(kgEx, [[60, 11], [62.5, 10], [60, 8], [55, 8], [52.5, 8]]);
  assert.equal(tr.status, 'down');
  assert.ok(tr.to < tr.from);
  assert.equal(tr.scores[0], tr.from);
  assert.equal(tr.scores[tr.scores.length - 1], tr.to);
});

test('a clear rise across the window is "up" even when the last sessions missed the peak', () => {
  // 38 → 50.7 used to read "flat"
  const tr = trendOf(kgEx, [[30, 8], [40, 8], [45, 8], [42.5, 8], [40, 8]]);
  assert.equal(tr.status, 'up');
  assert.equal(tr.stall, 'watch'); // advice still knows the last two missed the best
  assert.ok(tr.to > tr.from);
});

test('plateau and watch only when the numbers stay level', () => {
  const p = trendOf(kgEx, [[60, 8], [60, 8], [60, 8], [60, 8]]);
  assert.equal(p.status, 'plateau');
  assert.equal(dir(p), 'level');
  const w = trendOf(kgEx, [[60, 10], [60, 8], [60, 8]]);
  assert.equal(w.status, 'watch');
});

test('status never contradicts the shown numbers (randomised)', () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let k = 0; k < 300; k++) {
    const ex = [kgEx, machEx, cableEx, dbEx][k % 4];
    const rows = Array.from({ length: 2 + Math.floor(rnd() * 7) }, () => [ex.unit === 'L' ? 1 + Math.floor(rnd() * 12) : 5 + Math.round(rnd() * 20) * 2.5, 6 + Math.floor(rnd() * 6), 6 + Math.floor(rnd() * 6)]);
    const tr = trendOf(ex, rows);
    if (tr.status === 'up') assert.ok(tr.to > tr.from, `${ex.id} up but ${tr.from} → ${tr.to}`);
    if (tr.status === 'down') assert.ok(tr.to < tr.from, `${ex.id} down but ${tr.from} → ${tr.to}`);
    if (['plateau', 'watch', 'flat'].includes(tr.status)) assert.equal(dir(tr), 'level', `${ex.id} ${tr.status} but ${tr.from} → ${tr.to}`);
  }
});

test('a cable lift going from level 12 to level 11 is not "progressing"', () => {
  const tr = trendOf(cableEx, [[12, 12, 12], [12, 12, 10], [11, 12, 12], [11, 12, 12]]);
  assert.notEqual(tr.status, 'up');
  assert.equal(tr.status, 'down');
  assert.equal(E.trendRange(cableEx, tr), 'L12 → L11');
});

test('muscle trend numbers come from the same window as the status', () => {
  // An old L12 session far outside the window must not be shown as the start point.
  const old = sessionsFor(cableEx, [[12, 12], [12, 12]], -300);
  const recent = sessionsFor(cableEx, [[10, 12], [10, 12], [11, 12]]);
  const [x] = E.muscleTrends([...recent, ...old].reverse(), [cableEx]);
  assert.equal(x.status, 'up');
  assert.equal(x.from.w, 10);
  assert.equal(x.to.w, 11);
  assert.equal(x.n, 3);
  assert.equal(E.trendRange(cableEx, x), 'L10 → L11');
});

test('machine lifts trend on load, not an estimated max', () => {
  assert.equal(E.hasEstMax(machEx), false);
  assert.equal(E.hasEstMax(cableEx), false);
  assert.equal(E.hasEstMax(kgEx), true);
  assert.equal(E.hasEstMax(dbEx), true);
  const tr = trendOf(machEx, [[50, 10, 10], [55, 10, 10], [60, 10, 10]]);
  assert.equal(tr.status, 'up');
  assert.equal(E.trendRange(machEx, tr), '50 → 60 kg');
});

test('bodyweight lifts: added weight is trended; plain bodyweight shows reps', () => {
  E.setBwLabel('Bodyweight');
  try {
    const w = trendOf(bwEx, [[20, 6, 6], [22.5, 6, 6], [25, 6, 6]]);
    assert.equal(E.trendRange(bwEx, w), 'Bodyweight + 20 kg → Bodyweight + 25 kg');
    const r = trendOf(bwEx, [[0, 6, 4], [0, 6, 6]]);
    assert.equal(E.trendRange(bwEx, r), 'Bodyweight × 6·4 → Bodyweight × 6·6');
    assert.equal(r.status, 'up');
  } finally { E.setBwLabel('BW'); }
});

test('suggestions still flag a stalled lift as a plateau', () => {
  const s = sessionsFor(kgEx, [[30, 8, 8, 8], [40, 8, 8, 8], [40, 8, 8, 8], [40, 8, 8, 8], [40, 8, 8, 8]]);
  const sg = E.suggest({ exId: kgEx.id, sets: 3, lo: 8, hi: 12 }, kgEx, { sessions: s, date: day(60) });
  assert.equal(sg.t, 'plat');
  assert.equal(sg.status, 'plateau');
});

// ---- implausible bests ----------------------------------------------------------------------------
test('a lone best far above every other workout is left out of records', () => {
  const s = sessionsFor(bwEx, [[0, 6], [65, 6], [5, 6], [2.5, 8], [0, 8]]);
  const pb = E.personalBests(E.exposures(s, bwEx), bwEx);
  assert.equal(pb.heavy.w, 5);
  assert.equal(pb.ignored.length, 1);
  assert.equal(pb.ignored[0].w, 65);
});

test('only one step is dropped: small added loads that differ are real', () => {
  const s = sessionsFor(bwEx, [[0, 6], [5, 6], [3, 6], [0, 8]]);
  const pb = E.personalBests(E.exposures(s, bwEx), bwEx);
  assert.equal(pb.heavy.w, 5);
  assert.deepEqual(pb.ignored, []);
});

test('an estimated max from a typo rep count is ignored; the stored log is unchanged', () => {
  const s = sessionsFor(dbEx, [[25, 8], [60, 40], [27.5, 8], [30, 6]]);
  const before = JSON.stringify(s);
  const pb = E.personalBests(E.exposures(s, dbEx), dbEx);
  assert.ok(pb.best.v < 40, `best ${pb.best.v}`);
  assert.ok(pb.ignored.some(x => x.w === 60 && x.r === 40));
  assert.equal(JSON.stringify(s), before);
});

test('the newest workout is never treated as a slip', () => {
  const s = sessionsFor(kgEx, [[40, 5], [40, 5], [100, 5]]);
  const pb = E.personalBests(E.exposures(s, kgEx), kgEx);
  assert.equal(pb.heavy.w, 100);
  assert.deepEqual(pb.ignored, []);
});

test('machines and cables get no estimated max', () => {
  const s = sessionsFor(machEx, [[90, 90], [85, 6], [80, 8]]);
  const pb = E.personalBests(E.exposures(s, machEx), machEx);
  assert.equal(pb.best, null);
  assert.equal(pb.heavy.w, 90);
  const c = E.personalBests(E.exposures(sessionsFor(cableEx, [[7, 12], [4, 12], [5, 12]]), cableEx), cableEx);
  assert.equal(c.best, null);
  assert.equal(c.heavy.w, 7); // levels differ per gym: never filtered as outliers
});

test('personalBests still accepts a unit (older callers)', () => {
  const s = sessionsFor(kgEx, [[40, 5], [50, 5]]);
  const pb = E.personalBests(E.exposures(s, kgEx), 'kg');
  assert.equal(pb.heavy.w, 50);
  assert.ok(pb.best.v > 50);
});

// ---- same lift twice in one workout ---------------------------------------------------------------
test('a lift logged twice in one workout is compared with the previous workout, not its twin', () => {
  const s = [
    { id: 'a', date: '2026-09-02', entries: [{ exId: kgEx.id, sets: [{ w: 50, r: 8, done: true }] }] },
    { id: 'b', date: '2026-09-09', entries: [
      { exId: kgEx.id, sets: [{ w: 55, r: 8, done: true }] },
      { exId: kgEx.id, sets: [{ w: 55, r: 6, done: true }] },
    ] },
  ];
  const exps = E.exposures(s, kgEx);
  assert.equal(exps.length, 3);
  for (const i of [0, 1]) {
    const c = E.compareExposure(exps, i, kgEx.unit);
    assert.equal(c.prevDate, '2026-09-02', `entry ${i} compared with ${c.prevDate}`);
    assert.equal(c.prevSessionId, 'a');
    assert.equal(c.dir, 'up');
    assert.equal(c.pr, true);
  }
  assert.equal(E.compareExposure(exps, 2, kgEx.unit).dir, 'first');
});

test('a workout with only twin entries of a lift reads as a first log', () => {
  const s = [{ id: 'b', date: '2026-09-09', entries: [
    { exId: kgEx.id, sets: [{ w: 55, r: 8, done: true }] },
    { exId: kgEx.id, sets: [{ w: 50, r: 8, done: true }] },
  ] }];
  const exps = E.exposures(s, kgEx);
  assert.equal(E.compareExposure(exps, 0, kgEx.unit).dir, 'first');
  assert.equal(E.compareExposure(exps, 1, kgEx.unit).dir, 'first');
});
