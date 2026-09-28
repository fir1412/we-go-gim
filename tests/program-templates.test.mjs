// Run: node --test tests/
// 1.9.0: drag a day to another place in the week, and saved templates in backups. Every plan here is made up for the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveDay, blankWeek, WEEK_ORDER } from '../js/split.js';
import { sanitizeBackup } from '../js/state.js';

const day = (dow, name) => ({ dow, name, sub: '', color: 'push', slots: [{ exId: name.toLowerCase(), sets: 3, lo: 8, hi: 12, group: '' }] });
const week = p => p.days.map(d => `${d.dow}:${d.name}`).join(' ');

test('dragging a day down shifts the days in between up, rest days included', () => {
  const p = { days: [day(1, 'Push'), day(2, 'Pull'), day(4, 'Legs')] };
  assert.equal(week(moveDay(p, 1, 4)), '1:Pull 2:Rest 3:Legs 4:Push 5:Rest 6:Rest 0:Rest');
  assert.equal(week(moveDay(p, 4, 2)), '1:Push 2:Legs 3:Pull 4:Rest 5:Rest 6:Rest 0:Rest');
});

test('Sunday is the last day of the week, and the programme passed in is left alone', () => {
  const p = { days: [day(1, 'Push'), day(0, 'Legs')] };
  const before = JSON.stringify(p);
  assert.equal(week(moveDay(p, 0, 1)), '1:Legs 2:Push 3:Rest 4:Rest 5:Rest 6:Rest 0:Rest');
  assert.equal(JSON.stringify(p), before);
  const r = moveDay(p, 1, 0);
  r.days[0].slots.push('x');
  assert.equal(p.days[1].slots.length, 1, 'slots are copied, not shared');
});

test('moving a day onto itself or to a weekday that does not exist changes nothing', () => {
  const p = { days: [day(1, 'Push')] };
  assert.deepEqual(moveDay(p, 1, 1), p);
  assert.deepEqual(moveDay(p, 1, 9), p);
});

test('every weekday appears once after a move', () => {
  const p = { days: [day(1, 'A'), day(3, 'B'), day(5, 'C')] };
  for (const f of WEEK_ORDER) for (const t of WEEK_ORDER.filter(t => t !== f)) {
    const r = moveDay(p, f, t);
    assert.deepEqual(r.days.map(d => d.dow), WEEK_ORDER);
    assert.equal(r.days.filter(d => d.slots.length).length, 3);
  }
});

test('a blank week is seven rest days', () => {
  const b = blankWeek();
  assert.deepEqual(b.days.map(d => d.dow), WEEK_ORDER);
  assert.ok(b.days.every(d => !d.slots.length && d.name === 'Rest'));
});

test('templates in a backup are cleaned like the programme', () => {
  const out = sanitizeBackup({
    app: 'setlist', sessions: [],
    settings: { templates: [
      { id: 't1', name: '<b>PPL</b>'.padEnd(60, 'x'), saved: '2026-09-28', program: { days: [day(1, 'Push'), { dow: 1, name: 'Pull', slots: [{ exId: 'row', sets: 99, lo: 8, hi: 12 }] }], junk: 1 } },
      { id: 't2', name: 'No days', program: {} },
      'nonsense',
      { name: 'Bad date', saved: 'soon', program: { days: [] } },
    ] },
  });
  const t = out.settings.templates;
  assert.equal(t.length, 2);
  assert.equal(t[0].name.length, 40);
  assert.equal(t[0].program.junk, undefined);
  assert.deepEqual(t[0].program.days.map(d => d.dow).sort(), [1, 2], 'two workouts on one weekday are spread out');
  assert.equal(t[0].program.days.find(d => d.name === 'Pull').slots[0].sets, 20);
  assert.ok(t[1].id, 'a template without an id gets one');
  assert.equal(t[1].saved, undefined);
});

test('a backup can hold at most 20 templates', () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ id: 't' + i, name: 'P' + i, program: { days: [] } }));
  assert.equal(sanitizeBackup({ app: 'setlist', sessions: [], settings: { templates: many } }).settings.templates.length, 20);
});
