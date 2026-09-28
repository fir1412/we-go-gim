// Screen tests for the workout: the flows checked by hand before each release, now in a real (headless) Chrome
// on a phone-sized screen. Run with: node --test tests/e2e/*.e2e.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, freshWorkout, readDraft, chromePath } from './browser.mjs';

const skip = chromePath() ? false : 'no Chrome found (set CHROME_PATH)';
let b;
before(async () => { if (!skip) b = await launch(); });
after(async () => { await b?.close(); });

/** Weight and reps typed into every set of the n-th exercise card, then every set ticked. */
const finishCard = n => b.run(async n => {
  const card = document.querySelectorAll('#screen article.exc:not(.cardioc)')[n];
  const id = card.id;
  const put = (el, v) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); };
  for (const row of card.querySelectorAll('.set')) { put(row.querySelector('input[data-f="w"]'), '20'); put(row.querySelector('input[data-f="r"]'), '8'); }
  for (let i = 0; i < 12; i++) {
    const tick = document.getElementById(id)?.querySelector('[data-act="done"][aria-pressed="false"]');
    if (!tick) break;
    tick.click(); await new Promise(r => setTimeout(r, 60));
  }
  document.querySelector('.scrim')?.click();
  return id;
}, n);

/** Centre of an element's header text, in screen pixels. */
const headerPoint = id => b.run(id => { const r = document.getElementById(id).querySelector('header p, .foldbtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, id);

test('a weight typed with a comma is saved as a decimal', { skip }, async () => {
  await freshWorkout(b);
  await b.run(() => document.querySelector('[data-input="set"][data-f="w"]').focus());
  await new Promise(r => setTimeout(r, 100));
  await b.type('42,5');
  assert.equal(await b.run(() => document.activeElement.value), '42.5');
  await b.run(() => document.activeElement.blur());
  assert.equal((await readDraft(b)).entries[0].sets[0].w, 42.5);
});

test('a number typed but not confirmed is saved before the field is left', { skip }, async () => {
  await freshWorkout(b);
  // (DevTools' insertText ignores a number field's selection, so the old reps are cleared by hand first.)
  await b.run(() => { const el = document.querySelectorAll('[data-input="set"][data-f="r"]')[1]; el.focus(); el.value = ''; });
  await b.type('11');
  await new Promise(r => setTimeout(r, 700)); // the keystroke save waits a moment
  assert.equal(await b.run(() => document.activeElement.dataset.f), 'r', 'still typing in the field');
  assert.equal((await readDraft(b)).entries[0].sets[1].r, 11);
});

test('a finished card folds, opens, and folds again with the ^ button', { skip }, async () => {
  await freshWorkout(b);
  const id = await finishCard(0);
  const state = () => b.run(id => { const c = document.getElementById(id); return { fold: c.classList.contains('fold'), up: !!c.querySelector('[data-act="fold"]'), chip: !!c.querySelector('.whybtn, .chip') }; }, id);
  let s = await state();
  assert.ok(s.fold || s.up, 'finished card is folded or offers ^');
  if (!s.fold) await b.run(id => document.getElementById(id).querySelector('[data-act="fold"]').click(), id);
  assert.equal((await state()).fold, true);
  await b.run(id => document.getElementById(id).querySelector('[data-act="unfold"]').click(), id);
  s = await state();
  assert.deepEqual([s.fold, s.up, s.chip], [false, true, false], 'open again, with ^ and no target chip crowding the name');
  await b.run(id => document.getElementById(id).querySelector('[data-act="fold"]').click(), id);
  assert.equal((await state()).fold, true);
});

test('back from an exercise\'s details returns to the workout, at the same place', { skip }, async () => {
  await freshWorkout(b);
  const top = await b.run(() => { const a = document.querySelectorAll('#screen article.exc h2 a')[3]; a.scrollIntoView(); return document.getElementById('screen').scrollTop; });
  await b.run(() => document.querySelectorAll('#screen article.exc h2 a')[3].click());
  await b.until(() => location.hash.startsWith('#/ex/'), 'the details screen');
  assert.equal(await b.run(() => document.querySelector('#bar a[aria-label="Back"]').getAttribute('href')), '#/workout');
  await b.run(() => document.querySelector('#bar a[aria-label="Back"]').click());
  await b.until(() => location.hash === '#/workout' && document.querySelector('#screen article.exc'), 'the workout again');
  const now = await b.run(() => document.getElementById('screen').scrollTop);
  assert.ok(top > 100 && Math.abs(now - top) < 40, `scroll kept (${top} → ${now})`);
});

test('swiping a card left skips the exercise; a short or vertical drag does not', { skip }, async () => {
  await freshWorkout(b);
  const id = await b.run(() => { const c = document.querySelectorAll('#screen article.exc')[1]; c.scrollIntoView({ block: 'center' }); return c.id; });
  const count = () => b.run(() => document.querySelector('.sbar .num').textContent);
  const skipped = () => b.run(id => document.getElementById(id).classList.contains('skipped'), id);
  const before = await count();
  let [x, y] = await headerPoint(id);
  await b.drag(x + 60, y, -40, 0);
  assert.equal(await skipped(), false, 'short drag springs back');
  await b.drag(x, y, -30, 160);
  assert.equal(await skipped(), false, 'vertical drag scrolls, never skips');
  await b.run(id => document.getElementById(id).scrollIntoView({ block: 'center' }), id);
  [x, y] = await headerPoint(id);
  await b.drag(x + 80, y, -220, 4);
  assert.equal(await skipped(), true, 'long swipe skips');
  assert.notEqual(await count(), before, 'its sets stop counting');
  await b.run(id => document.getElementById(id).querySelector('[data-act="unskip"]').click(), id);
  assert.equal(await skipped(), false, 'Undo on the card brings it back');
  assert.equal(await count(), before);
});

test('the rest timer\'s "Next" follows a skip', { skip }, async () => {
  await freshWorkout(b);
  await finishCard(0);
  const [nextName, afterName] = await b.run(() => [...document.querySelectorAll('#screen article.exc h2 a')].slice(1, 3).map(a => a.textContent));
  const label = () => b.run(() => document.querySelector('#timer .t b')?.textContent || '');
  assert.match(await label(), new RegExp(`^Next: ${nextName}`));
  const id = await b.run(() => document.querySelectorAll('#screen article.exc')[1].id);
  await b.run(id => document.getElementById(id).querySelector('[data-act="menu"]').click(), id);
  await b.until(() => document.querySelector('.sheet [data-act="skip"]'), 'the menu');
  await b.run(() => document.querySelector('.sheet [data-act="skip"]').click());
  await new Promise(r => setTimeout(r, 700)); // the timer bar repaints every half second
  assert.match(await label(), new RegExp(`^Next: ${afterName}`));
});
