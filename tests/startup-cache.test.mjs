// Run: node --test tests/startup-cache.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

test('installed app uses one complete cache, even when the network stalls or has newer files', async () => {
  const handlers = {}, reads = [], cached = { installed: true };
  let network = 0;
  runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), {
    URL, Set, Request, Response, setTimeout, clearTimeout,
    self: { location: new URL('https://example.com/we-go-gim/sw.js'), addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { match: async () => cached, open: async version => ({ match: async key => { reads.push({ version, key }); return cached; } }) },
    fetch: () => { network++; return new Promise(() => {}); },
  });
  for (const path of ['', 'index.html', 'js/first.js', 'js/app.js', 'js/state.js', 'css/app.css']) {
    let response;
    handlers.fetch({ request: { method: 'GET', url: `https://example.com/we-go-gim/${path}?today=2026-10-02`, mode: path.endsWith('.js') ? 'cors' : 'navigate' }, respondWith: p => { response = p; } });
    let timer;
    try {
      assert.equal(await Promise.race([response, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`cached ${path} waited for the network`)), 500); })]), cached);
    } finally { clearTimeout(timer); }
  }
  assert.equal(network, 0);
  assert.equal(new Set(reads.map(r => r.version)).size, 1);
  assert.ok(reads.every(r => !r.key.includes('?')));
});
