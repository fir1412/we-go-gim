import { test } from 'node:test';
import assert from 'node:assert/strict';
import { norm, score } from '../js/search.js';

test('every word must match, in any order', () => {
  assert.ok(score('db bench press chest', 'bench db'));
  assert.ok(score('db bench press chest', 'press chest'));
  assert.equal(score('db bench press chest', 'bench squat'), 0);
});

test('hyphens, spacing and accents do not matter', () => {
  assert.ok(score('pull-up back lats', 'pullup'));
  assert.ok(score('pull up back', 'pull-up'));
  assert.equal(norm('Café  Curl'), 'cafe curl');
});

test('names that start with the query rank above ones that only contain it', () => {
  assert.ok(score('row cable back', 'row') > score('barbell row back', 'row'));
  assert.ok(score('barbell row back', 'row') > score('narrow grip press', 'row'));
});

test('partial words match while typing', () => {
  for (const q of ['s', 'sq', 'squ', 'squa', 'squat']) assert.ok(score('back squat legs', q), q);
});

test('translated names match (non-Latin text)', () => {
  assert.ok(score('bench press chest 卧推', '卧推'));
  assert.ok(score('squat legs スクワット', 'スクワット'));
});

test('empty query shows everything', () => assert.equal(score('anything', '  '), 1));
