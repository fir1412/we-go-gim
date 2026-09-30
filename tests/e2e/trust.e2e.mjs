// "Check it yourself" lists only the app's own site on a fresh start, and "How your data is kept" leads to a backup.
// Run with: node --test tests/e2e/*.e2e.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, chromePath } from './browser.mjs';

const skip = chromePath() ? false : 'no Chrome found (set CHROME_PATH)';
let b;
before(async () => { if (!skip) b = await launch(); });
after(async () => { await b?.close(); });

const click = sel => b.run(async s => { document.querySelector(s).click(); await new Promise(r => setTimeout(r, 300)); }, sel);
const sheet = () => b.run(() => ({ title: document.querySelector('.scrim .sh-title')?.textContent, text: document.querySelector('.scrim')?.textContent || '' }));

test('Welcome → Check it yourself: only the app\'s own website, nothing unexpected', { skip }, async () => {
  await b.go('__blank');
  await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await b.go('#/setup');
  await b.until(() => document.querySelector('[data-act="net-check"]'), 'the Welcome link');
  await click('[data-act="net-check"]');
  const s = await sheet();
  assert.equal(s.title, 'Check it yourself');
  assert.match(s.text, /Only the app's own website/);
  assert.doesNotMatch(s.text, /Not expected/);
  await click('.scrim [data-x="ok"]');
  assert.equal(await b.run(() => !!document.querySelector('.scrim')), false, 'Got it closes it');
});

test('Settings → How your data is kept → Back up now opens the backup screen', { skip }, async () => {
  await b.run(() => [...document.querySelectorAll('button')].find(x => /Skip for now/.test(x.textContent)).click());
  await b.until(() => document.querySelector('#tabs a[data-tab="more"]') && !location.hash.includes('setup'), 'Today');
  await b.run(() => document.querySelector('.scrim')?.click());
  await click('#tabs a[data-tab="more"]');
  await click('a[href="#/settings"]');
  await b.until(() => document.querySelector('[data-act="data-kept"]'), 'the Settings row');
  await click('[data-act="data-kept"]');
  assert.equal((await sheet()).title, 'How your data is kept');
  await click('.scrim a[href="#/data"]');
  await b.until(() => location.hash === '#/data' && !document.querySelector('.scrim'), 'the backup screen');
});
