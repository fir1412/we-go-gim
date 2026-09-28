// Run: node --test tests/cjk-malay-import.test.mjs
// Chinese, Japanese and Malay text in the log importer and the paste-a-plan reader. Every log and plan here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as io from '../js/io.js';
import { parseSplitText } from '../js/split.js';
import { EXERCISES } from '../js/seed.js';
import zhD from '../js/i18n/zh.js';
import jaD from '../js/i18n/ja.js';
import msD from '../js/i18n/ms.js';
import { plainText } from '../js/plain.js';
const libName = id => EXERCISES.find(e => e.id === id).name;
const trName = (d, id) => d.names[plainText(libName(id))] ?? d.names[libName(id)];

await io.foreignNamesReady;

const parse = (text, opts = {}) => io.parseLogText(text, EXERCISES, { year: 2026, ...opts }).sessions;
const sets = s => s.entries.map(e => e.sets.map(x => `${x.w}x${x.r}`).join(' '));
const items = d => d.items.map(x => `${x.name}|${x.sets}|${x.lo}-${x.hi}`);
const match = n => io.matchExercise(n, EXERCISES)?.ex.id || null;

// ---- paste a plan ----------------------------------------------------------------------------------
test('plan: the app\'s own Chinese example is read', () => {
  const r = parseSplitText('星期一 – 胸\n卧推 – 4 组，每组 6–8 次\n哑铃飞鸟 – 3 组，每组 10–12 次\n\n星期二 – 背\n高位下拉 – 3组×10次');
  assert.deepEqual(r.days.map(d => `${d.dow}:${d.name}`), ['1:胸', '2:背']);
  assert.deepEqual(items(r.days[0]), ['卧推|4|6-8', '哑铃飞鸟|3|10-12']);
  assert.deepEqual(items(r.days[1]), ['高位下拉|3|10-10']);
});

test('plan: Chinese day words 星期一..星期日/星期天 and 周一..周日, with a full-width colon', () => {
  const r = parseSplitText('周一：胸\n卧推 4组 8次\n周三：腿\n深蹲 5组×5次\n星期五 背\n硬拉 3组 5次\n星期天：手臂\n哑铃弯举 3组 12次\n周六\n推举 3组 8次');
  assert.deepEqual(r.days.map(d => `${d.dow}:${d.name}:${d.items.length}`), ['1:胸:1', '3:腿:1', '5:背:1', '0:手臂:1', '6:Workout:1']);
  assert.deepEqual(items(r.days[1]), ['深蹲|5|5-5']);
  const r2 = parseSplitText('星期日\n卧推 3组 8次\n周日\n深蹲 3组 8次');
  assert.deepEqual(r2.days.map(d => d.dow), [0, 0]);
});

test('plan: the app\'s own Japanese example, "3セット×10回" and "水曜日：背中"', () => {
  const r = parseSplitText('月曜日 – 胸\nベンチプレス – 4 セット × 6–8 回\nダンベルフライ 3セット×10回\n\n水曜日：背中\nラットプルダウン 3セット×10～12回\n\n金曜日 脚\nスクワット ５セット×５回');
  assert.deepEqual(r.days.map(d => `${d.dow}:${d.name}`), ['1:胸', '3:背中', '5:脚']);
  assert.deepEqual(items(r.days[0]), ['ベンチプレス|4|6-8', 'ダンベルフライ|3|10-10']);
  assert.deepEqual(items(r.days[1]), ['ラットプルダウン|3|10-12']);
  assert.deepEqual(items(r.days[2]), ['スクワット|5|5-5']);
});

test('plan: Japanese day words 月曜/火曜 and (月)(火)', () => {
  const r = parseSplitText('月曜 胸\nベンチプレス 3セット×8回\n火曜：脚\nスクワット 3セット×8回\n(木) 背中\nデッドリフト 3セット 5回\n（土）肩\nショルダープレス 3セット×10回\n日曜日\nレッグプレス 3×12');
  assert.deepEqual(r.days.map(d => `${d.dow}:${d.name}`), ['1:胸', '2:脚', '4:背中', '6:肩', '0:Workout']);
  assert.deepEqual(items(r.days[2]), ['デッドリフト|3|5-5']);
});

test('plan: Malay days, "set", "ulangan" and "rep"', () => {
  const r = parseSplitText('Isnin – Dada\nBench press – 4 set, 6–8 ulangan\nTekan dada barbell 3 set 10 rep\n\nSelasa – Belakang\nLat pulldown 3 set x 10 ulangan\nRabu: Kaki\nCangkung barbell 5 x 5\nKhamis\nAngkat mati 3 set 5 ulangan\nJumaat\nBench press 3x8\nSabtu\nBench press 3x8\nAhad\nBench press 3x8');
  assert.deepEqual(r.days.map(d => `${d.dow}:${d.name}`), ['1:Dada', '2:Belakang', '3:Kaki', '4:Workout', '5:Workout', '6:Workout', '0:Workout']);
  assert.deepEqual(items(r.days[0]), ['Bench press|4|6-8', 'Tekan dada barbell|3|10-10']);
  assert.deepEqual(items(r.days[1]), ['Lat pulldown|3|10-10']);
  assert.deepEqual(items(r.days[3]), ['Angkat mati|3|5-5']);
});

test('plan: ×/x/X/＊ and ～/〜/~/–/-/— ranges, full-width digits', () => {
  const r = parseSplitText('Monday\nBench press 3 X 8~10\nSquat 3＊5〜6\nRow ３×８—１０\nCurl 3 x 10-12');
  assert.deepEqual(items(r.days[0]), ['Bench press|3|8-10', 'Squat|3|5-6', 'Row|3|8-10', 'Curl|3|10-12']);
});

test('plan: English plans read exactly as before', () => {
  const r = parseSplitText('Monday – Chest\n1. Bench Press – 4 × 6–8\n2. Incline Dumbbell Press – 3 × 8–10\n15 min incline walk\n\nTuesday – Back\n1. Lat Pulldown – 3 × 8–10\nSquat: 5 sets');
  assert.deepEqual(r.days.map(d => `${d.dow}:${d.name}:${d.sub}`), ['1:Chest:+ 15 min incline walk', '2:Back:']);
  assert.deepEqual(items(r.days[0]), ['Bench Press|4|6-8', 'Incline Dumbbell Press|3|8-10']);
  assert.deepEqual(items(r.days[1]), ['Lat Pulldown|3|8-10', 'Squat|5|6-10']);
});

// ---- names in other languages match library exercises ---------------------------------------------
test('names: translated library names match through the reverse lookup', () => {
  // Names come from the dictionaries themselves, so rewording a translation never breaks this test.
  for (const d of [zhD, jaD, msD]) for (const id of ['bbbench', 'pulldown', 'deadlift', 'legpress', 'bbsquat']) {
    const tr = trName(d, id);
    if (tr && tr.toLowerCase() !== libName(id).toLowerCase()) assert.equal(match(tr), id, `${tr} → ${id}`);
  }
  // English is unchanged.
  assert.equal(match('Barbell bench press'), 'bbbench');
  assert.equal(match('Deadlift'), 'deadlift');
  assert.equal(match('Lat pulldown'), 'pulldown');
});

test('names: muscle and day words are not treated as exercise names', () => {
  assert.equal(match('胸'), null);
  assert.equal(match('背中'), null);
});

// ---- muscles guessed for imported exercises ------------------------------------------------------
test('muscles: word boundaries and rule order', () => {
  const g = io.guessMuscles;
  assert.deepEqual(g('Bulgarian split squat smith machine'), ['Quads', 'Glutes']); // "chin" inside "machine"
  assert.deepEqual(g('Machine chest press'), ['Chest', 'Front delts', 'Triceps']);
  assert.deepEqual(g('Chin-up'), ['Back', 'Biceps']);
  assert.deepEqual(g('Chest supported row'), ['Back']);
  assert.deepEqual(g('Chest-supported row'), ['Back']);
  assert.deepEqual(g('Reverse cable fly'), ['Rear delts']);
  assert.deepEqual(g('reverse pec deck'), ['Rear delts']);
  assert.deepEqual(g('Belly (abs) curl'), ['Abs']);
  assert.deepEqual(g('abs curl'), ['Abs']);
  assert.deepEqual(g('Cable abs crunch'), ['Abs']);
  assert.deepEqual(g('Cable reverse wrist curl'), ['Forearms']);
  assert.deepEqual(g('Leg curl'), ['Hamstrings']);
  assert.deepEqual(g('Hammer curl'), ['Biceps']);
  assert.deepEqual(g('Upright row'), ['Side delts']);
  assert.deepEqual(g('Cable fly'), ['Chest']);
});

test('muscles: a translated library name takes that exercise\'s muscles', () => {
  const lib = id => EXERCISES.find(e => e.id === id).muscles;
  assert.deepEqual(io.guessMuscles(trName(zhD, 'bbbench')), lib('bbbench'));
  assert.deepEqual(io.guessMuscles(trName(jaD, 'pulldown')), lib('pulldown'));
  assert.deepEqual(io.guessMuscles(trName(jaD, 'deadlift')), lib('deadlift'));
  assert.deepEqual(io.guessMuscles(trName(zhD, 'dbcurl')), lib('dbcurl'));
  // Not a library name, but its words are known.
  assert.deepEqual(io.guessMuscles('ケーブルカール'), ['Biceps']);
});

// ---- log import: dates ----------------------------------------------------------------------------
test('log: "9月28日", "2026年9月28日", "9月28日(月)", "9/28（月）" start sessions', () => {
  const s = parse('9月28日\n杠铃卧推 60kg x 8\n\n2026年9月29日\n深蹲 80kg x 5\n\n9月30日(水)\n硬拉 100kg x 5\n\n10/1（木）\n卧推 60kg x 8');
  assert.deepEqual(s.map(x => x.date), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
  assert.equal(io.findDate('9月28日', 2026), '2026-09-28');
  assert.equal(io.findDate('2025年12月3日', 2026), '2025-12-03');
  assert.equal(io.findDate('9月28日(月)', 2026), '2026-09-28');
});

test('log: Japanese and Chinese logs are month first; other text stays day first', () => {
  assert.deepEqual(parse('10/3\nベンチプレス 60kg×10回').map(x => x.date), ['2026-10-03']);
  assert.deepEqual(parse('10/3 胸\n卧推 60kg x 8').map(x => x.date), ['2026-10-03']);
  assert.deepEqual(parse('10/3\nBench press 60kg x 8').map(x => x.date), ['2026-03-10']);
  // An explicit order still wins.
  assert.deepEqual(parse('10/3\nベンチプレス 60kg×10回', { dateOrder: 'dmy' }).map(x => x.date), ['2026-03-10']);
});

// ---- log import: sets ----------------------------------------------------------------------------
test('log: "60kg×10回×3セット" is 3 sets of 10 at 60 kg', () => {
  const s = parse('9月28日\nベンチプレス 60kg×10回×3セット');
  assert.deepEqual(sets(s[0]), ['60x10 60x10 60x10']);
  assert.equal(s[0].entries[0].exName, 'ベンチプレス');
});

test('log: Chinese "60公斤 10次 3组", "3组×10次 60kg", "60kg x 10 x 3"', () => {
  const s = parse('9月28日\n卧推 60公斤 10次 3组\n深蹲 3组×10次 80kg\n硬拉 100kg x 5 x 3\n划船 50公斤×8次');
  assert.deepEqual(sets(s[0]), ['60x10 60x10 60x10', '80x10 80x10 80x10', '100x5 100x5 100x5', '50x8']);
});

test('log: full-width "６０ｋｇ×１０回" is read', () => {
  const s = parse('９月２８日\nベンチプレス ６０ｋｇ×１０回\nスクワット ８０ｋｇ×５回×３セット');
  assert.equal(s[0].date, '2026-09-28');
  assert.deepEqual(sets(s[0]), ['60x10', '80x5 80x5 80x5']);
});

test('log: Malay "60kg x 10 ulangan", "3 set"', () => {
  const s = parse(`28/9/2026\n${trName(msD, 'bbbench')} 60kg x 10 ulangan\n${trName(msD, 'bbsquat')} 80kg x 5 ulangan x 3 set\n${trName(msD, 'deadlift')} 100kg 3 set x 5 ulangan`);
  assert.deepEqual(sets(s[0]), ['60x10', '80x5 80x5 80x5', '100x5 100x5 100x5']);
  assert.deepEqual(s[0].entries.map(e => e.match), ['bbbench', 'bbsquat', 'deadlift']);
});

test('log: limits still apply to CJK forms', () => {
  const s = parse('9月28日\n卧推 60kg×10回×99セット\n深蹲 9999kg×5回');
  assert.ok(s[0].entries[0].sets.length <= 12);
  assert.equal(s[0].entries.length, 1);
});
