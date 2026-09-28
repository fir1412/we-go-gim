// In-gym flow: units, warm-ups, time left, short sessions, RIR-aware progression.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';

const bench = { id: 'b', name: 'Bench', unit: 'kg', equip: 'barbell', inc: 2.5, rest: 120, muscles: ['Chest'] };
const curl = { id: 'c', name: 'Curl', unit: 'kg/DB', equip: 'db', inc: 2, rest: 60, muscles: ['Biceps'] };
const pull = { id: 'p', name: 'Pull-up', unit: 'bw', equip: 'bw', rest: 90, muscles: ['Back'] };
const cable = { id: 'l', name: 'Cable fly', unit: 'L', equip: 'cable', inc: 1, rest: 60, muscles: ['Chest'] };
const exById = { b: bench, c: curl, p: pull, l: cable };

test('units: kg is the default and lb converts on display and entry', () => {
  E.setUnits('kg');
  assert.equal(E.fmtLoad(bench, 60), '60');
  assert.equal(E.unitShort('kg'), 'kg');
  E.setUnits('lb');
  try {
    assert.equal(E.getUnits(), 'lb');
    assert.equal(E.toDisp(61.235), 135);
    assert.equal(E.fromDisp(135), 61.235);
    assert.equal(E.toDisp(E.fromDisp(137.5)), 137.5);
    assert.equal(E.fmtLoad(bench, 100), '220.5');
    assert.equal(E.unitShort('kg/DB'), 'lb ea');
    assert.equal(E.unitShort('L'), '');
    assert.equal(E.fmtLoad(cable, 7), 'L7', 'cable levels are never converted');
    assert.equal(E.fmtLoad(pull, 10), 'BW+22');
    assert.equal(E.incLabel(bench), '+5 lb');
    assert.equal(E.fromDisp(''), null);
  } finally { E.setUnits('kg'); }
});

test('plain wording labels bodyweight in full', () => {
  E.setBwLabel('Bodyweight');
  try {
    assert.equal(E.fmtLoad(pull, 0), 'Bodyweight');
    assert.equal(E.fmtLoad(pull, 5), 'Bodyweight + 5 kg');
  } finally { E.setBwLabel('BW'); }
  assert.equal(E.fmtLoad(pull, 5), 'BW+5');
});

test('barbell warm-ups start with the empty bar', () => {
  const w = E.warmup(80, bench, { barKg: 20 });
  assert.equal(w[0].w, 20);
  assert.ok(w.every(s => s.w < 80 && s.warm));
  assert.equal(new Set(w.map(s => s.w)).size, w.length, 'no repeated loads');
  assert.equal(E.warmup(20, bench, { barKg: 20 }).length, 0, 'working with the empty bar: nothing lighter');
  assert.notEqual(E.warmup(20, curl, {})[0]?.w, 20);
});

test('time left: a few quick early sets do not collapse the estimate', () => {
  const t = 1_700_000_000_000;
  const mk = (ex, n, done = 0, gap = 20) => ({ exId: ex, sets: Array.from({ length: n }, (_, i) => (i < done ? { done: true, at: t + i * gap * 1000 } : { done: false })) });
  const plan = E.estimateRemaining([mk('b', 4), mk('c', 3), mk('l', 3)], exById, [], t);
  // 3 sets ticked 20 s apart: still the plan for what's left
  const quick = E.estimateRemaining([mk('b', 4, 3), mk('c', 3), mk('l', 3)], exById, [], t + 60000);
  assert.equal(quick, plan - 3 * (bench.rest + E.SET_WORK_SEC));
  // 5 sets but only 2 minutes: pace still ignored
  const five = E.estimateRemaining([mk('b', 6, 5, 30), mk('c', 3)], exById, [], t);
  assert.equal(five, 1 * (bench.rest + E.SET_WORK_SEC) + E.TRANSITION_SEC + 3 * (curl.rest + E.SET_WORK_SEC));
  // 6 sets over 10 min at a fast pace: blended, never below 75% of plan
  const blended = E.estimateRemaining([mk('b', 8, 6, 120)], exById, [], t);
  const raw = 2 * (bench.rest + E.SET_WORK_SEC);
  assert.ok(blended < raw && blended >= raw * 0.75, `${blended} vs ${raw}`);
});

test('short session trims accessories first, then main-lift sets', () => {
  const day = { name: 'X', slots: [{ exId: 'b', sets: 4 }, { exId: 'c', sets: 4 }, { exId: 'l', sets: 4 }, { exId: 'p', sets: 3 }] };
  const counts = day.slots.map(s => s.sets);
  const full = E.planSec(day.slots, counts, exById, []);
  assert.deepEqual(E.trimToFit(day.slots, counts, exById, [], null), counts);
  assert.deepEqual(E.trimToFit(day.slots, counts, exById, [], 999), counts);
  for (const m of E.SESSION_LENGTHS) {
    const out = E.trimToFit(day.slots, counts, exById, [], m);
    assert.ok(E.planSec(day.slots, out, exById, []) <= m * 60 || out.slice(0, 2).every(n => n === 1), `${m} min: ${out}`);
    assert.ok(out[0] >= 1 && out[1] >= 1, 'main lifts always stay');
    assert.ok(out.every((n, i) => n <= counts[i]));
  }
  const t30 = E.trimToFit(day.slots, counts, exById, [], 30);
  assert.ok(E.planSec(day.slots, t30, exById, []) < full);
  assert.ok(t30[0] >= t30[3], 'the last accessory goes before the first main lift');
});

test('RIR 0 with reps below the range: same load, no extra reps', () => {
  const s = [{ id: 'a', date: '2026-09-01', entries: [{ exId: 'b', rir: '0', sets: [8, 7, 5].map(r => ({ w: 60, r, done: true })) }] }];
  const sg = E.suggest({ exId: 'b', sets: 3, lo: 6, hi: 10 }, bench, { sessions: s, date: '2026-09-08' });
  assert.equal(sg.w, 60);
  assert.notEqual(sg.t, 'load');
  assert.deepEqual(sg.reps, [8, 7, 6]);
  // Same reps with reps left: the usual +1 rep
  const s2 = [{ ...s[0], entries: [{ ...s[0].entries[0], rir: '2' }] }];
  assert.deepEqual(E.suggest({ exId: 'b', sets: 3, lo: 6, hi: 10 }, bench, { sessions: s2, date: '2026-09-08' }).reps, [9, 8, 6]);
});
