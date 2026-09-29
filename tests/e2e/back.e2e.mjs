// The phone's back button goes up the app, not through every screen visited, and closes it from Today.
// Run with: node --test tests/e2e/*.e2e.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, chromePath } from './browser.mjs';

const skip = chromePath() ? false : 'no Chrome found (set CHROME_PATH)';
let b;
before(async () => { if (!skip) b = await launch(); });
after(async () => { await b?.close(); });

const screen = () => b.run(() => location.pathname.endsWith('__blank') ? 'left the app' : location.hash.replace(/^#\/?/, ''));
/** Tap an in-app link to `path`, as a real screen link would be. */
const tap = path => b.run(async p => {
  const a = Object.assign(document.createElement('a'), { href: '#/' + p });
  document.getElementById('screen').append(a); a.click();
  await new Promise(r => setTimeout(r, 120));
}, path);
const tab = name => b.run(async n => { document.querySelector(`#tabs a[data-tab="${n}"]`).click(); await new Promise(r => setTimeout(r, 120)); }, name);
const back = async () => { await b.run(() => history.back()); await new Promise(r => setTimeout(r, 250)); return screen(); };
const fresh = async () => {
  await b.go('__blank');
  await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await b.go('#/today');
  await b.until(() => document.querySelector('#tabs a'), 'the tabs');
  await b.run(() => document.querySelector('.scrim')?.click());
};

test('back climbs to Today in a few presses however many screens were visited, then leaves', { skip }, async () => {
  await fresh();
  await tab('more'); await tap('settings'); await tap('help');
  await tab('history'); await tab('insights');
  for (let n = 0; n < 20; n++) { await tap('cardio'); await tap('body'); }
  assert.equal(await screen(), 'body');

  assert.equal(await back(), 'cardio');
  assert.equal(await back(), 'insights');
  assert.equal(await back(), 'today');
  assert.equal(await b.run(() => history.state?.i), 0, 'Today is the first history entry');
  assert.equal(await back(), 'left the app');
});

test('the back arrow and a closed sheet add no extra presses', { skip }, async () => {
  await fresh();
  await tab('more'); await tap('gyms');
  await b.run(async () => { document.querySelector('#bar .iconbtn').click(); await new Promise(r => setTimeout(r, 120)); });
  assert.equal(await screen(), 'more');
  await tap('settings');
  await b.run(async () => { const ui = await import('/js/ui.js'); ui.openSheet('<p>hi</p>'); ui.closeSheet(); });
  assert.equal(await back(), 'more');
  assert.equal(await back(), 'today');
  assert.equal(await back(), 'left the app');
});
