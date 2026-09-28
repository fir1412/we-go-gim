// Run: node --test tests/workout-qa.test.mjs
// Regression tests for the workout-screen findings in QA agent 3's report (agent-3-flows.md, 2026-09-28).
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location ??= { search: '' };
const E = await import('../js/engine.js');
const { EXERCISES } = await import('../js/seed.js');
const byId = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

const dblat = byId.dblat, arnold = byId.arnold, ezcurl = byId.ezcurl;
const bench = { id: 'b', name: 'Bench', unit: 'kg', equip: 'barbell', inc: 2.5, rest: 120, muscles: ['Chest'] };
const RACK = [2, 4, 6, 8, 10, 12.5, 15, 17.5, 20];
const decimals = x => (String(x).split('.')[1] || '').length;

function inLb(fn) { E.setUnits('lb'); try { return fn(); } finally { E.setUnits('kg'); } }

// ---- 1. kg -> lb -> kg leaves 3-decimal weights; + in lb ignores the dumbbell rack -----------------
test('1a kg display is rounded to 0.01 kg, so lb-derived loads never show 3 decimals', () => {
  E.setUnits('kg');
  assert.equal(E.toDisp(13.381), 13.38);
  assert.equal(E.toDisp(63.503), 63.5);
  assert.equal(E.toDisp(60), 60);
  assert.equal(E.toDisp(''), '');
  assert.equal(E.toDisp(null), null);
});

test('1b dumbbell + and − step through the dumbbells the user owns, in lb and in kg', () => {
  const equip = { dumbbells: RACK };
  inLb(() => {
    let w = 10;
    const seen = [];
    for (let i = 0; i < 4; i++) { w = E.stepLoad(w, dblat, 1, { step: 1, dumbbells: equip.dumbbells }); seen.push(w); }
    assert.deepEqual(seen, [12.5, 15, 17.5, 20]); // stored kg are rack values, not 2.5 lb steps
    assert.equal(E.stepLoad(20, dblat, -1, { step: 1, dumbbells: RACK }), 17.5);
    // A typed off-rack weight moves to the next dumbbell each way.
    const typed = E.fromDisp(35); // 35 lb = 15.876 kg
    assert.equal(E.stepLoad(typed, dblat, 1, { step: 1, dumbbells: RACK }), 17.5);
    assert.equal(E.stepLoad(typed, dblat, -1, { step: 1, dumbbells: RACK }), 15);
  });
  assert.equal(E.stepLoad(8, arnold, 1, { step: 2, dumbbells: RACK }), 10);
  assert.equal(E.stepLoad(10, arnold, 1, { step: 2, dumbbells: RACK }), 12.5);
  // Past the heaviest dumbbell the normal step applies.
  assert.equal(E.stepLoad(20, arnold, 1, { step: 2, dumbbells: RACK }), 22);
  // No rack listed: the normal step.
  assert.equal(E.stepLoad(10, arnold, 1, { step: 2 }), 12);
});

test('1c lb steps store kg rounded to 0.01 and round-trip to the same lb number', () => {
  inLb(() => {
    let w = E.fromDisp(135);
    for (const want of [140, 145, 150]) {
      w = E.stepLoad(w, bench, 1, { step: 2.5 });
      assert.ok(decimals(w) <= 2, `stored ${w}`);
      assert.equal(E.toDisp(w), want);
    }
    w = E.stepLoad(w, bench, -1, { step: 2.5 });
    assert.equal(E.toDisp(w), 145);
    assert.equal(E.stepLoad(0, bench, -1, { step: 2.5 }), 0);
  });
  // Then back in kg the field shows at most 2 decimals.
  E.setUnits('kg');
  const w = inLb(() => E.stepLoad(E.fromDisp(22), dblat, 1, { step: 1 }));
  assert.ok(decimals(E.toDisp(w)) <= 2);
});

test('1d in kg, + on a load that came from lb snaps to the step grid instead of keeping the odd decimals', () => {
  E.setUnits('kg');
  assert.equal(E.stepLoad(16.381, arnold, 1, { step: 1 }), 17);
  assert.equal(E.stepLoad(16.381, arnold, -1, { step: 1 }), 16);
  assert.equal(E.stepLoad(63.503, bench, 1, { step: 2.5 }), 65);
  assert.equal(E.stepLoad(63.503, bench, -1, { step: 2.5 }), 62.5);
  // Normal kg loads keep adding the plain step, even off the step grid.
  assert.equal(E.stepLoad(21, bench, 1, { step: 2.5 }), 23.5);
  assert.equal(E.stepLoad(60, bench, -1, { step: 2.5 }), 57.5);
  assert.equal(E.stepLoad(1, bench, -1, { step: 2.5 }), 0);
});

test('1e a lb value typed in is stored to 0.01 kg and shows the same lb number again', () => {
  inLb(() => {
    for (const lb of [22, 35, 37.5, 135, 227.5, 315]) {
      const kg = E.kgFromDisp(lb);
      assert.ok(decimals(kg) <= 2, `${lb} lb -> ${kg}`);
      assert.equal(E.toDisp(kg), lb);
    }
  });
  assert.equal(E.kgFromDisp(60), 60);
  assert.equal(E.kgFromDisp(''), null);
});

// ---- 3. EZ-bar curl warns "Below the 20 kg bar" ------------------------------------------------------
test('3 EZ and trap bars do not use the 20 kg Olympic bar', () => {
  const equip = { barKg: 20, smithBarKg: 15 };
  assert.equal(E.barKgFor(bench, equip), 20);
  assert.equal(E.barKgFor({ ...bench, equip: 'smith' }, equip), 15);
  assert.equal(E.barKgFor(ezcurl, equip), null); // unknown: no "below the bar" warning, no plate maths
  assert.equal(E.barKgFor(byId.trapdl, equip), null);
  assert.equal(E.barKgFor({ ...bench, name: 'EZ bar skull crusher' }, equip), null);
  assert.equal(E.barKgFor(ezcurl, { ...equip, ezBarKg: 8 }), 8);
  assert.equal(E.barKgFor(dblat, equip), 0);
  // Warm-ups for a 10 kg EZ curl don't start with a 20 kg empty bar.
  const ws = E.warmup(25, ezcurl, equip);
  assert.ok(ws.every(s => s.w < 25), JSON.stringify(ws));
  assert.notEqual(ws[0]?.w, 20);
});

// ---- 5. stale drafts and clock changes -----------------------------------------------------------------
test('5a a draft older than about 12 hours (or from the future) is stale; minutes are capped', () => {
  const now = Date.parse('2026-10-01T09:00:00Z');
  assert.deepEqual(E.draftClock(now - 45 * 60000, now), { mins: 45, stale: false });
  const old = E.draftClock(now - 3671 * 60000, now);
  assert.equal(old.stale, true);
  assert.equal(E.draftClock(now - 13 * 3600000, now).stale, true);
  assert.equal(E.draftClock(now - 11 * 3600000, now).stale, false);
  assert.equal(E.draftClock(now + 3600000, now).stale, true); // clock went backwards
  assert.equal(E.draftClock(now + 20000, now).stale, false);   // a few seconds of drift is fine
  assert.equal(E.draftClock(null, now).stale, false);
});

test('5b a rest timer more than an hour away or with a broken end time is stale', () => {
  const now = Date.parse('2026-10-01T09:00:00Z');
  assert.equal(E.timerStale({ end: now + 90000 }, now), false);
  assert.equal(E.timerStale({ end: now + (3656 * 60 + 29) * 1000 }, now), true);
  assert.equal(E.timerStale({ end: now + 3601000 }, now), true);
  assert.equal(E.timerStale({ end: NaN }, now), true);
  assert.equal(E.timerStale({ end: now - 3000 }, now), false); // just ended: the app shows "Rest done" then closes it
  assert.equal(E.timerStale(null, now), false);
});

// ---- 6. moving exercises can split a superset ------------------------------------------------------------
const ent = (id, group) => ({ id, slot: group ? { group } : undefined });
const ids = a => a.map(x => x.id).join(',');
const contiguous = a => {
  const seen = new Set();
  for (let i = 0; i < a.length; i++) {
    const g = a[i].slot?.group;
    if (!g) continue;
    if (seen.has(g) && a[i - 1]?.slot?.group !== g) return false;
    seen.add(g);
  }
  return true;
};

test('6a moving a superset member moves the pair together', () => {
  const a = [ent('x'), ent('a1', 'A'), ent('a2', 'A'), ent('y')];
  assert.equal(ids(E.moveEntry(a, 1, 1)), 'x,y,a1,a2');
  assert.equal(ids(E.moveEntry(a, 2, 1)), 'x,y,a1,a2');
  assert.equal(ids(E.moveEntry(a, 2, -1)), 'a1,a2,x,y');
  assert.equal(ids(E.moveEntry(a, 1, -1)), 'a1,a2,x,y');
});

test('6b a single exercise jumps over a whole superset, not into it', () => {
  const a = [ent('x'), ent('a1', 'A'), ent('a2', 'A'), ent('y')];
  assert.equal(ids(E.moveEntry(a, 0, 1)), 'a1,a2,x,y');
  assert.equal(ids(E.moveEntry(a, 3, -1)), 'x,y,a1,a2');
});

test('6c the ends do not move, and every move keeps superset members together', () => {
  const a = [ent('a1', 'A'), ent('a2', 'A'), ent('x'), ent('b1', 'B'), ent('b2', 'B')];
  assert.equal(E.moveEntry(a, 0, -1), null);
  assert.equal(E.moveEntry(a, 4, 1), null);
  assert.equal(E.moveEntry(a, 3, 1), null);
  assert.equal(ids(E.moveEntry(a, 3, -1)), 'a1,a2,b1,b2,x');
  for (let i = 0; i < a.length; i++) for (const d of [-1, 1]) {
    const r = E.moveEntry(a, i, d);
    if (r) { assert.ok(contiguous(r), `${i} ${d}: ${ids(r)}`); assert.equal(r.length, a.length); }
  }
  // A group with a single member left is an ordinary exercise.
  assert.equal(ids(E.moveEntry([ent('x'), ent('c1', 'C'), ent('y')], 1, 1)), 'x,y,c1');
  // An already-split superset is joined up again by moving it.
  assert.equal(ids(E.moveEntry([ent('a1', 'A'), ent('x'), ent('a2', 'A')], 2, -1)), 'a1,a2,x');
  // The input array is not changed.
  assert.equal(ids(a), 'a1,a2,x,b1,b2');
});
