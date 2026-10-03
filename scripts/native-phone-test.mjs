// Actual Android WebView checks; touches only io.github.fir1412.wegogim.dev and its synthetic test files.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const adb = process.env.ADB || 'C:/Users/user/.bubblewrap/android_sdk/platform-tools/adb.exe';
const pkg = 'io.github.fir1412.wegogim.dev';
const pause = ms => new Promise(r => setTimeout(r, ms));
function cmd(...args) {
  const r = spawnSync(adb, args, { encoding: 'utf8' });
  if (r.status !== 0) throw Error('adb failed: ' + args.slice(0, 2).join(' '));
  return r.stdout.trim();
}
cmd('install', '-r', 'android/app/build/outputs/apk/debug/app-debug.apk');
cmd('shell', 'input', 'keyevent', '224');
cmd('shell', 'am', 'start', '-n', `${pkg}/io.github.fir1412.wegogim.MainActivity`);
await pause(1500);
const pid = cmd('shell', 'pidof', pkg);
assert.match(pid, /^\d+$/);
cmd('forward', 'tcp:9223', `localabstract:webview_devtools_remote_${pid}`);
const pages = await (await fetch('http://127.0.0.1:9223/json/list')).json();
const page = pages.find(p => p.title.includes('gim') && p.url.startsWith('https://localhost/'));
assert.ok(page);
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map();
ws.onmessage = event => {
  const msg = JSON.parse(event.data); if (!pending.has(msg.id)) return;
  const { resolve, reject, timer } = pending.get(msg.id); pending.delete(msg.id); clearTimeout(timer);
  msg.error ? reject(Error(msg.error.message)) : resolve(msg.result);
};
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const next = ++id;
  const timer = setTimeout(() => { pending.delete(next); reject(Error('CDP timeout')); }, 15000);
  pending.set(next, { resolve, reject, timer }); ws.send(JSON.stringify({ id: next, method, params }));
});
const run = async (fn, ...args) => {
  console.log('phone:', String(fn).slice(0, 100));
  const result = await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description);
  return result.result.value;
};
const results = [];
mkdirSync('output/phone', { recursive: true });
try {
  assert.equal(await run(() => !!window.gimNative), true); results.push('native startup');
  await run(() => { window.__gimErrors = []; addEventListener('error', e => __gimErrors.push(e.message)); });
  await run(() => document.querySelector('[data-act="wz-sample"]')?.click());
  await pause(500);
  const count = await run(async () => { const { S } = await import('./js/state.js'); return S.sessions.length; });
  assert.ok(count > 20); results.push('sample storage');
  for (const route of ['today', 'workout', 'history', 'insights', 'more', 'settings', 'data']) {
    cmd('shell', 'input', 'keyevent', '224');
    await run(route => { location.hash = '#/' + route; }, route); await pause(300);
    const check = await run(() => {
      const bar = document.querySelector('#bar'), tabs = document.querySelector('#tabs'), root = document.documentElement;
      return { overflow: root.scrollWidth > root.clientWidth + 2, recovery: !!document.querySelector('[data-act="reload-app"]'),
        insetTop: getComputedStyle(root).getPropertyValue('--safe-area-inset-top').trim(), barTop: bar.getBoundingClientRect().top,
        barPadding: parseFloat(getComputedStyle(bar).paddingTop), tabsPadding: parseFloat(getComputedStyle(tabs).paddingBottom) };
    });
    assert.equal(check.overflow, false); assert.equal(check.recovery, false);
    if (parseFloat(check.insetTop) > 0) assert.ok(check.barPadding >= parseFloat(check.insetTop));
    results.push({ route, ...check });
  }
  // WebView's CDP screenshot can hang; Android owns the rendered surface.
  const shot = spawnSync(adb, ['exec-out', 'screencap', '-p']);
  assert.equal(shot.status, 0); writeFileSync('output/phone/native-data.png', shot.stdout);
  // Real SAF cancellation should return AbortError and leave no successful-save signal.
  await run(() => { window.__saveTest = 'pending'; gimNative.save('gim-native-test.txt', new Blob(['gim-test'], { type: 'text/plain' })).then(() => __saveTest = 'saved', e => __saveTest = e.name); });
  await pause(500); cmd('shell', 'input', 'keyevent', '4'); await pause(500);
  assert.equal(await run(() => window.__saveTest), 'AbortError'); results.push('SAF cancellation');
  await run(() => { window.__shareTest = 'pending'; gimNative.share('gim-native-test.txt', new Blob(['gim-test'], { type: 'text/plain' })).then(() => __shareTest = 'shared', e => __shareTest = e.name); });
  await pause(500); cmd('shell', 'input', 'keyevent', '4'); await pause(500);
  assert.equal(await run(() => window.__shareTest), 'AbortError'); results.push('Android share cancellation');
  await run(() => { window.__textShareTest = 'pending'; gimNative.shareText('Development gym reminder test.').then(() => __textShareTest = 'shared', e => __textShareTest = e.name); });
  await pause(500); cmd('shell', 'input', 'keyevent', '4'); await pause(500);
  assert.equal(await run(() => window.__textShareTest), 'AbortError'); results.push('text share cancellation');
  await run(async () => {
    try { await gimNative.trainingPermission(true); await gimNative.trainingNotifications([{ id: 2000, at: Date.now() + 3600000, body: 'Development reminder test.' }]); }
    finally { await gimNative.trainingPermission(false); await gimNative.trainingNotifications([]); }
  });
  results.push('training notification scheduling and opt-out cancellation');
  // Native sheet Back must close the sheet before navigating away.
  await run(async () => { const { openSheet } = await import('./js/ui.js'); openSheet('<h2>Development Back test</h2>'); });
  await pause(200); cmd('shell', 'input', 'keyevent', '4'); await pause(350);
  assert.equal(await run(() => !!document.querySelector('.sheet')), false); results.push('hardware Back closes sheet');
  await send('Page.reload'); await pause(700);
  assert.equal(await run(async () => { const { S } = await import('./js/state.js'); return S.sessions.length; }), count);
  results.push('reload preserves data');
  assert.deepEqual(await run(() => window.__gimErrors || []), []);
  writeFileSync('output/phone/results.json', JSON.stringify({ model: cmd('shell', 'getprop', 'ro.product.model'), results }, null, 2));
  console.log(JSON.stringify({ passed: results.length, results }));
} finally { ws.close(); }
