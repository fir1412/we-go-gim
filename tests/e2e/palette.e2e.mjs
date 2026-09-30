// App colours in Settings: a preset repaints the app, "Mine" starts from the colours on screen and takes a picked
// background (moved to fit the theme), and the choice is there again after a reload.
// Run with: node --test tests/e2e/*.e2e.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, chromePath } from './browser.mjs';

const skip = chromePath() ? false : 'no Chrome found (set CHROME_PATH)';
let b;
before(async () => { if (!skip) b = await launch(); });
after(async () => { await b?.close(); });

const bg = () => b.run(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim().toUpperCase());
const tap = sel => b.run(async s => { document.querySelector(s).click(); await new Promise(r => setTimeout(r, 250)); }, sel);

test('presets and your own colours repaint the app and survive a reload', { skip }, async () => {
  await b.go('__blank');
  await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await b.go('#/today');
  await b.until(() => document.querySelector('#tabs a'), 'the tabs');
  await b.run(() => document.querySelector('.scrim')?.click());
  await b.run(() => { location.hash = '#/settings'; });
  await b.until(() => document.querySelector('[data-act="st-palette"]'), 'the colours row');
  await tap('[data-act="theme"][data-v="dark"]');
  assert.equal(await bg(), '#0F1117', 'the default dark background');

  await tap('[data-act="st-palette"][data-v="midnight"]');
  assert.equal(await bg(), '#0B1220', 'Midnight');

  await tap('[data-act="st-palette"][data-v="mine"]');
  assert.equal(await bg(), '#0B1220', '"Mine" starts as the colours on screen');
  // A mid grey picked for the dark theme is darkened until it is a dark background.
  const saved = await b.run(async () => {
    const i = document.querySelector('[data-input="st-mine"][data-i="0"]');
    i.value = '#808080'; i.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise(r => setTimeout(r, 300));
    const { S } = await import('/js/state.js');
    return S.settings.myPalette.dark[0];
  });
  assert.notEqual(saved, '#808080');
  assert.equal(await bg(), saved);

  await b.go('__blank'); await b.go('#/today');
  await b.until(() => document.querySelector('#tabs a'), 'the tabs again');
  assert.equal(await bg(), saved, 'the same colours after a reload');
});
