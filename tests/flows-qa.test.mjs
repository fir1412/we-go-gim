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

test('a draft left open for days saves its date but no made-up length', async () => {
  S.sessions = []; S.cardio = [];
  S.draft = { ...draft(), start: Date.now() - 3 * 24 * 3600e3 };
  const s = await state.commitDraft();
  assert.equal(s.start, null); assert.equal(s.end, null); assert.equal(s.minutes, null);
  S.draft = { ...draft(), id: 'w2', start: Date.now() - 40 * 60e3 };
  const t = await state.commitDraft();
  assert.ok(t.end - t.start >= 40 * 60e3 - 1000);
});

test('a workout that fails to save (storage full) stays open instead of vanishing', async () => {
  S.sessions = []; S.cardio = []; S.draft = draft();
  const set = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  try { await assert.rejects(state.commitDraft()); } finally { localStorage.setItem = set; }
  assert.equal(S.draft?.id, 'w1');
});

test('reps left (RIR) tapped in a workout is kept in the saved session', async () => {
  S.sessions = []; S.cardio = [];
  S.draft = { ...draft(), cardio: [], entries: [{ exId: 'bench', slot: null, sets: [{ w: 20, r: 8, done: true }], rir: '2', pain: false, note: '' }] };
  const saved = await state.commitDraft();
  assert.equal(saved.entries[0].rir, '2');
  assert.equal(S.sessions.find(s => s.id === 'w1').entries[0].rir, '2');
});
