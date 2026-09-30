// Welcome → "Look around with sample data" fills the app and says so; "Start for real" empties it and goes back to Welcome.
// Run with: node --test tests/e2e/*.e2e.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, chromePath } from './browser.mjs';

const skip = chromePath() ? false : 'no Chrome found (set CHROME_PATH)';
let b;
before(async () => { if (!skip) b = await launch(); });
after(async () => { await b?.close(); });

test('sample data: a filled app that says so, gone with one tap', { skip }, async () => {
  await b.go('__blank');
  await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await b.go('');
  await b.until(() => document.querySelector('[data-act="wz-sample"]'), 'the sample button on Welcome');
  await b.run(() => { window.__errs = []; addEventListener('error', e => __errs.push(e.message)); document.querySelector('[data-act="wz-sample"]').click(); });
  await b.until(() => document.querySelector('[data-act="sample-end"]'), 'the sample banner on Today');
  await b.run(() => document.querySelector('.scrim')?.click());   // the tour
  const got = await b.run(async () => {
    const { S } = await import('./js/state.js');
    return { seed: S.sessions.filter(s => s.seed).length, all: S.sessions.length, body: S.body.length, sample: S.settings.sample, daily: Object.values(S.daily).filter(v => v.seed).length, hash: location.hash, find: document.getElementById('screen').textContent.includes('Find weight') };
  });
  assert.ok(got.seed >= 30 && got.seed === got.all && got.body > 4 && got.daily === 14 && got.sample, JSON.stringify(got));
  assert.match(got.hash, /today/);
  assert.equal(got.find, false, "Today's targets come from the sample history");

  await b.run(() => document.querySelector('[data-act="sample-end"]').click());
  await b.until(() => document.querySelector('[data-act="wz-sample"]'), 'Welcome again');
  const after = await b.run(async () => { const { S } = await import('./js/state.js'); return { n: S.sessions.length + S.body.length + Object.keys(S.daily).length, sample: S.settings.sample, errs: window.__errs }; });
  assert.deepEqual(after, { n: 0, sample: false, errs: [] });
});

test('Welcome in Malay has no English left in its promise and notice lines', { skip }, async () => {
  await b.go('__blank');
  await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await b.go('');
  await b.until(() => document.querySelector('[data-input="set-lang"]'), 'the language picker');
  await b.run(() => { const s = document.querySelector('[data-input="set-lang"]'); s.value = 'ms'; s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new Event('input', { bubbles: true })); });
  const text = await b.until(() => document.documentElement.lang === 'ms' && document.querySelector('.wz-trust')?.textContent.startsWith('Percuma') && document.getElementById('screen').textContent, 'Malay Welcome');
  assert.ok(text.includes('Cadangkan perkataan yang lebih baik'), 'Suggest a better word, in Malay');
  for (const en of ['By continuing', 'No account', 'Free:', 'Suggest a better', 'Not medical advice', 'Every workout', 'Look around']) assert.ok(!text.includes(en), `still English: ${en}`);
  // The sample path too: Today, then the Data screen with its remove button.
  await b.run(() => document.querySelector('[data-act="wz-sample"]').click());
  await b.until(() => document.querySelector('[data-act="sample-end"]'), 'sample Today');
  const today = await b.run(() => document.getElementById('screen').textContent);
  await b.run(async () => { const a = Object.assign(document.createElement('a'), { href: '#/data' }); document.getElementById('screen').append(a); a.click(); });
  const data = await b.until(() => document.querySelector('[data-act="rm-seed"]') && document.getElementById('screen').textContent, 'the Data screen');
  for (const en of ['sample', 'with your own', 'tap for why', 'Start for real', 'Remove the']) assert.ok(!today.includes(en) && !data.includes(en), `still English in sample mode: ${en}`);
});
