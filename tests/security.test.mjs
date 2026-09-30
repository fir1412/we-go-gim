// Run: node --test tests/security.test.mjs
// Findings from the 2026-09-28 security review: crafted backups, huge pasted lines, the pdf.js pin.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as io from '../js/io.js';
import { EXERCISES } from '../js/seed.js';

// state.js touches the browser only when its functions run, so sanitizeBackup can be tested directly.
globalThis.location ??= { search: '' };
const { sanitizeBackup, validateBackup } = await import('../js/state.js');

const XSS = '"><img src=x onerror=alert(1)>';
const crafted = {
  app: 'setlist', version: 1,
  sessions: [{ id: 's1', date: '2026-09-21', name: 'Push', entries: [{ exId: 'bench', sets: [{ w: XSS, r: XSS, done: true }], rir: XSS, note: 'ok' }], cardio: [{ type: 'Run', min: XSS, km: XSS, intensity: XSS }] }],
  exercises: [{ id: 'bench', name: 'Bench', unit: 'kg', equip: XSS, inc: XSS, rest: XSS, muscles: ['Chest'] }],
  body: [{ id: 'b1', date: '2026-09-21', kg: 80, note: 1 }],
  cardio: [{ id: 'c1', date: '2026-09-21', type: 'Run', min: XSS, intensity: 'hard' }],
  daily: { '2026-09-21': { protein: XSS, water: 2 }, [XSS]: { protein: 1 } },
  measures: [{ id: 'm1', date: '2026-09-21', waist: XSS, arm: 35 }],
  settings: { goalKg: XSS, targets: { protein: XSS }, gyms: [{ id: 'g1', name: 5 }], theme: { x: 1 } },
  program: { days: [{ dow: 1, name: 'Push', color: XSS, slots: [{ exId: 'bench', sets: XSS, lo: 8, hi: 12, group: 'AAAAAAA' }] }] },
};

test('a crafted backup comes out with numbers as numbers and nothing markup-shaped where numbers go', () => {
  validateBackup(crafted);
  const d = sanitizeBackup(crafted);
  const set = d.sessions[0].entries[0].sets[0];
  assert.equal(set.w, null); assert.equal(set.r, null);
  assert.equal(d.sessions[0].cardio[0].min, 0);
  assert.equal(d.sessions[0].cardio[0].intensity, 'moderate');
  assert.equal(d.sessions[0].cardio[0].km, undefined);
  assert.equal(d.exercises[0].equip, 'machine');
  assert.equal(d.exercises[0].inc, 2.5);
  assert.equal(d.cardio[0].min, 0);
  assert.deepEqual(d.daily['2026-09-21'], { water: 2 });
  assert.equal(Object.keys(d.daily).length, 1);
  assert.equal(d.measures[0].waist, undefined); assert.equal(d.measures[0].arm, 35);
  assert.equal(d.settings.goalKg, null); assert.equal(d.settings.targets.protein, null);
  assert.equal(d.settings.gyms[0].name, '5'); assert.equal('theme' in d.settings, false);
  assert.equal(d.program.days[0].slots[0].sets, 3);
  assert.equal(d.program.days[0].slots[0].group.length <= 4, true);
  assert.equal(typeof d.body[0].note, 'string');
});

test('a normal backup keeps its values', () => {
  const ok = { app: 'setlist', version: 1, sessions: [{ id: 's', date: '2026-09-21', name: 'Legs', entries: [{ exId: 'squat', sets: [{ w: 100, r: 5, done: true }, { w: 60, r: 8, done: true, warm: true }], rir: '2', pain: true, note: 'good' }] }], daily: { '2026-09-21': { protein: 150, sleep: 7.5 } } };
  const d = sanitizeBackup(ok);
  assert.deepEqual(d.sessions[0].entries[0].sets, [{ w: 100, r: 5, done: true }, { w: 60, r: 8, done: true, warm: true }]);
  assert.equal(d.sessions[0].entries[0].rir, '2'); assert.equal(d.sessions[0].entries[0].pain, true);
  assert.deepEqual(d.daily['2026-09-21'], { protein: 150, sleep: 7.5 });
});

test('a huge pasted line cannot freeze the parser', () => {
  for (const s of ['1'.repeat(20000), '[' + '1'.repeat(20000) + '/1/2026, 18:02] a:']) {
    const t = performance.now();
    io.parseLogText(s, EXERCISES, { year: 2026 });
    io.parseSetLine(s);
    assert.ok(performance.now() - t < 500, `took ${Math.round(performance.now() - t)} ms`);
  }
  // Ordinary lines still parse.
  assert.equal(io.parseSetLine('Bench press 60kg x 8 x 3').sets.length, 3);
});

test('pdf.js is pinned: integrity on the script, a checked worker, and a CSP that only allows that folder', () => {
  const src = readFileSync(new URL('../js/io.js', import.meta.url), 'utf8');
  assert.match(src, /PDFJS_SRI = 'sha512-/);
  assert.match(src, /s\.integrity = integrity/);
  assert.match(src, /workerSrc = await verifiedWorker\(\)/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /script-src 'self' https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/pdf\.js\/3\.11\.174\/;/);
  assert.doesNotMatch(html, /script-src 'self' https:\/\/cdnjs\.cloudflare\.com;/);
});

// CVE-2024-4367 (pdf.js < 4.2.67 runs code from a crafted PDF font) needs eval: both guards must stay.
test('pdf.js 3.11.174 stays safe from CVE-2024-4367: eval off in getDocument and no unsafe-eval in the CSP', () => {
  const src = readFileSync(new URL('../js/io.js', import.meta.url), 'utf8');
  assert.match(src, /getDocument\(\{[^}]*isEvalSupported: false/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /unsafe-eval/);
});

test('CSV export keeps formula-looking text as text (no spreadsheet formula injection)', () => {
  const csv = io.toCSV([{ date: '2026-09-21', name: '=HYPERLINK("http://x","y")', gymId: 'g', entries: [{ exId: 'a', sets: [{ w: 1, r: 1, done: true }], note: '+cmd|calc' }] }], { a: { name: '@SUM(1)', unit: 'kg' } }, [{ id: 'g', name: '-2+3' }]);
  const row = csv.split('\n')[1];
  assert.doesNotMatch(row, /(^|,)"?[=+\-@]/);
  assert.match(row, /'=HYPERLINK/); assert.match(row, /'@SUM/); assert.match(row, /'-2\+3/); assert.match(row, /'\+cmd/);
});

test('absurd loads and reps from imports are dropped; names lose hidden control characters', () => {
  const s = io.parseLogText('2026-09-21 Push\nBench press 999999kg x 8 x 3\nBarbell squat 80kg x 5 x 3', EXERCISES, { year: 2026 }).sessions;
  assert.equal(s[0].entries.length, 1);
  assert.equal(s[0].entries[0].sets[0].w, 80);
  const csv = io.sessionsFromCSV(`Date,Exercise,Weight,Reps\n2026-09-21,Bench${String.fromCharCode(0x202E)}press,60,8\n2026-09-21,Curl,20,99999`);
  assert.equal(csv[0].entries.length, 1);
  assert.equal(csv[0].entries[0].exName, 'Bench press');
});

test('the app refuses to run inside another site\'s frame', () => {
  const src = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  assert.match(src, /if \(window\.top !== window\.self\)/);
});

test('service worker: only page loads fall back to the app shell, never scripts', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /const shell = req\.mode === 'navigate';/);
  assert.match(sw, /shell \? caches\.match\('\.\/index\.html'\) : undefined/);
  for (const f of ['streak.js', 'calendar.js', 'atlas-map.js', 'i18n.js']) assert.ok(sw.includes(`'./js/${f}'`), `${f} precached`);
});

// 2026-09-29 review: a shared backup can't queue feedback posts or be absurdly large; long logs can't freeze the importer.
test('a restored backup never brings feedback to send from this phone', () => {
  const out = sanitizeBackup({ ...crafted, settings: { ...crafted.settings, feedbackQueue: [{ type: 'Bug', message: 'spam' }], feedbackSent: [1] } });
  assert.equal(out.settings.feedbackQueue, undefined);
  assert.equal(out.settings.feedbackSent, undefined);
});

test('a backup far larger than any real log is rejected before anything is written', () => {
  const s = crafted.sessions[0];
  assert.throws(() => validateBackup({ ...crafted, sessions: Array.from({ length: 20001 }, (_, i) => ({ ...s, id: 's' + i })) }), /far larger/);
});

// Tally a214b81 / 245c74f: an old import could make a session this big, and its backup must still restore.
test('an oversized session is trimmed to 100 exercises and 100 sets, not refused', () => {
  const sets = Array.from({ length: 120 }, () => ({ w: 1, r: 1 }));
  const data = { ...crafted, sessions: [{ ...crafted.sessions[0], entries: Array.from({ length: 120 }, () => ({ exId: 'bench', sets })) }] };
  assert.doesNotThrow(() => validateBackup(data));
  const e = sanitizeBackup(data).sessions[0].entries;
  assert.equal(e.length, 100);
  assert.equal(e[0].sets.length, 100);
});

test('a pasted log with thousands of dated sessions skips the slow date-typo check', () => {
  const list = Array.from({ length: 20000 }, (_, i) => ({ date: `20${10 + (i * 7) % 16}-0${1 + i % 9}-1${i % 10}` }));
  const t = performance.now(); io.fixDateTypos(list);
  assert.ok(performance.now() - t < 300, `took ${Math.round(performance.now() - t)} ms`);
});
