// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { EXERCISES, PROGRAM } from '../js/seed.js';
import { sampleSessions as seedSessions } from './fixtures.mjs';

const exById = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const sessions = seedSessions();
const ctx = (extra = {}) => ({ sessions, gymId: 'g1', poor: false, deload: false, equip: null, date: '2026-09-28', ...extra });
const slot = (exId, sets, lo, hi) => ({ exId, sets, lo, hi });

test('e1rm uses Epley and rejects bad input', () => {
  assert.equal(+E.e1rm(25, 8).toFixed(2), 31.67);
  assert.equal(E.e1rm(0, 8), null);
  assert.equal(E.e1rm(20, 0), null);
  assert.equal(E.e1rm(100, 1), 100);
});

test('bench after 25x8x4 suggests +1 rep at 25 kg', () => {
  const sg = E.suggest(slot('bench', 3, 6, 10), exById.bench, ctx());
  assert.equal(sg.t, 'reps');
  assert.equal(sg.w, 25);
  assert.deepEqual(sg.reps, [9, 9, 9]);
});

test('all sets at top of range adds the increment and resets reps', () => {
  const s = [{ id: 'a', date: '2026-09-01', gymId: 'g1', entries: [{ exId: 'bench', sets: [10, 10, 10].map(r => ({ w: 25, r, done: true })) }] }];
  const sg = E.suggest(slot('bench', 3, 6, 10), exById.bench, ctx({ sessions: s }));
  assert.equal(sg.t, 'load');
  assert.equal(sg.w, 27.5);
  assert.deepEqual(sg.reps, [6, 6, 6]);
});

test('dumbbell increments snap to available dumbbells', () => {
  const s = [{ id: 'a', date: '2026-09-01', entries: [{ exId: 'bench', sets: [10, 10, 10].map(r => ({ w: 25, r, done: true })) }] }];
  const sg = E.suggest(slot('bench', 3, 6, 10), exById.bench, ctx({ sessions: s, equip: { dumbbells: [20, 25, 30] } }));
  assert.equal(sg.w, 30);
});

test('no history means calibrate, never a guessed load', () => {
  const sg = E.suggest(slot('fly', 2, 12, 15), exById.fly, ctx());
  assert.equal(sg.t, 'cal');
  assert.equal(sg.w, null);
  assert.equal(sg.reps.length, 2);
});

test('missing reps asks to log reps', () => {
  const sg = E.suggest(slot('cablerow', 2, 10, 15), exById.cablerow, ctx());
  assert.equal(sg.t, 'log');
  assert.equal(sg.w, 9);
});

test('unclear unit asks to set units', () => {
  const sg = E.suggest(slot('ezcurl', 3, 8, 12), { ...exById.ezcurl, unitUnclear: true }, ctx());
  assert.equal(sg.t, 'check');
});

test('poor readiness holds load and reps', () => {
  const sg = E.suggest(slot('bench', 3, 6, 10), exById.bench, ctx({ poor: true }));
  assert.equal(sg.t, 'hold');
  assert.equal(sg.w, 25);
  assert.deepEqual(sg.reps, [8, 8, 8]);
});

test('pain on last exposure holds the load', () => {
  const s = [{ id: 'a', date: '2026-09-01', entries: [{ exId: 'bench', pain: true, sets: [8, 8, 8].map(r => ({ w: 25, r, done: true })) }] }];
  assert.equal(E.suggest(slot('bench', 3, 6, 10), exById.bench, ctx({ sessions: s })).t, 'hold');
});

test('deload cuts sets and load', () => {
  const sg = E.suggest(slot('squat', 3, 6, 10), exById.squat, ctx({ deload: true }));
  assert.equal(sg.t, 'deload');
  assert.equal(sg.reps.length, 2);
  assert.ok(sg.w < 60 && sg.w >= 50, `deload load ${sg.w}`);
});

test('an old peak outside the 12-week window does not flag a plateau', () => {
  // March 20 kg peak is ~6 months old; only the two Aug/Sep 15 kg sessions count.
  const sg = E.suggest(slot('shp', 3, 8, 12), exById.shp, ctx());
  assert.equal(sg.t, 'reps');
  assert.deepEqual(sg.reps, [9, 9, 9]);
});

test('a third flat session inside the window is plateau watch', () => {
  const s = [...sessions, { id: 'x', date: '2026-09-22', entries: [{ exId: 'shp', sets: [8, 8, 8].map(r => ({ w: 15, r, done: true })) }] }];
  const sg = E.suggest(slot('shp', 3, 8, 12), exById.shp, ctx({ sessions: s }));
  assert.equal(sg.t, 'plat');
  assert.equal(sg.status, 'watch');
});

test('trend: three flat exposures after a best is a plateau', () => {
  const mk = (d, w, r) => ({ date: d, sets: [{ w, r, done: true }] });
  const exps = [mk('2026-01-04', 20, 8), mk('2026-01-03', 20, 8), mk('2026-01-02', 20, 8), mk('2026-01-01', 20, 8)];
  assert.equal(E.trend(exps, 'kg').status, 'plateau');
  const up = [mk('2026-01-03', 22.5, 8), mk('2026-01-02', 20, 8), mk('2026-01-01', 20, 6)];
  assert.equal(E.trend(up, 'kg').status, 'up');
});

test('future sessions are ignored for today suggestions', () => {
  const s = [...sessions, { id: 'f', date: '2026-10-05', entries: [{ exId: 'bench', sets: [{ w: 40, r: 10, done: true }] }] }];
  assert.equal(E.suggest(slot('bench', 3, 6, 10), exById.bench, ctx({ sessions: s })).w, 25);
});

test('perGym machines only compare within the same gym', () => {
  const s = [{ id: 'a', date: '2026-09-01', gymId: 'g2', entries: [{ exId: 'pulldown', sets: [{ w: 60, r: 10, done: true }] }] }];
  const sg = E.suggest(slot('pulldown', 3, 8, 12), exById.pulldown, ctx({ sessions: s, gymId: 'g1' }));
  assert.equal(sg.t, 'cal');
});

test('warm-ups ramp below the working load and never reach it', () => {
  const w = E.warmup(60, exById.squat, { barKg: 20 });
  assert.ok(w.length >= 2);
  assert.ok(w.every(s => s.w < 60 && s.warm));
  assert.equal(E.warmup(60, exById.fly, {}).length, 0);
});

test('plates per side', () => {
  assert.deepEqual(E.platesPerSide(60, 20, [20, 10, 5, 2.5]).plates, [20]);
  assert.deepEqual(E.platesPerSide(47.5, 20, [20, 10, 5, 2.5, 1.25]).plates, [10, 2.5, 1.25]);
  assert.equal(E.platesPerSide(15, 20, [20]).ok, false);
});

test('volume counts both dumbbells and ignores cable levels', () => {
  assert.equal(E.volume(exById.bench, [{ w: 25, r: 8 }]), 400);
  assert.equal(E.volume(exById.squat, [{ w: 60, r: 6 }]), 360);
  assert.equal(E.volume(exById.fly, [{ w: 6, r: 12 }]), 0);
});

test('weekly sets per muscle from the programme', () => {
  const t = E.weeklySets(PROGRAM, exById);
  assert.equal(t.Chest, 3 + 3 + 2 + 3 + 2 + 3); // bench, incline, fly (Mon); incline, fly (Fri); close-grip (Sat)
  assert.ok(t.Back > 10);
});

test('nextFor', () => {
  const s = { lo: 6, hi: 10, sets: 3 };
  const mk = reps => ({ sets: reps.map(r => ({ w: 25, r, done: true })) });
  assert.equal(E.nextFor(mk([10, 10, 10]), s, exById.bench).t, 'load');
  assert.equal(E.nextFor(mk([9, 8, 7]), s, exById.bench).t, 'reps');
  assert.equal(E.nextFor(mk([5, 5, 5]), s, exById.bench).t, 'hold');
  assert.equal(E.nextFor({ pain: true, ...mk([8]) }, s, exById.bench).t, 'hold');
});

test('deload check fires on multiple falling lifts', () => {
  const mk = (d, w) => ({ id: d, date: d, entries: [{ exId: 'bench', sets: [{ w, r: 8, done: true }] }, { exId: 'squat', sets: [{ w: w * 2, r: 6, done: true }] }] });
  const s = [mk('2026-09-10', 25), mk('2026-09-17', 22.5), mk('2026-09-24', 20)];
  const r = E.deloadCheck(s, [exById.bench, exById.squat], '2026-09-28');
  assert.equal(r.should, true);
});

test('muscle trends find chest progressing from seed data', () => {
  const t = E.muscleTrends(sessions, EXERCISES);
  const chest = t.find(x => x.muscle === 'Chest');
  assert.equal(chest.status, 'up');
});

test('date helpers', () => {
  assert.equal(E.weekStart('2026-09-28'), '2026-09-28'); // Monday
  assert.equal(E.weekStart('2026-10-04'), '2026-09-28'); // Sunday
  assert.equal(E.addDays('2026-09-28', 7), '2026-10-05');
  assert.equal(E.daysBetween('2026-09-01', '2026-09-28'), 27);
  assert.ok(Math.abs(E.weeklyRate([{ date: '2026-09-01', v: 78 }, { date: '2026-09-15', v: 77 }]) + 0.5) < 1e-9);
});

test('levels: cumulative curve and XP from sets and PRs', () => {
  assert.equal(E.levelFor(0).level, 1);
  assert.equal(E.levelFor(99).level, 1);
  assert.equal(E.levelFor(100).level, 2);
  assert.equal(E.levelFor(300).level, 3);
  const s = [
    { id: 'a', date: '2026-09-01', name: 'A', entries: [{ exId: 'bench', sets: [8, 8, 8].map(r => ({ w: 20, r, done: true })) }] },
    { id: 'b', date: '2026-09-08', name: 'B', entries: [{ exId: 'bench', sets: [8, 8, 8].map(r => ({ w: 22.5, r, done: true })) }] },
  ];
  const x = E.muscleXP(s, exById, '2026-09-10');
  // bench: Chest primary (10/set), Front delts + Triceps helpers (5/set); second session is a PR (+40 / +20)
  assert.equal(x.muscles.Chest.xp, 30 + 30 + 40);
  assert.equal(x.muscles.Triceps.xp, 15 + 15 + 20);
  assert.equal(x.muscles.Chest.week, 70);
  assert.ok(x.levelUps.some(u => u.muscle === 'Chest' && u.level === 2));
  assert.equal(E.titleFor(1), 'Rookie');
});

test('duration: learned set cycle, day estimate and remaining time', () => {
  const t = 1_700_000_000_000;
  const s = [{ id: 'a', date: '2026-09-01', name: 'Push', start: t, end: t + 50 * 60000, entries: [{ exId: 'bench', sets: [0, 1, 2].map(i => ({ w: 20, r: 8, done: true, at: t + i * 150000 })) }] }];
  assert.equal(E.setCycleSec(exById.bench, s), 150);
  assert.equal(E.setCycleSec(exById.fly, s), exById.fly.rest + E.SET_WORK_SEC);
  const day = { name: 'Push', slots: [{ exId: 'bench', sets: 3 }, { exId: 'fly', sets: 2 }] };
  const plan = 3 * 150 + 75 + 2 * (75 + 40);
  assert.equal(E.estimateDay(day, exById, s), Math.round(0.5 * plan + 0.5 * 3000));
  const entries = [{ exId: 'bench', sets: [{ done: true, at: t }, { done: false }, { done: false }] }, { exId: 'fly', sets: [{ done: false }, { done: false }] }];
  assert.equal(E.estimateRemaining(entries, exById, s, t), 2 * 150 + 75 + 2 * 115);
});

test('history caches follow the sessions array and invalidateCaches()', () => {
  const ex = { id: 'cx', name: 'Cache lift', unit: 'kg', muscles: ['Chest'] };
  const byId = { cx: ex };
  const mk = (id, date, w) => ({ id, date, name: 'X', entries: [{ exId: 'cx', sets: [{ w, r: 8, done: true }] }] });
  const list = [mk('a', '2026-01-02', 50), mk('b', '2026-01-01', 45)];
  assert.equal(E.exposures(list, ex).length, 2);
  const xp1 = E.muscleXP(list, byId).total;
  assert.equal(E.muscleXP(list, byId), E.muscleXP(list, byId), 'same inputs reuse the cached result');
  list.unshift(mk('c', '2026-01-03', 55)); // in-place change of the array is noticed
  assert.equal(E.exposures(list, ex).length, 3);
  assert.ok(E.muscleXP(list, byId).total > xp1);
  list[0].entries[0].sets.push({ w: 55, r: 8, done: true }); // edit inside a session needs an explicit invalidate
  E.invalidateCaches();
  assert.equal(E.exposures(list, ex)[0].sets.length, 2);
});

test('imported sessions mark their level-ups, so banners can skip them', () => {
  const ex = { id: 'ix', name: 'Imp lift', unit: 'kg', muscles: ['Back'] };
  const sess = Array.from({ length: 12 }, (_, i) => ({ id: 'i' + i, date: `2026-02-${String(i + 1).padStart(2, '0')}`, name: 'Pull', imported: i < 11, entries: [{ exId: 'ix', sets: Array.from({ length: 4 }, () => ({ w: 40 + i, r: 8, done: true })) }] }));
  const ups = E.muscleXP(sess, { ix: ex }).levelUps;
  assert.ok(ups.length > 1);
  assert.ok(ups.slice(0, -1).every(u => u.imported));
});
