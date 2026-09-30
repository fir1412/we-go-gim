// Install is offered in every browser, not only where Chrome's own dialog fires, with that browser's steps.
// Run with: node --test tests/e2e/*.e2e.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, chromePath } from './browser.mjs';

const skip = chromePath() ? false : 'no Chrome found (set CHROME_PATH)';
let b;
before(async () => {
  if (skip) return;
  b = await launch();
  // This is Chrome underneath, which offers its own install dialog; Safari and Firefox never do.
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: `addEventListener('beforeinstallprompt', e => e.stopImmediatePropagation(), true)` });
});
after(async () => { await b?.close(); });

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  firefox: 'Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0',
};
/** The install sheet's title, opened from More in a browser with this user agent. */
const sheetFor = async (ua, { platform, touch }) => {
  await b.send('Emulation.setUserAgentOverride', { userAgent: ua, platform });
  await b.send('Emulation.setTouchEmulationEnabled', { enabled: touch, maxTouchPoints: touch ? 5 : 1 });
  await b.go('__blank');
  await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await b.go('#/today');
  await b.until(() => document.querySelector('#tabs a'), 'the tabs');
  await b.run(() => document.querySelector('.scrim')?.click());
  await b.run(async () => { document.querySelector('#tabs a[data-tab="more"]').click(); await new Promise(r => setTimeout(r, 200)); });
  return b.run(async () => {
    document.querySelector('[data-act="install"]').click();
    await new Promise(r => setTimeout(r, 200));
    return { title: document.querySelector('.scrim .sh-title')?.textContent, steps: [...document.querySelectorAll('.scrim .steps li')].map(l => l.textContent) };
  });
};

test('iPhone Safari gets Share → Add to Home Screen', { skip }, async () => {
  const s = await sheetFor(UA.iphone, { platform: 'iPhone', touch: true });
  assert.equal(s.title, 'Install on iPhone');
  assert.match(s.steps.join(' | '), /Safari.*Share.*Add to Home Screen/);
});

test('Mac Safari gets File → Add to Dock', { skip }, async () => {
  const s = await sheetFor(UA.mac, { platform: 'MacIntel', touch: false });
  assert.equal(s.title, 'Install we go gim on this Mac');
  assert.deepEqual(s.steps, ['In the menu bar, choose File', 'Add to Dock']);
});

test('Firefox on Android gets its menu steps', { skip }, async () => {
  const s = await sheetFor(UA.firefox, { platform: 'Linux armv8l', touch: true });
  assert.equal(s.title, 'Add we go gim to your home screen');
  assert.equal(s.steps[0], 'Tap the browser menu ⋮');
});
