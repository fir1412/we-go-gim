// A tiny browser driver for the screen tests: the app is served from this folder and a headless Chrome is
// steered over the DevTools protocol with Node's built-in WebSocket. No dependencies to install.
// Uses the Chrome on this machine (or CHROME_PATH); the tests skip themselves when there is none.
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.glb': 'model/gltf-binary' };

export const chromePath = () => [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
].find(p => p && existsSync(p));

const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launch() {
  // Static server; /__blank is an empty page on the same origin, used to wipe storage between tests.
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/__blank') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>blank</title>'); }
    const file = normalize(join(ROOT, path === '/' ? 'index.html' : path));
    if (!file.startsWith(normalize(ROOT))) { res.writeHead(403); return res.end(); }
    try { const body = await readFile(file); res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;

  const profile = await mkdtemp(join(tmpdir(), 'wegogim-e2e-'));
  const chrome = spawn(chromePath(), ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check', '--lang=en-US', 'about:blank'], { stdio: 'ignore' });
  const portFile = join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  const port = readFileSync(portFile, 'utf8').split('\n')[0].trim();
  let page = null;
  for (let i = 0; i < 50 && !page; i++) {
    page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page');
    if (!page) await sleep(100);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let seq = 0;
  const waiting = new Map();
  const loaded = [];
  ws.onmessage = m => {
    const msg = JSON.parse(m.data);
    if (msg.id && waiting.has(msg.id)) { const { ok, fail } = waiting.get(msg.id); waiting.delete(msg.id); msg.error ? fail(new Error(msg.error.message)) : ok(msg.result); }
    else if (msg.method === 'Page.loadEventFired') loaded.splice(0).forEach(f => f());
  };
  const send = (method, params = {}) => new Promise((ok, fail) => { const id = ++seq; waiting.set(id, { ok, fail }); ws.send(JSON.stringify({ id, method, params })); });

  await send('Page.enable');
  // A phone: small screen, touch input.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  /** Run `fn` (a function) in the page with JSON arguments and return its JSON result. */
  const run = async (fn, ...args) => {
    const r = await send('Runtime.evaluate', { expression: `(${fn})(...${JSON.stringify(args)})`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const go = async path => { const done = new Promise(r => loaded.push(r)); await send('Page.navigate', { url: url + path }); await done; await sleep(300); };
  /** Wait until `fn` returns something truthy in the page. */
  const until = async (fn, what = 'condition', ms = 5000) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) { const v = await run(fn); if (v) return v; }
    throw new Error(`timed out waiting for ${what}`);
  };
  const touch = (type, x, y) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  /** A finger drag from (x, y) by (dx, dy) in small steps, like a real swipe. */
  const drag = async (x, y, dx, dy, steps = 10) => {
    await touch('touchStart', x, y);
    for (let i = 1; i <= steps; i++) { await touch('touchMove', x + dx * i / steps, y + dy * i / steps); await sleep(16); }
    await touch('touchEnd', x + dx, y + dy);
    await sleep(300);
  };
  const type = text => send('Input.insertText', { text });

  const close = async () => { try { ws.close(); } catch {} chrome.kill(); server.close(); await sleep(300); await rm(profile, { recursive: true, force: true }).catch(() => {}); };
  return { url, send, run, go, until, drag, type, close };
}

/** A fresh app with no data, skipped past the welcome screen, with the first programme day's workout started. */
export async function freshWorkout(b) {
  await b.go('__blank');
  await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await b.go('#/setup');
  await b.until(() => [...document.querySelectorAll('a,button')].some(x => /Skip for now/.test(x.textContent)), 'the welcome screen');
  await b.run(() => [...document.querySelectorAll('a,button')].find(x => /Skip for now/.test(x.textContent)).click());
  await b.until(() => !location.hash.includes('setup'), 'leaving setup');
  await b.run(() => { location.hash = '#/workout'; });
  await b.until(() => document.querySelector('[data-act="start-day"]'), 'the start buttons');
  await b.run(() => document.querySelector('[data-act="start-day"]').click());
  await b.until(() => document.querySelectorAll('#screen article.exc').length > 2, 'the workout');
  // Dismiss the one-time sheets the first workout can raise.
  await b.run(() => { document.querySelector('.scrim')?.click(); });
}

/** Read the saved workout draft straight from the app's database. */
export const readDraft = b => b.run(() => new Promise(r => {
  const q = indexedDB.open('setlist');
  q.onsuccess = () => { const g = q.result.transaction('kv').objectStore('kv').get('draft'); g.onsuccess = () => { const v = g.result; r(v?.v ?? v?.value ?? v); q.result.close(); }; };
}));
