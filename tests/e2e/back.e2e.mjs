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

test('on Today, a sheet closed with its own button leaves one back press to close the app', { skip }, async () => {
  await fresh();
  await tab('more'); await tab('today');
  // A link tapped in the same moment the sheet closes waits for its dropped entry, then goes.
  await b.run(async () => {
    const ui = await import('/js/ui.js'); ui.openSheet('<p>hi</p>'); ui.closeSheet();
    const a = Object.assign(document.createElement('a'), { href: '#/settings' }); document.getElementById('screen').append(a); a.click();
    await new Promise(r => setTimeout(r, 200));
  });
  assert.equal(await screen(), 'settings');
  assert.equal(await back(), 'today');
  await b.run(async () => { const ui = await import('/js/ui.js'); ui.openSheet('<p>hi</p>'); ui.closeSheet(); });
  await new Promise(r => setTimeout(r, 200));
  assert.equal(await back(), 'left the app');
});

test('a sheet swiped down closes; a short pull springs back', { skip }, async () => {
  await fresh();
  await tab('more'); await tab('today');
  // A real finger drag from just inside the sheet's top edge.
  const swipe = async px => {
    const top = await b.run(async () => {
      const ui = await import('/js/ui.js');
      if (!ui.sheetOpen()) ui.openSheet('<p>hi</p><p>there</p><p>more</p>');
      await new Promise(r => setTimeout(r, 400)); // past the opening slide
      return document.querySelector('.scrim .sheet').getBoundingClientRect().top;
    });
    await b.drag(195, top + 12, 0, px);
    return b.run(async () => (await import('/js/ui.js')).sheetOpen());
  };
  assert.equal(await swipe(20), true, 'a short pull leaves it open');
  assert.equal(await swipe(200), false, 'a long swipe closes it');
  assert.equal(await back(), 'left the app', 'and leaves no extra back press');
});

test('opening the app straight onto a screen that loads later shows it, and back still works', { skip }, async () => {
  await fresh();
  // Past the welcome screen (a new phone always opens there), then a real page load straight onto Settings.
  await b.go('__blank'); await b.go('#/setup');
  await b.until(() => [...document.querySelectorAll('a,button')].some(x => /Skip for now/.test(x.textContent)), 'the welcome screen');
  await b.run(() => [...document.querySelectorAll('a,button')].find(x => /Skip for now/.test(x.textContent)).click());
  await b.until(() => !location.hash.includes('setup'), 'leaving setup');
  await b.go('__blank'); await b.go('#/settings');
  await b.until(() => document.querySelector('#bar h1')?.textContent === 'Settings', 'the settings screen');
  await tap('help');
  await b.until(() => document.querySelector('#bar h1')?.textContent === 'Help', 'the help screen');
  assert.equal(await back(), 'settings');
});
