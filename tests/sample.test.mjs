// Run: node --test tests/sample.test.mjs
// "Look around with sample data": made-up weeks that read like a real log, and "Start for real" takes them all back.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };
globalThis.location ??= { search: '' };
const state = await import('../js/state.js');
const { S } = state;
const { PROGRAM, EXERCISES } = await import('../js/seed.js');
const { sampleData } = await import('../js/sample.js');
const { suggest } = await import('../js/engine.js');
await state.load();

const today = '2026-09-30';
const exById = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const { sessions, body } = sampleData(today, PROGRAM, exById);
const byDate = id => sessions.filter(s => s.entries.some(e => e.exId === id)).sort((a, b) => (a.date < b.date ? -1 : 1)).map(s => s.entries.find(e => e.exId === id));

test('sample weeks: past dates only, all marked, on the programme', () => {
  assert.ok(sessions.length >= 30, `${sessions.length} sessions`);
  assert.ok(sessions.every(s => s.seed && s.date < today && s.entries.length));
  assert.ok(body.length > 4 && body.every(b => b.seed && b.date <= today));
  assert.equal(new Set(sessions.map(s => s.id)).size, sessions.length);
  assert.ok(sessions.every(s => s.entries.every(e => exById[e.exId])));
});

test('lifts climb, and one stalls so Progress has something to point out', () => {
  const bench = byDate('bench').map(e => e.sets[0].w);
  assert.ok(bench.at(-1) > bench[0], `bench ${bench}`);
  const shp = byDate('shp').slice(-3).map(e => JSON.stringify(e.sets));
  assert.equal(new Set(shp).size, 1, 'the last three shoulder press sessions are the same');
});

test('Today suggests from the sample history, not "find weight"', () => {
  const slot = PROGRAM.days.find(d => d.name === 'Push').slots.find(s => s.exId === 'bench');
  const sg = suggest(slot, exById.bench, { sessions, date: today, gymId: 'g1' });
  assert.ok(sg.w > 0, JSON.stringify(sg));
});

test('adding twice keeps one copy; Start for real removes them and keeps your own workout', async () => {
  S.sessions = [{ id: 'mine', date: '2026-09-29', name: 'Push', entries: [] }];
  await state.addSeedData(sampleData(today, PROGRAM, exById));
  await state.addSeedData(sampleData(today, PROGRAM, exById));
  assert.equal(S.sessions.length, sessions.length + 1);
  assert.equal(S.settings.sample, true);
  await state.removeSeedData();
  assert.deepEqual(S.sessions.map(s => s.id), ['mine']);
  assert.equal(S.body.filter(b => b.seed).length, 0);
  assert.equal(S.settings.sample, false);
});

test('a workout started in sample mode never takes its weights from the made-up history', async () => {
  S.sessions = [];
  await state.addSeedData(sampleData(today, PROGRAM, exById));
  const push = PROGRAM.days.find(d => d.name === 'Push');
  await state.startWorkout(push, today);
  const bench = S.draft.entries.find(e => e.exId === 'bench');
  assert.equal(bench.sg.w, null, 'find your weight, not the sample 25 kg');
  await state.discardDraft();
  await state.removeSeedData();
});

test('pain two sessions running goes lighter and says to get it checked', () => {
  const slot = { exId: 'squat', sets: 3, lo: 6, hi: 10 };
  const s = (id, date, pain) => ({ id, date, gymId: 'g1', entries: [{ exId: 'squat', sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 8, done: true }, { w: 60, r: 8, done: true }], pain }] });
  const once = suggest(slot, exById.squat, { sessions: [s('a', '2026-09-20', false), s('b', '2026-09-27', true)], date: today, gymId: 'g1' });
  assert.equal(once.w, 60);
  const twice = suggest(slot, exById.squat, { sessions: [s('a', '2026-09-20', true), s('b', '2026-09-27', true)], date: today, gymId: 'g1' });
  assert.ok(twice.w < 60 && /doctor or physio/.test(twice.why), JSON.stringify(twice));
  // A poor night or a deload week must not hand the full load back.
  for (const extra of [{ poor: true }, { deload: true }]) {
    const sg = suggest(slot, exById.squat, { sessions: [s('a', '2026-09-20', true), s('b', '2026-09-27', true)], date: today, gymId: 'g1', ...extra });
    assert.ok(sg.w < 60 && /doctor or physio/.test(sg.why), JSON.stringify({ extra, sg }));
    assert.ok(sg.reps.length <= (extra.deload ? 2 : 2), 'fewer sets than planned, and no more than a deload');
  }
});

test('one lift can show lb while the app is in kg, and back', async () => {
  const E = await import('../js/engine.js');
  E.setUnits('kg');
  const lbMachine = { ...exById.legpress, disp: 'lb' };
  assert.equal(E.unitsFor(lbMachine), 'lb');
  assert.equal(E.unitsFor(exById.legpress), 'kg');
  assert.equal(E.toDisp(45.359237, lbMachine), 100);
  assert.equal(E.kgFromDisp(100, lbMachine), 45.36);
  assert.equal(E.unitShort(lbMachine), 'lb');
  assert.ok(E.stepLoad(45.359237, lbMachine, 1) > 45.36, 'steps up in lb');
  assert.equal(E.unitsFor({ ...exById.lat, unit: 'L', disp: 'lb' }), 'kg', 'levels never convert');
  E.setUnits('lb');
  assert.equal(E.unitsFor({ ...exById.bench, disp: 'kg' }), 'kg', 'a kg lift in an lb app');
  E.setUnits('kg');
  const clean = state.sanitizeBackup({ sessions: [], exercises: [{ ...exById.bench, disp: '<img onerror=x>' }, { ...exById.squat, disp: 'lb' }] });
  assert.equal(clean.exercises[0].disp, undefined);
  assert.equal(clean.exercises[1].disp, 'lb');
});

test('the sample fills every screen, and Start for real takes its daily log back but keeps your own days', async () => {
  const data = sampleData(today, PROGRAM, exById);
  assert.ok(data.sessions.every(s => s.readiness?.sleep), 'sleep on every sample workout');
  assert.ok(data.sessions.some(s => s.hr >= 150 && /leg/i.test(s.name)), 'heart rate on leg days');
  assert.equal(data.sessions.flatMap(s => s.entries).filter(e => e.pain).length, 1, 'one pain flag');
  const days = Object.keys(data.daily);
  assert.equal(days.length, 14);
  assert.ok(days.every(d => d < today && data.daily[d].seed && data.daily[d].protein > 0), 'past days only, all marked');
  // Only pain two workouts running goes lighter, so the one flag leaves Today's targets alone.
  const squatDays = data.sessions.filter(s => s.entries.some(e => e.exId === 'squat'));
  assert.ok(!squatDays.slice(-2).some(s => s.entries.some(e => e.pain)));

  S.sessions = []; S.daily = {};
  const mine = days[0], logged = days[1];
  await state.saveDaily(mine, { protein: 99 });
  await state.addSeedData(data);
  assert.equal(S.daily[mine].protein, 99, 'a day you logged is never covered');
  assert.ok(!S.daily[mine].seed);
  await state.saveDaily(logged, { water: 1 });
  assert.deepEqual(S.daily[logged], { water: 1 }, 'logging on a sample day makes it yours, without the made-up numbers');
  assert.equal(state.sanitizeBackup({ sessions: [], daily: { [days[2]]: data.daily[days[2]] } }).daily[days[2]].seed, true, 'a backup keeps the mark');
  await state.removeSeedData();
  assert.deepEqual(Object.keys(S.daily).sort(), [mine, logged].sort());
});
