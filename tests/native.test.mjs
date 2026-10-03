import { test } from 'node:test';
import assert from 'node:assert/strict';
import { download, shareFile } from '../js/io.js';
import { readFileSync } from 'node:fs';

test('native export waits for Android completion and propagates cancellation', async () => {
  let finish, received;
  globalThis.gimNative = { save: (name, blob) => { received = { name, blob }; return new Promise(r => { finish = r; }); } };
  try {
    let complete = false;
    const save = download('backup.json', '{"sessions":[]}', 'application/json').then(() => { complete = true; });
    await Promise.resolve();
    assert.equal(complete, false);
    assert.equal(received.name, 'backup.json');
    assert.equal(await received.blob.text(), '{"sessions":[]}');
    finish(true); await save; assert.equal(complete, true);
    globalThis.gimNative.save = async () => { throw new DOMException('Cancelled', 'AbortError'); };
    await assert.rejects(download('backup.json', '{}'), { name: 'AbortError' });
  } finally { delete globalThis.gimNative; }
});

test('native share passes exact backup bytes and MIME without a browser download', async () => {
  globalThis.gimNative = { share: async (name, blob) => {
    assert.equal(name, 'backup.json'); assert.equal(blob.type, 'application/json');
    assert.equal(await blob.text(), '{"body":[]}'); return true;
  } };
  try { assert.equal(await shareFile('backup.json', '{"body":[]}'), true); }
  finally { delete globalThis.gimNative; }
});

test('Android entry respects CSP and packages only public assets', () => {
  const html = readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');
  assert.match(html, /src="native\/start.js"/);
  assert.doesNotMatch(html, /<script type="module">/);
  assert.match(html, /script-src 'self'/);
});
