import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingReminders, reminderText } from '../js/reminders.js';
import { REMINDER_BANK } from '../js/reminder-bank.js';

test('reminder bank has exactly 1000 distinct short complete messages', () => {
  assert.equal(REMINDER_BANK.length, 1000);
  assert.equal(new Set(REMINDER_BANK.map(n => n.text)).size, 1000);
  assert.ok(REMINDER_BANK.every(n => n.text.length <= 180 && n.text.endsWith('.')));
  assert.equal(reminderText(1000), reminderText(0));
});
test('training reminders are opt-in, bounded, skip logged days and keep local clock time', () => {
  const now = new Date(2026, 9, 4, 12, 0);
  const state = { settings: { onboarded: true, trainingReminders: true, remindAt: '18:30' }, program: { days: [{ dow: 0, slots: [{}] }, { dow: 1, slots: [] }] }, sessions: [{ date: '2026-10-04' }] };
  const list = trainingReminders(state, now);
  assert.equal(list.length, 3);
  assert.equal(new Date(list[0].at).getDate(), 11);
  assert.ok(list.every(n => new Date(n.at).getHours() === 18 && new Date(n.at).getMinutes() === 30 && n.id >= 2000 && n.id < 2028));
  state.settings.trainingReminderText = 'My own reminder.';
  assert.equal(trainingReminders(state, now)[0].body, 'My own reminder.');
  state.settings.sample = true; assert.deepEqual(trainingReminders(state, now), []);
  state.settings.sample = false; state.settings.trainingReminders = false; assert.deepEqual(trainingReminders(state, now), []);
});
