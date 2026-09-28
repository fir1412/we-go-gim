import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trainingIcs } from '../js/calendar.js';

test('calendar file: one weekly event per training day, starting on the next matching weekday', () => {
  const now = new Date(2026, 8, 28, 9, 0); // Monday 28 Sep 2026
  const ics = trainingIcs([{ dow: 1, name: 'Push', minutes: 45 }, { dow: 3, name: 'Pull; back, biceps', minutes: 50 }], '19:30', 'https://example.test/#/start', now);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /DTSTART:20260928T193000\r\n/);
  assert.match(ics, /DTSTART:20260930T193000\r\n/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=MO/);
  assert.match(ics, /RRULE:FREQ=WEEKLY;BYDAY=WE/);
  assert.match(ics, /SUMMARY:we go gim: Pull\\; back\\, biceps/);
  assert.match(ics, /TRIGGER:-PT10M/);
});

test('calendar file: a bad time falls back to 18:00', () => {
  const ics = trainingIcs([{ dow: 0, name: 'Legs' }], 'soon', '', new Date(2026, 8, 28));
  assert.match(ics, /DTSTART:20261004T180000/);
});
