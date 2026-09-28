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
