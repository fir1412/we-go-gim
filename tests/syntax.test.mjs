// Run: node --test tests/syntax.test.mjs
// Every file the browser loads must parse as an ES module. (A stray apostrophe in app.js once stopped
// the whole app at "Loading…"; `node --check file.js` did not catch it, so each file is piped in as a module.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['sw.js', ...readdirSync(join(root, 'js')).filter(f => f.endsWith('.js')).map(f => join('js', f)),
  ...readdirSync(join(root, 'js', 'views')).filter(f => f.endsWith('.js')).map(f => join('js', 'views', f))];

for (const f of files) {
  test(`parses as a module: ${f}`, () => {
    const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: readFileSync(join(root, f)), encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}\n${r.stderr}`);
  });
}

test('the check itself catches a broken file', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: "export const a = ['it's broken'];", encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});

test('index.html preloads only files that exist, work offline, and are not screens loaded later', () => {
  const html = readFileSync(join(root, 'index.html'), 'utf8'), sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const app = readFileSync(join(root, 'js', 'app.js'), 'utf8');
  const lazy = [...app.matchAll(/import\('\.\/(views\/\w+\.js)'\)/g)].map(m => 'js/' + m[1]);
  const pre = [...html.matchAll(/rel="(?:modulepreload|preload)" href="([^"]+)"/g)].map(m => m[1]);
  assert.ok(pre.length && lazy.length);
  for (const p of pre) {
    assert.ok(readFileSync(join(root, p)).length, p);
    assert.ok(sw.includes(`'./${p}'`), `${p} is not in the offline cache (sw.js CORE)`);
    assert.ok(!lazy.includes(p), `${p} is loaded lazily; preloading it undoes that`);
  }
});
