// Run: node --test tests/
// 1.4.0: pasted plans written the way experienced lifters write them. Every plan here is made up for the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSplitText } from '../js/split.js';

test('"Push A" headers, A1/A2 supersets, letter labels, "5 sets of 5", intensity kept as notes', () => {
  const r = parseSplitText('My plan\n\nPush A\nA1. Bench press 5 sets of 5 @ 80%\nA2. Barbell row 5x5\nB. Trap Bar Deadlift 3x5+\nSquat 65% x5, 75% x5, 85% x5+\nPull-ups 3 x AMRAP\nOHP RPE 8 3x5\n\nPull A\nDeadlift 1x5\n\nUpper B\nChin up 3 sets of 8-12 reps');
  assert.deepEqual(r.days.map(d => `${d.dow}:${d.name}`), ['1:Push A', '3:Pull A', '5:Upper B']);
  const it = r.days[0].items;
  assert.deepEqual(it.map(x => x.name), ['Bench press', 'Barbell row', 'Trap Bar Deadlift', 'Squat', 'Pull-ups', 'OHP']);
  assert.deepEqual([it[0].sets, it[0].lo, it[0].hi, it[0].note, it[0].group], [5, 5, 5, '@ 80%', 'A']);
  assert.equal(it[1].group, 'A');
  assert.equal(it[2].group, '');
  assert.equal(it[2].note, '5+');
  assert.deepEqual([it[3].sets, it[3].lo, it[3].note], [3, 5, '65% x5, 75% x5, 85% x5+']);
  assert.equal(it[4].note, 'AMRAP');
  assert.equal(it[5].note, 'RPE 8');
  assert.deepEqual([r.days[2].items[0].sets, r.days[2].items[0].lo, r.days[2].items[0].hi], [3, 8, 12]);
  assert.deepEqual(r.skipped, ['My plan']);
  assert.deepEqual(r.notAdded, []);
});

test('a workout name at the very start is a day; "Day A" still works', () => {
  const r = parseSplitText('Upper\nBench 3x8\nRow 3x10\n\nLower\nSquat 3x5\n');
  assert.deepEqual(r.days.map(d => `${d.dow}:${d.name}:${d.items.length}`), ['1:Upper:2', '4:Lower:1']);
  assert.deepEqual(parseSplitText('Day A\nSquat 3x5\nDay B\nBench 3x5').days.map(d => d.name), ['Day A', 'Day B']);
});

test('distances and timed rounds are listed as not added', () => {
  const r = parseSplitText('Monday – Conditioning\nRow 5×500m\nEMOM 10 min: 3 power cleans\nFarmer carry 3x40m\nPlank 3x30sec\nKB swing 3x15');
  assert.deepEqual(r.days[0].items.map(x => x.name), ['Plank', 'KB swing']);
  assert.deepEqual(r.notAdded, ['Row 5×500m', 'EMOM 10 min: 3 power cleans', 'Farmer carry 3x40m']);
});

test('with weekday headers, a muscle word after a gap is a section, not a new day', () => {
  const r = parseSplitText('Monday – Upper\nBench 3x8\n\nArms\nCurl 3x10\n\nThursday – Lower\nSquat 3x5');
  assert.deepEqual(r.days.map(d => `${d.dow}:${d.name}:${d.items.length}`), ['1:Upper:2', '4:Lower:1']);
});

test('a lone superset label is just numbering', () => {
  const r = parseSplitText('Push A\nA1 Bench 3x8\nB1 Fly 3x12\nB2 Pushdown 3x12');
  assert.deepEqual(r.days[0].items.map(x => x.group), ['', 'B', 'B']);
  assert.deepEqual(r.days[0].items.map(x => x.name), ['Bench', 'Fly', 'Pushdown']);
});
