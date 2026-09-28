// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSplit, explainSplit, templateFor, dayMinutes, weeklyVolume, targetsFor, planGaps, AVOID } from '../js/split.js';
import { EXERCISES } from '../js/seed.js';

const exById = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const base = { goal: 'muscle', days: [1, 3, 5], experience: 'some', minutes: 60, equipment: 'gym', focus: [], protect: [] };
const build = extra => buildSplit({ ...base, ...extra }, exById);
const ids = p => p.days.flatMap(d => d.slots.map(s => s.exId));
const training = p => p.days.filter(d => d.slots.length);

const PERSONAS = {
  newHome2: { goal: 'general', days: [2, 5], experience: 'new', minutes: 45, equipment: 'home' },
  db3: { days: [1, 3, 5], equipment: 'db' },
  gym4str: { goal: 'strength', days: [1, 2, 4, 5], minutes: 75 },
  fl5back: { goal: 'fatloss', days: [1, 2, 3, 5, 6], protect: ['lowerback'] },
  exp6: { days: [1, 2, 3, 4, 5, 6], experience: 'experienced', minutes: 75 },
  kneeShoulder: { experience: 'new', protect: ['knees', 'shoulders'] },
  min30: { days: [1, 2, 4, 5], minutes: 30 },
  arms: { days: [1, 2, 4, 5], focus: ['Biceps', 'Triceps'] },
  home5knees: { days: [1, 2, 3, 5, 6], minutes: 45, equipment: 'home', protect: ['knees'] },
};

test('every persona gets a full week, valid slots, and sessions that fit the time', () => {
  for (const [k, extra] of Object.entries(PERSONAS)) {
    const a = { ...base, ...extra };
    const p = buildSplit(a, exById);
    assert.equal(p.days.length, 7, k);
    assert.deepEqual(p.days.map(d => d.dow), [1, 2, 3, 4, 5, 6, 0], k);
    assert.equal(training(p).length, a.days.length, k);
    for (const d of training(p)) {
      assert.ok(d.slots.length >= 3, `${k} ${d.name} has ${d.slots.length} exercises`);
      assert.ok(dayMinutes(d, exById) <= (a.minutes >= 75 ? 80 : a.minutes) + 1, `${k} ${d.name} ${dayMinutes(d, exById)} min`);
      assert.equal(new Set(d.slots.map(s => s.exId)).size, d.slots.length, `${k} ${d.name} repeats an exercise`);
      for (const s of d.slots) {
        assert.ok(exById[s.exId], `${k}: unknown ${s.exId}`);
        assert.ok(s.sets >= 2 && s.sets <= 5 && s.lo < s.hi, `${k}: ${JSON.stringify(s)}`);
        assert.equal(Object.keys(s).sort().join(), 'exId,group,hi,lo,sets', 'no internal fields leak into the saved programme');
      }
    }
  }
});

test('no weekly muscle goes over 20 sets unless it is a priority', () => {
  for (const [k, extra] of Object.entries(PERSONAS)) {
    const a = { ...base, ...extra };
    const vol = weeklyVolume(buildSplit(a, exById), exById);
    for (const [m, v] of Object.entries(vol)) if (m !== 'Front delts' && !a.focus?.includes(m)) assert.ok(v <= 20.5, `${k} ${m} ${v}`);
  }
});

test('with enough time, no muscle is left short (side delts, hamstrings, calves included)', () => {
  for (const extra of [{ days: [1, 2, 4, 5] }, { days: [1, 2, 3, 5, 6] }, { days: [1, 2, 4, 5], experience: 'experienced', minutes: 75 }, { days: [1, 3, 5], equipment: 'db' }]) {
    const a = { ...base, ...extra };
    assert.deepEqual(planGaps(buildSplit(a, exById), a, exById).map(g => g.m), [], JSON.stringify(extra));
  }
  // Three hour-long gym days: the big muscles are always covered, small ones may run a little short.
  const a = { ...base, days: [1, 3, 5] };
  const gaps = planGaps(buildSplit(a, exById), a, exById).map(g => g.m);
  for (const m of ['Chest', 'Back', 'Quads', 'Hamstrings', 'Glutes']) assert.ok(!gaps.includes(m), `${m} short in ${gaps}`);
});

test('protected joints remove every exercise that loads them, but training still covers the area', () => {
  for (const eq of ['gym', 'db', 'home']) for (const j of Object.keys(AVOID)) {
    const p = build({ equipment: eq, protect: [j], days: [1, 2, 4, 5] });
    const bad = ids(p).filter(id => AVOID[j].includes(id));
    assert.deepEqual(bad, [], `${eq}/${j}`);
  }
  const back = weeklyVolume(build({ protect: ['lowerback'], days: [1, 2, 4, 5] }), exById);
  assert.ok(back.Hamstrings >= 8, `hamstrings still trained without hinges: ${back.Hamstrings}`);
});

test('strength goal puts the first lifts in a low rep range; accessories stay moderate', () => {
  const p = build({ goal: 'strength', days: [1, 2, 4, 5] });
  for (const d of training(p)) {
    assert.ok(d.slots[0].hi <= 6, `${d.name} first lift ${d.slots[0].lo}-${d.slots[0].hi}`);
    assert.ok(d.slots.some(s => s.lo >= 8), `${d.name} has accessories`);
  }
});

test('fat loss keeps the same sets as building muscle', () => {
  const sum = p => p.days.reduce((t, d) => t + d.slots.reduce((x, s) => x + s.sets, 0), 0);
  assert.equal(sum(build({ goal: 'fatloss' })), sum(build({ goal: 'muscle' })));
});

test('priority muscles get more weekly sets', () => {
  const plain = weeklyVolume(build({ days: [1, 2, 4, 5] }), exById);
  const arms = weeklyVolume(build({ days: [1, 2, 4, 5], focus: ['Biceps', 'Triceps'] }), exById);
  assert.ok(arms.Biceps > plain.Biceps && arms.Triceps > plain.Triceps, JSON.stringify({ plain, arms }));
});

test('home plans use bodyweight moves only, never a loaded dumbbell exercise or plank-seconds', () => {
  for (const n of [[2, 5], [1, 3, 5], [1, 2, 4, 5], [1, 2, 3, 5, 6], [1, 2, 3, 4, 5, 6]]) {
    const p = build({ equipment: 'home', days: n });
    for (const id of ids(p)) assert.equal(exById[id].unit, 'bw', `${id} in a home plan`);
    assert.ok(!ids(p).includes('plank'));
    assert.ok(!training(p).some(d => /^(Push|Pull|Legs)/.test(d.name)), 'home plans avoid thin push/pull/legs days');
  }
  const db = ids(build({ equipment: 'db', days: [1, 2, 4, 5] }));
  for (const id of db) assert.ok(['db', 'bw'].includes(exById[id].equip), `${id} in a dumbbell plan`);
});

test('beginners get full-body days; templates by day count', () => {
  assert.deepEqual(templateFor(3, 'new'), ['fullA', 'fullB', 'fullC']);
  assert.deepEqual(templateFor(3, 'experienced'), ['push', 'pull', 'legs']);
  assert.deepEqual(templateFor(4, 'some'), ['upper', 'lower', 'upper', 'lower']);
  assert.equal(templateFor(6, 'some', 'home').includes('push'), false);
  const p = build({ experience: 'new' });
  assert.ok(training(p).every(d => d.name.startsWith('Full body')));
});

test('short sessions stay short but still train more than three exercises', () => {
  const p = build({ days: [1, 2, 4, 5], minutes: 30 });
  for (const d of training(p)) assert.ok(dayMinutes(d, exById) <= 31 && d.slots.length >= 3, `${d.name}`);
});

test('duplicate or out-of-range days are cleaned, at most 6 training days', () => {
  const p = build({ days: [1, 1, 3, 9, -1, 5] });
  assert.equal(training(p).length, 3);
  assert.equal(training(build({ days: [0, 1, 2, 3, 4, 5, 6] })).length, 6);
});

test('explanations match the plan and never claim twice a week for one day', () => {
  assert.doesNotMatch(explainSplit({ ...base, days: [3] }), /twice/);
  assert.match(explainSplit({ ...base, days: [1, 2, 4, 5] }), /upper and lower/);
  assert.match(explainSplit({ ...base, goal: 'strength' }), /lower-rep/);
  assert.match(explainSplit({ ...base, days: [1, 2, 3, 5, 6], equipment: 'home' }), /upper and lower/);
});

test('targets rise with experience and focus', () => {
  assert.ok(targetsFor({ experience: 'experienced' }).Chest[0] > targetsFor({ experience: 'new' }).Chest[0]);
  assert.ok(targetsFor({ focus: ['Chest'] }).Chest[0] > targetsFor({}).Chest[0]);
});

test('unknown or deleted exercises are skipped, not crashed on', () => {
  const lib = { ...exById };
  delete lib.bench; delete lib.pulldown;
  const p = buildSplit({ ...base }, lib);
  assert.ok(!ids(p).includes('bench') && !ids(p).includes('pulldown'));
  assert.ok(training(p).every(d => d.slots.length >= 3));
});
