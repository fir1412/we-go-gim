// Run: node --test tests/import-qa-2.test.mjs
// Leftover import bugs from QA agents 2 and 3: session heart rate and gym on import, future dates in pasted
// text, the name dictionaries before a paste, rep counts in pasted splits, bench press matching, lines dropped
// as impossible, and "Start over" keeping the pasted text. Every log line here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };
globalThis.location ??= { search: '' };
const io = await import('../js/io.js');
const { parseSplitText } = await import('../js/split.js');
const { EXERCISES, PROGRAM } = await import('../js/seed.js');

const moreSrc = readFileSync(new URL('../js/views/more.js', import.meta.url), 'utf8');
// A handler's source: from its definition ("'imp-parse'(" or "async 'imp-parse'(") to the next one named.
const handler = (name, next) => {
  const at = moreSrc.search(new RegExp(`(?:async )?${name.replace(/^async /, '')}\\s*\\(`));
  return moreSrc.slice(at, moreSrc.indexOf(next, at));
};

// ---- 1. heart rate and gym from the import are kept -------------------------------------------------
test('1: importExtras keeps a sane heart rate and maps the gym by name', () => {
  const gyms = [{ id: 'g1', name: 'Home' }, { id: 'g2', name: 'Anytime Fitness Kajang' }];
  assert.deepEqual(io.importExtras({ hr: 142, gym: 'anytime fitness kajang ' }, gyms), { hr: 142, gymId: 'g2' });
  assert.deepEqual(io.importExtras({ hr: 141.6 }, gyms), { hr: 142 });
  // Out of range or junk heart rates are dropped; an unknown gym is left out.
  for (const hr of [0, 29, 251, 259, -5, NaN, '140', null, undefined, Infinity]) assert.equal(io.importExtras({ hr }, gyms).hr, undefined, String(hr));
  assert.deepEqual(io.importExtras({ gym: 'Somewhere else' }, gyms), {});
  assert.deepEqual(io.importExtras({ gym: 'Home' }, 'not a list'), {});
  assert.deepEqual(io.importExtras({ hr: 30, gym: 'HOME' }, gyms), { hr: 30, gymId: 'g1' });
});

test('1: the import save uses importExtras for heart rate and gym', () => {
  const h = handler("async 'imp-save'", '// settings');
  // hr: null is only the default; importExtras comes after it and wins.
  assert.match(h, /hr:\s*null,\s*\.\.\.importExtras\(s,\s*S\.settings\.gyms\)/);
  assert.doesNotMatch(h.slice(h.indexOf('...importExtras')), /hr:\s*null/);
});

test('1: a CSV with heart rate and gym columns carries them through to importExtras', () => {
  const s = io.sessionsFromCSV('Date,Exercise,Weight,Reps,Gym,HR\n2026-09-21,Squat,60,8,Home,150\n', { today: '2026-09-28' });
  assert.deepEqual(io.importExtras(s[0], [{ id: 'g1', name: 'Home' }]), { hr: 150, gymId: 'g1' });
});

// ---- 2. pasted text dated after tomorrow ------------------------------------------------------------
test('2: pasted sessions dated after tomorrow are left out and their lines counted', () => {
  const text = '21/9/2026 Push\nBench press 60kg x 8\n\n1/1/2031 Pull\nRow 50kg x 8\nLat pulldown 40kg x 10\n\n29/9/2026 Legs\nSquat 80kg x 5';
  const r = io.parseLogText(text, EXERCISES, { year: 2026, today: '2026-09-28' });
  assert.deepEqual(r.sessions.map(s => s.date), ['2026-09-21', '2026-09-29']);
  assert.equal(r.future, 3); // the date line and its two set lines
  // Without today nothing changes.
  const r2 = io.parseLogText(text, EXERCISES, { year: 2026 });
  assert.equal(r2.sessions.length, 3);
  assert.equal(r2.future, 0);
});

test('2: the paste and CSV handlers pass today and show the future count', () => {
  const h = handler("'imp-parse'", "'imp-on'");
  assert.match(h, /today:\s*todayIso\(\)/);
  assert.match(moreSrc, /imp\.future/);
  assert.match(moreSrc, /dated after tomorrow left out/);
});

// ---- 3. name dictionaries are loaded before a paste is read -----------------------------------------
test('3: the paste handler awaits the Chinese, Japanese and Malay names first', () => {
  const h = handler("'imp-parse'", "'imp-on'");
  assert.match(h, /async 'imp-parse'|'imp-parse':\s*async/);
  assert.match(h, /await\s+(?:loadForeignNames\(\)|foreignNamesReady)/);
  assert.ok(h.search(/await\s+(?:loadForeignNames|foreignNamesReady)/) < h.indexOf('parseLogText('));
});

test('3: after loading, a first Chinese paste matches the library name', async () => {
  await io.foreignNamesReady;
  const r = io.parseLogText('2026-09-21\n杠铃卧推 60kg x 8', EXERCISES, { year: 2026 });
  assert.equal(r.sessions[0]?.entries[0]?.match, 'bbbench');
});

// ---- 4. split plans with impossible rep counts ------------------------------------------------------
test('4: a split line with 0 or 10000 reps is not added, and says why', () => {
  const r = parseSplitText('Monday - Push\nBench press 3 x 8\nCurl 3 x 0\nFly 3 x 10000\nRow 3 x 8-12');
  const items = r.days[0].items;
  assert.deepEqual(items.map(i => i.name), ['Bench press', 'Row']);
  assert.deepEqual([items[1].lo, items[1].hi], [8, 12]);
  assert.equal(r.notAdded.length, 2);
  assert.ok(r.notAdded.every(l => /reps must be between 1 and 100/.test(l)), r.notAdded.join(' | '));
});

test('4: sets are kept between 1 and 20; a range up to 100 stays; holds in seconds may be longer', () => {
  const r = parseSplitText('Monday - Legs\nSquat 50 x 5\nLunge 0 x 10\nCalf raise 3 x 80-100\nPlank 3 x 120 seconds');
  const it = Object.fromEntries(r.days[0].items.map(i => [i.name, i]));
  assert.ok(it.Squat.sets >= 1 && it.Squat.sets <= 20);
  assert.equal(it.Lunge.sets, 1);
  assert.deepEqual([it['Calf raise'].lo, it['Calf raise'].hi], [80, 100]);
  assert.equal(it.Plank?.lo, 120);
  assert.equal(r.notAdded.length, 0);
  assert.equal(parseSplitText('Monday - Arms\nCurl 3 x 8-500').days.length, 0);
});

// ---- 5. bench press, impossible lines, Start over --------------------------------------------------
test('5: a plain "Bench press" prefers the barbell lift even when the programme has the dumbbell one', () => {
  const prefer = new Set(PROGRAM.days.flatMap(d => d.slots.map(s => s.exId)));
  assert.ok(prefer.has('bench'));
  for (const n of ['Bench press', 'bench press', 'Bench', 'Incline bench press']) {
    const m = io.matchExercise(n, EXERCISES, { prefer, unit: 'kg' });
    assert.equal(m?.ex.equip, 'barbell', `${n} -> ${m?.ex.name}`);
  }
  // Named equipment, kilos per dumbbell, or no unit known (the programme wins) still go to the dumbbell lift.
  assert.equal(io.matchExercise('Bench press', EXERCISES, { prefer })?.ex.id, 'bench');
  assert.equal(io.matchExercise('DB bench press', EXERCISES, { prefer, unit: 'kg' })?.ex.id, 'bench');
  assert.equal(io.matchExercise('Bench press', EXERCISES, { prefer, unit: 'kg/DB' })?.ex.id, 'bench');
  assert.equal(io.matchExercise('Smith bench press', EXERCISES, { prefer })?.ex.id, 'smithbench');
});

test('5: lines with an impossible load or rep count are counted', () => {
  const r = io.parseLogText('21/9/2026\nBench press 60kg 8,8,7\nLateral raise 8kg 3x15\nLeg press 9999kg 10\nDeadlift 2000kg x 5', EXERCISES, { year: 2026 });
  assert.deepEqual(r.sessions[0].entries.map(e => e.exName), ['Bench press', 'Lateral raise']);
  assert.equal(r.impossible, 2);
  assert.equal(io.parseLogText('21/9/2026\nSquat 100kg x 5', EXERCISES, { year: 2026 }).impossible, 0);
  assert.match(moreSrc, /imp\.impossible/);
});

test('5: Start over keeps the pasted text in the box', () => {
  const h = handler("'imp-cancel'", "async 'imp-save'");
  assert.match(h, /impText\s*=/);
  assert.match(moreSrc, /id="imp-text"[^>]*>\$\{esc\(impText\)\}<\/textarea>/);
});
