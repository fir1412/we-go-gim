// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { EXERCISES, PROGRAM } from '../js/seed.js';

const exById = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const sess = (id, date, exId, w, reps, extra = {}) => ({ id, date, name: 'S', ...extra, entries: [{ exId, sets: reps.map(r => ({ w, r, done: true })) }] });

test('XP: machine PRs only count against the same gym', () => {
  const s = [
    sess('a', '2026-09-01', 'mchest', 60, [10, 10], { gymId: 'g1' }),
    sess('b', '2026-09-03', 'mchest', 40, [10, 10], { gymId: 'g2' }), // first time at gym 2: not a PR, not a drop
    sess('c', '2026-09-05', 'mchest', 45, [10, 10], { gymId: 'g2' }), // beats gym-2 best: PR
  ];
  const x = E.muscleXP(s, exById, '2026-09-10');
  assert.equal(x.muscles.Chest.xp, 20 + 20 + 20 + E.XP_PR);
  const ev = x.muscles.Chest.events;
  assert.equal(ev[2].pr, true);
  assert.equal(ev[1].pr, false);
  assert.match(ev[0].why, /^2 sets/);
});

test('XP: free weights still compare across gyms', () => {
  const s = [sess('a', '2026-09-01', 'bench', 20, [8], { gymId: 'g1' }), sess('b', '2026-09-03', 'bench', 22.5, [8], { gymId: 'g2' })];
  const x = E.muscleXP(s, exById, '2026-09-10');
  assert.equal(x.muscles.Chest.xp, 10 + 10 + E.XP_PR);
});

test('plannedXP and xpBySession', () => {
  const push = PROGRAM.days.find(d => d.name === 'Push');
  const p = E.plannedXP(push, exById);
  // bench 3 + incline 3 + fly 2 = 8 chest sets as primary
  assert.equal(p.Chest, 80);
  assert.equal(E.plannedXP(null, exById).Chest, undefined);
  const s = [sess('a', '2026-09-01', 'bench', 20, [8, 8]), sess('b', '2026-09-08', 'bench', 22.5, [8, 8])];
  const by = E.xpBySession(E.muscleXP(s, exById));
  assert.equal(by.a.total, 20 + 10 + 10);
  assert.equal(by.b.total, 20 + E.XP_PR + 2 * (10 + E.XP_PR / 2));
  assert.equal(by.b.muscles.Chest, 20 + E.XP_PR);
});

test('compareExposure: load step, reps, PR and first log', () => {
  const s = [
    sess('a', '2026-09-01', 'bench', 20, [8, 8, 8]),
    sess('b', '2026-09-08', 'bench', 20, [9, 9, 8]),
    sess('c', '2026-09-15', 'bench', 22.5, [7, 7, 6]),
    sess('d', '2026-09-22', 'bench', 20, [8, 8, 8]),
  ];
  const exps = E.exposures(s, exById.bench); // newest first
  const byId = id => E.compareExposure(exps, exps.findIndex(e => e.sessionId === id), 'kg/DB');
  assert.deepEqual(byId('a'), { dir: 'first', text: 'first log', pr: false });
  const b = byId('b');
  assert.equal(b.dir, 'up'); assert.equal(b.kind, 'reps'); assert.equal(b.text, '+2 reps'); assert.equal(b.pr, true); assert.equal(b.prevDate, '2026-09-01');
  const c = byId('c');
  assert.equal(c.kind, 'load'); assert.equal(c.text, '+2.5 kg');
  const d = byId('d');
  assert.equal(d.dir, 'down'); assert.equal(d.kind, 'load'); assert.equal(d.pr, false);
  assert.equal(E.compareExposure(exps, 9, 'kg/DB'), null);
});

test('compareExposure: fewer sets are not read as lost reps', () => {
  const s = [sess('a', '2026-09-21', 'bench', 25, [8, 8, 8, 8]), sess('b', '2026-09-28', 'bench', 25, [9, 9, 9])];
  const exps = E.exposures(s, exById.bench);
  const c = E.compareExposure(exps, 0, 'kg/DB');
  assert.equal(c.dir, 'up');
  assert.equal(c.text, '+3 reps · −1 set');
  const s2 = [sess('a', '2026-09-21', 'bench', 25, [8, 8]), sess('b', '2026-09-28', 'bench', 25, [8, 8, 8])];
  const c2 = E.compareExposure(E.exposures(s2, exById.bench), 0, 'kg/DB');
  assert.equal(c2.text, 'same reps · +1 set'); assert.equal(c2.dir, 'up');
});

test('compareExposure: cable levels use levels, not kg', () => {
  const s = [sess('a', '2026-09-01', 'fly', 5, [12, 12]), sess('b', '2026-09-08', 'fly', 6, [10, 10])];
  const exps = E.exposures(s, exById.fly);
  assert.equal(E.compareExposure(exps, 0, 'L').text, '+1 lvl');
});
