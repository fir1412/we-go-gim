// Owner-approved ADB UI control for synthetic tests on the connected Samsung A32.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const adb = 'C:/Users/user/.bubblewrap/android_sdk/platform-tools/adb.exe';
const dir = 'output/phone'; mkdirSync(dir, { recursive: true });
function run(args, binary = false) {
  const r = spawnSync(adb, ['-s', 'RR8RC0EBFQZ', ...args], binary ? {} : { encoding: 'utf8' });
  if (r.status) throw Error(String(r.stderr));
  return r.stdout;
}
const [action, value, second] = process.argv.slice(2);
if (action === 'open') run(['shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d', value]);
else if (action === 'back') run(['shell', 'input', 'keyevent', '4']);
else if (action === 'text') run(['shell', 'input', 'text', value.replace(/ /g, '%s')]);
else if (action === 'tap') {
  const nodes = JSON.parse(readFileSync(`${dir}/ui-nodes.json`, 'utf8'));
  const node = nodes[Number(value)]; if (!node) throw Error('Observe state before tapping');
  const p = node.bounds.match(/\d+/g).map(Number);
  run(['shell', 'input', 'tap', String(Math.round((p[0] + p[2]) / 2)), String(Math.round((p[1] + p[3]) / 2))]);
} else if (action === 'key') run(['shell', 'input', 'keyevent', value]);
else if (action !== 'state') throw Error('Use state, tap, text, open, back or key');
run(['shell', 'uiautomator', 'dump', '/sdcard/wegogim-test-ui.xml']);
const xml = run(['shell', 'cat', '/sdcard/wegogim-test-ui.xml']);
writeFileSync(`${dir}/ui.xml`, xml);
const nodes = [...xml.matchAll(/<node\b[^>]+>/g)].map(m => Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])))
  .filter(n => n.text || n['content-desc'] || n.clickable === 'true');
writeFileSync(`${dir}/ui-nodes.json`, JSON.stringify(nodes));
writeFileSync(`${dir}/ui.png`, run(['exec-out', 'screencap', '-p'], true));
for (const [i, n] of nodes.entries()) console.log(i, JSON.stringify({ text: (n.text || n['content-desc']).replace(/[\w.+-]+@[\w.-]+/g, '[email]'), id: n['resource-id'], bounds: n.bounds, enabled: n.enabled }));
