import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launch, chromePath } from './browser.mjs';

test('installed app replaces the skeleton after an offline reload', { skip: !chromePath() }, async () => {
  const b = await launch();
  try {
    await b.go('');
    await b.until(() => document.body.classList.contains('ready'), 'startup');
    await b.run(async () => { await navigator.serviceWorker.ready; });
    await b.until(() => !!navigator.serviceWorker.controller, 'the installed worker');
    await b.send('Network.enable');
    await b.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await b.go('');
    await b.until(() => document.body.classList.contains('ready') && !document.querySelector('#screen .sk'), 'offline startup');
    assert.ok(await b.run(() => document.querySelector('#bar h1')?.textContent));
  } finally { await b.close(); }
});
