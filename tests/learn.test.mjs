import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MISSIONS, MISSION_IDS, learnProgress, missionFor, cleanLearn } from '../js/learn.js';

test('every mission has a title, an explanation and a way to finish it', () => {
  assert.equal(new Set(MISSION_IDS).size, MISSIONS.length);
  for (const m of MISSIONS) {
    assert.ok(m.title && m.about && m.icon, m.id);
    assert.ok(m.id === 'tour' || m.acts.length || m.routes.length, m.id + ' can never be done');
  }
});

test('a tap or a visit finishes the matching mission once', () => {
  assert.equal(missionFor({ act: 'done' }, {}).id, 'set');
  assert.equal(missionFor({ route: 'atlas' }, {}).id, 'atlas');
  assert.equal(missionFor({ act: 'done' }, { learn: { set: '2026-09-28' } }), null);
  assert.equal(missionFor({ act: 'bump' }, {}), null);
});

test('progress counts done missions and knows when all are done', () => {
  assert.deepEqual(learnProgress({}).n, 0);
  const all = Object.fromEntries(MISSION_IDS.map((id, i) => [id, `2026-09-${String(10 + i).padStart(2, '0')}`]));
  const p = learnProgress({ learn: all });
  assert.ok(p.all);
  assert.equal(p.last, '2026-09-19');
});

test('backups keep only known missions with real dates', () => {
  assert.deepEqual(cleanLearn({ set: '2026-09-28', bogus: '2026-09-28', why: 5, atlas: '<b>' }), { set: '2026-09-28' });
  assert.deepEqual(cleanLearn('x'), {});
});
