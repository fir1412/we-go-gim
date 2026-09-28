// The three items left after the QA rounds: EZ bar weight, skull crushers on an EZ bar, impossible years.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location ??= { search: '' };
const { barKgFor, isOddBar } = await import('../js/engine.js');
const { badYearsIn, parseLogText } = await import('../js/io.js');
const { sanitizeBackup } = await import('../js/state.js');
const { EXERCISES } = await import('../js/seed.js');
const skull = EXERCISES.find(e => e.id === 'skull'), ez = EXERCISES.find(e => e.id === 'ezcurl');

test('skull crushers use the EZ bar, unless the name says straight or Olympic bar', () => {
  assert.ok(isOddBar(skull));
  assert.equal(barKgFor(skull, { barKg: 20 }), null);
  assert.equal(isOddBar({ ...skull, id: 'x', name: 'Straight bar skull crusher' }), false);
});

test('a set EZ bar weight is used for EZ lifts and skull crushers, not for the trap bar', () => {
  const equip = { barKg: 20, ezBarKg: 8 };
  assert.equal(barKgFor(ez, equip), 8);
  assert.equal(barKgFor(skull, equip), 8);
  assert.equal(barKgFor({ id: 'trapdl', name: 'Trap bar deadlift', equip: 'barbell' }, equip), null);
});

test('backups keep a sensible EZ bar weight only', () => {
  const eq = x => sanitizeBackup({ app: 'setlist', version: 1, sessions: [], settings: { equip: { plates: [20], barKg: 20, ezBarKg: x } } }).settings.equip.ezBarKg;
  assert.equal(eq(8.5), 8.5);
  assert.equal(eq(500), undefined);
  assert.equal(eq('x'), undefined);
});

test('dates with an impossible year are reported, real ones are not', () => {
  assert.deepEqual(badYearsIn('21/9/9999\nSquat 60kg x5\n2026-09-21\n0001-01-05').sort(), ['1', '9999']);
  assert.deepEqual(badYearsIn('21 Sep 2026\nMay 3, 2025\nSquat 60kg x 5'), []);
  assert.deepEqual(badYearsIn('21 Sep 3000'), ['3000']);
  const r = parseLogText('21/9/9999\nSquat 60kg x5', []);
  assert.equal(r.sessions.length, 0);
  assert.deepEqual(r.badYears, ['9999']);
});
