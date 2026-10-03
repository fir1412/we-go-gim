import { test } from 'node:test';
import assert from 'node:assert/strict';
import { switchSetUnit, setExercise } from '../js/set-units.js';
import { volume, exposures, summaryStats, muscleXP, setUnits, toDisp, kgFromDisp } from '../js/engine.js';
import { sanitizeBackup } from '../js/state.js';
import { toCSV, sessionsFromCSV } from '../js/io.js';
const ex = { id: 'bench', name: 'Bench press', unit: 'kg', equip: 'barbell', muscles: ['chest'] };
const entry = () => ({ exId: ex.id, sets: [{ w: 20, r: 8, done: true }, { w: 20, r: 8, done: false }, { w: 20, r: 8, done: false }] });

test('kg/lb switching preserves stored load and completed earlier sets', () => {
  setUnits('kg'); const e = entry();
  assert.equal(switchSetUnit(e, 1, 'lb', ex), true);
  assert.deepEqual(e.sets.map(s => [s.w, s.disp]), [[20, 'kg'], [20, 'lb'], [20, 'lb']]);
  const row = setExercise(ex, e.sets[1]);
  assert.equal(toDisp(20, row), 44);
  assert.equal(kgFromDisp(100, row), 45.36);
  switchSetUnit(e, 1, 'kg', ex);
  assert.equal(e.sets[1].w, 20);
  assert.equal(ex.disp, undefined);
});

test('levels and bodyweight reset only future weights and preserve earlier logged kg', () => {
  const e = entry(); switchSetUnit(e, 1, 'L', ex);
  assert.equal(e.sets[0].w, 20); assert.equal(e.sets[0].loadUnit, 'kg');
  assert.equal(e.sets[1].w, null); e.sets[1].w = 7; e.sets[1].done = true;
  switchSetUnit(e, 2, 'bw', ex);
  assert.equal(e.sets[1].w, 7); assert.equal(e.sets[1].loadUnit, 'L');
  assert.equal(e.sets[2].w, 0); assert.equal(e.sets[2].loadUnit, 'bw');
  assert.equal(switchSetUnit(e, 1, 'kg', ex), false);
});

test('mixed load types exclude levels from kg volume, suggestions and PR comparisons', () => {
  const e = entry(); switchSetUnit(e, 1, 'L', ex);
  e.sets[1] = { ...e.sets[1], w: 99, done: true };
  switchSetUnit(e, 2, 'bw', ex); e.sets[2].done = true;
  const sessions = [{ id: 's', date: '2026-10-04', entries: [e] }];
  assert.equal(volume(ex, e.sets), 160);
  assert.equal(exposures(sessions, ex)[0].sets.length, 1);
  assert.equal(exposures(sessions, { ...ex, unit: 'L' })[0].sets[0].w, 99);
  const d = { id: 'next', date: '2026-10-04', name: 'Workout', start: Date.now(), entries: [e] };
  const stats = summaryStats(d, [], { bench: ex });
  assert.equal(stats.done, 3); assert.equal(stats.vol, 160);
  assert.equal(muscleXP(sessions, { bench: ex }).muscles.chest.xp, 30);
});

test('JSON backup sanitization and CSV round trip preserve mixed set load types', () => {
  const e = entry(); switchSetUnit(e, 1, 'L', ex); switchSetUnit(e, 2, 'bw', ex);
  const session = { id: 's', date: '2026-10-04', name: 'Workout', entries: [e] };
  const clean = sanitizeBackup({ sessions: [session], exercises: [ex], body: [], cardio: [], settings: {} });
  assert.deepEqual(clean.sessions[0].entries[0].sets.map(s => s.loadUnit), ['kg', 'L', 'bw']);
  const csv = sessionsFromCSV(toCSV([session], { bench: ex }));
  assert.deepEqual(csv[0].entries[0].sets.map(s => s.loadUnit), ['kg', 'L', 'bw']);
});
