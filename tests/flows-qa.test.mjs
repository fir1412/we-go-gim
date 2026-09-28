// Run: node --test tests/flows-qa.test.mjs
// Findings from QA agent 3 (every screen and flow).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };
globalThis.location ??= { search: '' };
const db = await import('../js/db.js');
const state = await import('../js/state.js');
const { S } = state;
await db.init();

const draft = () => ({ id: 'w1', date: '2026-09-21', name: 'Push', entries: [], cardio: [{ type: 'walk', min: 10, intensity: 'easy' }] });

test('a double tap on Save stores the workout and its cardio once', async () => {
  S.sessions = []; S.cardio = []; S.draft = draft();
  const [a, b] = await Promise.all([state.commitDraft(), state.commitDraft()]);
  assert.equal(a, b);
  assert.equal(S.sessions.filter(s => s.id === 'w1').length, 1);
  assert.equal(S.cardio.length, 1);
  assert.equal(S.draft, null);
});

test('saving the same workout again overwrites its cardio instead of adding more', async () => {
  S.sessions = []; S.cardio = [];
  S.draft = draft(); await state.commitDraft();
  S.draft = draft(); await state.commitDraft();
  assert.equal(S.cardio.length, 1);
});

test('deleting a workout removes the cardio logged in it, not other cardio', async () => {
  S.sessions = []; S.cardio = [];
  S.draft = draft(); await state.commitDraft();
  await state.saveCardio({ id: 'other', date: '2026-09-20', type: 'run', min: 20, intensity: 'hard', note: '' });
  await state.deleteSession('w1');
  assert.deepEqual(S.cardio.map(c => c.id), ['other']);
});
