// displayText: text read outside the screen (calendar events) gets the same pass as the screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayText, setPlain, setRawTexts, plainText } from '../js/plain.js';

const upper = s => s.toUpperCase(); // a stand-in translator, so the order of the two steps is visible

test('gym terms in English: the text is left exactly as written', () => {
  setPlain(false, null);
  assert.equal(displayText('Upper 5×5'), 'Upper 5×5');
  assert.equal(displayText('DB bench 3×8–12'), 'DB bench 3×8–12');
});

test('plain wording in English: shorthand is written out, as on screen', () => {
  setPlain(true, null);
  assert.equal(displayText('Lower 4×6'), plainText('Lower 4×6'));
  assert.equal(displayText('Lower 4×6'), 'Lower 4 sets of 6');
});

test('another language: plain English first, then the translation', () => {
  setPlain(true, upper);
  assert.equal(displayText('Push 3×10'), 'PUSH 3 SETS OF 10');
});

test('another language with gym terms: translated without the plain-English rewrite', () => {
  setPlain(false, upper);
  assert.equal(displayText('Pull 2×15'), 'PULL 2×15');
});

test('a name the user typed stays as typed, whatever the settings', () => {
  setPlain(true, upper);
  setRawTexts(['Abs lift up 3×9']);
  assert.equal(displayText('Abs lift up 3×9'), 'Abs lift up 3×9');
  setRawTexts([]);
});

test('empty text passes through', () => {
  setPlain(true, upper);
  assert.equal(displayText(''), '');
  assert.equal(displayText(null), null);
  setPlain(false, null);
});
