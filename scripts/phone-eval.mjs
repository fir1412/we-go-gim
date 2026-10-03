// Debug WebView only. Forward adb tcp:9223 to the PID of io.github.fir1412.wegogim.dev.
import { readFileSync } from 'node:fs';
const pages = await (await fetch('http://127.0.0.1:9223/json/list', { signal: AbortSignal.timeout(5000) })).json();
const page = pages.find(p => p.url.startsWith('https://localhost/') && p.title.includes('gim'));
if (!page) throw Error('Development WebView not found');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
const expression = process.argv[2] === '--file' ? readFileSync(process.argv[3], 'utf8') : process.argv[2];
const timer = setTimeout(() => { ws.close(); process.exitCode = 1; console.error('Evaluation timed out'); }, 15000);
ws.onmessage = event => {
  const msg = JSON.parse(event.data);
  if (msg.id !== 1) return;
  clearTimeout(timer);
  if (msg.result?.exceptionDetails || msg.error) { console.error(JSON.stringify(msg)); process.exitCode = 1; }
  else console.log(JSON.stringify(msg.result?.result?.value));
  ws.close();
};
ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
