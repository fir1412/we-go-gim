// Uses only the separate development package and synthetic proof records.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const adb = 'C:/Users/user/.bubblewrap/android_sdk/platform-tools/adb.exe';
const pkg = 'io.github.fir1412.wegogim.dev';
function cmd(...args) { const r = spawnSync(adb, args, { encoding: 'utf8' }); if (r.status) throw Error(r.stderr); return r.stdout.trim(); }
const pause = ms => new Promise(r => setTimeout(r, ms));
async function connect() {
  cmd('shell', 'input', 'keyevent', '224');
  cmd('shell', 'am', 'start', '-n', `${pkg}/io.github.fir1412.wegogim.MainActivity`);
  await pause(1200);
  cmd('forward', 'tcp:9223', `localabstract:webview_devtools_remote_${cmd('shell', 'pidof', pkg)}`);
  const pages = await (await fetch('http://127.0.0.1:9223/json/list')).json();
  const page = pages.find(p => p.url.startsWith('https://localhost/') && p.title.includes('gim'));
  assert.ok(page);
  const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
  let id = 0; const pending = new Map();
  ws.onmessage = e => { const msg = JSON.parse(e.data); const p = pending.get(msg.id); if (!p) return; pending.delete(msg.id); clearTimeout(p.timer); msg.error || msg.result?.exceptionDetails ? p.reject(Error(JSON.stringify(msg))) : p.resolve(msg.result.result.value); };
  const run = fn => new Promise((resolve, reject) => {
    const next = ++id, timer = setTimeout(() => reject(Error('Storage proof timed out')), 10000);
    pending.set(next, { resolve, reject, timer }); ws.send(JSON.stringify({ id: next, method: 'Runtime.evaluate', params: { expression: `(${fn})()`, awaitPromise: true, returnByValue: true } }));
  });
  return { run, close: () => ws.close() };
}
cmd('install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk');
cmd('shell', 'am', 'force-stop', pkg);
let b = await connect();
const before = await b.run(async () => {
  const db = await import('./js/db.js');
  await db.setKv('native-storage-proof', { marker: 'survives-webview-clear' });
  return { mode: db.storageMode(), count: (await db.all('sessions')).length };
});
assert.equal(before.mode, 'sqlite');
await b.run(async () => {
  await new Promise((resolve, reject) => { const r = indexedDB.deleteDatabase('setlist'); r.onsuccess = resolve; r.onerror = () => reject(r.error); r.onblocked = () => reject(Error('WebView database blocked')); });
  localStorage.clear();
});
b.close(); cmd('shell', 'am', 'force-stop', pkg);
cmd('install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk');
b = await connect();
try {
  const after = await b.run(async () => { const db = await import('./js/db.js'); return { mode: db.storageMode(), count: (await db.all('sessions')).length, proof: await db.getKv('native-storage-proof') }; });
  assert.equal(after.mode, 'sqlite'); assert.equal(after.count, before.count);
  assert.deepEqual(after.proof, { marker: 'survives-webview-clear' });
  await b.run(async () => { const db = await import('./js/db.js'); await db.del('kv', 'native-storage-proof'); });
  mkdirSync('output/phone', { recursive: true });
  const result = { model: cmd('shell', 'getprop', 'ro.product.model'), before, after, passed: ['native SQLite', 'WebView storage deletion', 'force-stop restart', 'APK update retains data'] };
  writeFileSync('output/phone/storage-results.json', JSON.stringify(result, null, 2)); console.log(JSON.stringify(result));
} finally { b.close(); }
