import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../js/state.js';
import { streakInfo, quests } from '../js/gamify.js';

// A 3-day plan: Monday, Wednesday, Friday.
const plan = { days: [0, 1, 2, 3, 4, 5, 6].map(dow => ({ dow, name: [1, 3, 5].includes(dow) ? 'Full body' : 'Rest', slots: [1, 3, 5].includes(dow) ? [{ exId: 'squat', sets: 3, lo: 5, hi: 8 }] : [] })) };
const sess = dates => dates.map((date, i) => ({ id: 's' + i, date, name: 'Full body', entries: [] }));
function setup(dates) {
  S.program = plan; S.settings = { missedReminders: true }; S.exById = {}; S.sessions = sess(dates);
}

test('streak: every workout counts, rest days never break it, moved days are fine', () => {
  // Weeks (Mon–Sun) of 2026-09: 7–13, 14–20, 21–27. Three workouts a week, on different days each week.
  setup(['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-15', '2026-09-16', '2026-09-19', '2026-09-22', '2026-09-24', '2026-09-26']);
  const st = streakInfo('2026-09-28');
  assert.equal(st.streak, 9);
  assert.equal(st.best, 9);
  assert.equal(st.perfectWeeks, 2); // the first, partial week is never judged
  assert.equal(st.shields, 2);
});

test('streak: one missed workout a week is forgiven', () => {
  // 21–27 has 2 of 3: forgiven, no shield used.
  setup(['2026-09-07', '2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21', '2026-09-23']);
  const st = streakInfo('2026-09-28');
  assert.equal(st.streak, 6);
  assert.equal(st.shieldUsed, null);
});

test('streak: a very short week uses a shield, then resets when shields run out', () => {
  // Starter shield + perfect week 14–20 = 2 shields. 21–27 has 1 of 3 (one miss forgiven, one shield used).
  // 28 Sep–4 Oct has 0 of 3: two needed, one left, so the streak resets.
  setup(['2026-09-07', '2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21']);
  const mid = streakInfo('2026-09-28');
  assert.equal(mid.streak, 5);
  assert.equal(mid.shieldUsed, '2026-09-27');
  const later = streakInfo('2026-10-05');
  assert.equal(later.streak, 0);
  assert.equal(later.best, 5);
});

test('streak: the week in progress is never judged', () => {
  setup(['2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21']);
  assert.equal(streakInfo('2026-09-24').streak, 4);
});

test('quests: three on a training day, none on a rest day', () => {
  setup(['2026-09-28']);
  const q = quests('2026-09-28'); // Monday, trained
  assert.equal(q.length, 3);
  assert.equal(q[0].done, true);
  assert.deepEqual(quests('2026-09-29'), []); // Tuesday, rest
});
