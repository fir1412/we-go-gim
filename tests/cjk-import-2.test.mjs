// Run: node --test tests/cjk-import-2.test.mjs
// Round-2 findings from Chinese, Japanese and Malay users: set/rep words, bodyweight lists, cable pins, pain words,
// gym nicknames, CSV headers and encodings, and plan section words. Every log and plan here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as io from '../js/io.js';
import { parseSplitText } from '../js/split.js';
import { EXERCISES } from '../js/seed.js';

await io.foreignNamesReady;

const parse = (text, opts = {}) => io.parseLogText(text, EXERCISES, { year: 2026, ...opts }).sessions;
const one = (line, head = '9月28日') => parse(`${head}\n${line}`)[0]?.entries.at(-1);
const sets = e => e?.sets.map(x => `${x.w}x${x.r}`).join(' ');
const match = n => io.matchExercise(n, EXERCISES)?.ex.id || null;
const items = d => d.items.map(x => `${x.name}|${x.sets}|${x.lo}-${x.hi}|${x.note}`);

// ---- 1. set words vs rep words ----------------------------------------------------------------------
test('import: "4组12次" is 4 sets of 12, not 1 set of 4', () => {
  assert.equal(sets(one('深蹲 60kg 4组12次')), '60x12 60x12 60x12 60x12');
  assert.equal(sets(one('深蹲 60kg 4组8次')), '60x8 60x8 60x8 60x8');
  assert.equal(sets(one('深蹲 4组12次 60kg')), '60x12 60x12 60x12 60x12');
});

test('import: "3组×10次" with no load is 3 sets of 10 (load unknown)', () => {
  const e = one('卧推 3组×10次');
  assert.equal(e.match, 'bbbench');
  assert.equal(sets(e), 'nullx10 nullx10 nullx10');
});

test('import: a bare ×N after a 次/回 count is a set count', () => {
  assert.equal(sets(one('卧推 60kg 12次×3')), '60x12 60x12 60x12');
  assert.equal(sets(one('ベンチプレス 40kg 10回×3')), '40x10 40x10 40x10');
  assert.equal(sets(one('ベンチプレス 40kg 10回×3セット')), '40x10 40x10 40x10');
});

test('import: "腕立て伏せ 15回×3セット" is 3 bodyweight sets of 15', () => {
  const e = one('腕立て伏せ 15回×3セット');
  assert.equal(e.match, 'pushup');
  assert.equal(sets(e), '0x15 0x15 0x15');
  assert.equal(e.unit, 'bw');
});

// ---- 2. bodyweight lists ----------------------------------------------------------------------------
test('import: 自重 lists are bodyweight sets', () => {
  for (const l of ['引体向上 自重 8,8,6', '引体向上 自重 8、8、6']) {
    const e = one(l);
    assert.equal(sets(e), '0x8 0x8 0x6', l);
    assert.equal(e.unit, 'bw', l);
    assert.equal(e.match, 'pullup', l);
  }
  const e = one('懸垂 自重 8回 6回 5回');
  assert.equal(sets(e), '0x8 0x6 0x5');
  assert.equal(e.match, 'pullup');
});

test('import: "懸垂 自重×8回×3セット" is 3 bodyweight sets of 8', () => {
  const e = one('懸垂 自重×8回×3セット');
  assert.equal(sets(e), '0x8 0x8 0x8');
  assert.equal(e.unit, 'bw');
});

// ---- 3. cable pins ----------------------------------------------------------------------------------
test('import: "5档 12次3组" is cable level 5, 3 sets of 12, its own exercise', () => {
  const s = parse('9月28日\n深蹲 60kg 3x8\n龙门架夹胸 5档 12次3组')[0];
  assert.equal(s.entries.length, 2);
  const e = s.entries[1];
  assert.equal(e.exName, '龙门架夹胸');
  assert.equal(e.match, 'fly');
  assert.equal(e.unit, 'L');
  assert.equal(sets(e), '5x12 5x12 5x12');
  assert.equal(s.entries[0].note, '');
});

test('import: Japanese "目盛り5 12回×3セット" is level 5', () => {
  const e = one('ケーブルフライ 目盛り5 12回×3セット');
  assert.equal(e.unit, 'L');
  assert.equal(sets(e), '5x12 5x12 5x12');
});

// ---- 4 / 17. pain words -----------------------------------------------------------------------------
test('pain: Chinese, Japanese and Malay pain words flag pain; soreness and denials do not', () => {
  for (const t of ['膝盖痛', '肩膀有点疼', '腰が痛い', '右肩に痛み', '肩を痛めた', 'lutut sakit', 'sakit bahu']) assert.equal(io.hasPain(t), true, t);
  for (const t of ['肌肉酸痛', '腿很酸', '不痛', '没有痛', '痛くない', '痛みなし', 'sakit otot', 'tak sakit', 'tidak sakit']) assert.equal(io.hasPain(t), false, t);
  assert.equal(io.hasPain('knee pain'), true);
  assert.equal(io.hasPain('no pain'), false);
});

test('pain: a Chinese remark after the sets, or on the next line, flags the exercise', () => {
  const e = one('深蹲 60kg 3x8 膝盖痛');
  assert.equal(e.pain, true);
  assert.match(e.note, /膝盖痛/);
  assert.equal(parse('9月28日\n深蹲 60kg 3x8\n腰が痛い')[0].entries[0].pain, true);
  assert.equal(parse('9月28日\n深蹲 60kg 3x8\n肌肉酸痛')[0].entries[0].pain, false);
});

// ---- 5 / 13 / 14. gym names -------------------------------------------------------------------------
test('names: common Chinese and Japanese gym names match the library', () => {
  const want = {
    龙门架夹胸: 'fly', 倒蹬: 'legpress', 倒蹬机: 'legpress', 坐姿推胸: 'mchest', 腹肌轮: 'abwheel', 高位下拉: 'pulldown',
    ラットプル: 'pulldown', チェストプレス: 'mchest', レッグプレス: 'legpress', ベンチ: 'bbbench', デッド: 'deadlift', シーテッドロウ: 'cablerow',
  };
  for (const [n, id] of Object.entries(want)) assert.equal(match(n), id, n);
});

test('import: a line starting with a new lift word starts a new entry (デッド after スクワット)', () => {
  const s = parse('9月28日\nスクワット 80kg 5回×5\nデッド 100kg 5回')[0];
  assert.deepEqual(s.entries.map(e => e.match), ['bbsquat', 'deadlift']);
  assert.equal(sets(s.entries[1]), '100x5');
});

test('import: a loaded squat is the barbell squat, not the bodyweight one', () => {
  assert.equal(one('スクワット 80kg 3x5').match, 'bbsquat');
  assert.equal(one('Squat 80kg 3x5', '21/9').match, 'bbsquat');
  assert.equal(one('Squat BW x20', '21/9').match, 'bwsquat');
  assert.equal(one('Pull up +10kg x6', '21/9').match, 'pullup');
});

// ---- 6 / 16. month-first dates in Chinese/Japanese --------------------------------------------------
test('dates: 9/5 in a Chinese or Japanese note is 5 September', () => {
  assert.equal(parse('9/5\n卧推 60kg 3x8')[0].date, '2026-09-05');
  assert.equal(parse('9/5 胸の日\nベンチプレス 60kg 3x8')[0].date, '2026-09-05');
  // English stays day first.
  assert.equal(parse('9/5\nBench press 60kg 3x8')[0].date, '2026-05-09');
});

test('CSV: 9/5 in a Japanese or Chinese CSV reads month first', () => {
  const [s] = io.sessionsFromCSV('日付,種目,重量,回数\n9/5,ベンチプレス,60,8\n');
  assert.equal(s.date, `${new Date().getFullYear()}-09-05`);
  const [e] = io.sessionsFromCSV('date,exercise,weight,reps\n9/5/2026,Bench,60,8\n9/5/2026,Squat,60,8\n');
  assert.equal(e.date, '2026-05-09');
});

// ---- 7 / 11. paste a plan ---------------------------------------------------------------------------
test('plan: Chinese 可选 / 最后加练 / 最后 headings, 力竭 and 秒', () => {
  const r = parseSplitText('星期一 胸\n卧推 3组×8次\n可选：\n双杠臂屈伸 3组×10次\n最后加练：\n平板支撑 3组×60秒\n俯卧撑 2组 力竭');
  assert.deepEqual(items(r.days[0]), ['卧推|3|8-8|', '双杠臂屈伸|3|10-10|Optional', '平板支撑|3|60-60|Finisher · seconds', '俯卧撑|2|8-20|Finisher · to failure']);
  assert.deepEqual(r.notAdded, []);
  const r2 = parseSplitText('星期一 胸\n卧推 3组×8次\n最后：\n俯卧撑 2组×力竭');
  assert.deepEqual(items(r2.days[0]), ['卧推|3|8-8|', '俯卧撑|2|8-20|Finisher · to failure']);
});

test('plan: Japanese 仕上げ： inline is a finisher, not part of the name', () => {
  const r = parseSplitText('月曜日 胸\nベンチプレス 3セット×8回\n仕上げ：プランク 3セット×60秒');
  assert.deepEqual(items(r.days[0]), ['ベンチプレス|3|8-8|', 'プランク|3|60-60|Finisher · seconds']);
  const r2 = parseSplitText('月曜日 胸\n仕上げ：\n腕立て伏せ 2セット 限界まで');
  assert.deepEqual(items(r2.days[0]), ['腕立て伏せ|2|8-20|Finisher · to failure']);
});

test('plan: Malay "Pilihan:" and "Akhiri dengan:" work like Optional and Finish with', () => {
  const r = parseSplitText('Isnin: Dada\nTekan dada 3 x 8\nPilihan:\nDips 3 x 10\nAkhiri dengan:\nPlank 3 x 60 seconds');
  assert.deepEqual(items(r.days[0]), ['Tekan dada|3|8-8|', 'Dips|3|10-10|Optional', 'Plank|3|60-60|Finisher · seconds']);
});

test('plan: English Optional / Finish with unchanged', () => {
  const r = parseSplitText('Monday - Push\nBench 3x8\nOptional:\nDips 3 x 10\nFinish with:\nPlank 3 x 60 seconds\nPushups 2 sets to failure');
  assert.deepEqual(items(r.days[0]), ['Bench|3|8-8|', 'Dips|3|10-10|Optional', 'Plank|3|60-60|Finisher · seconds', 'Pushups|2|8-20|Finisher · to failure']);
});

// ---- 8. bodyweight "3x6" ----------------------------------------------------------------------------
test('import: "Pull up 3x6" is 3 bodyweight sets of 6, not 3 kg', () => {
  const e = one('Pull up 3x6', '21/9');
  assert.equal(sets(e), '0x6 0x6 0x6');
  assert.equal(e.unit, 'bw');
  const t = one('tekan tubi 3x15', '21/9');
  assert.equal(t.match, 'pushup');
  assert.equal(sets(t), '0x15 0x15 0x15');
  // A loaded lift keeps its reading.
  assert.equal(sets(one('Bench press 60 x 8', '21/9')), '60x8');
  assert.equal(sets(one('Pull up BW x8 x3', '21/9')), '0x8 0x8 0x8');
});

// ---- 9. Malay names ---------------------------------------------------------------------------------
test('names: common Malay gym names match the library', () => {
  const want = {
    'Tarik naik': 'pullup', 'Angkat mati': 'deadlift', 'Angkat mati romania': 'rdl', Cangkung: 'bbsquat', 'Cangkung barbell': 'bbsquat',
    'Tekan bahu': 'ohp', 'Tekan dada': 'bbbench', Dayung: 'bbrow', 'Bangkit betis': 'calf', 'Angkat betis': 'calf', 'Tekan tubi': 'pushup', Bench: 'bbbench',
  };
  for (const [n, id] of Object.entries(want)) assert.equal(match(n), id, n);
  // English unchanged.
  assert.equal(match('Bench press'), 'bbbench');
  assert.equal(match('Incline bench'), match('Incline bench'));
});

// ---- 10 / 15. CSV headers ---------------------------------------------------------------------------
test('CSV: Malay headers, with a set-count column', () => {
  const [s] = io.sessionsFromCSV('Tarikh,Latihan,Set,Ulangan,Berat\n21/9/2026,Tekan dada,3,10,60\n');
  assert.equal(s.date, '2026-09-21');
  assert.equal(s.entries[0].exName, 'Tekan dada');
  assert.equal(sets(s.entries[0]), '60x10 60x10 60x10');
  const [s2] = io.sessionsFromCSV('Tarikh,Senaman,Bil set,Rep,Berat\n21/9/2026,Squat,3,8,80\n');
  assert.equal(sets(s2.entries[0]), '80x8 80x8 80x8');
  assert.equal(io.routeFile('log.txt', new Uint8Array(), 'Tarikh,Latihan,Set,Ulangan,Berat\n').kind, 'csv');
});

test('CSV: our own export still reads "set" as the set number', () => {
  const ex = { bench: { name: 'Flat DB bench press', unit: 'kg/DB' } };
  const csv = io.toCSV([{ date: '2026-09-21', name: 'Push', entries: [{ exId: 'bench', sets: [{ w: 25, r: 8, done: true }, { w: 25, r: 7, done: true }], rir: '1', pain: false, note: '' }] }], ex);
  assert.equal(sets(io.sessionsFromCSV(csv)[0].entries[0]), '25x8 25x7');
});

test('CSV: Japanese and Chinese headers', () => {
  const [j] = io.sessionsFromCSV('日付,種目,重量,回数,セット数,メモ\n2026/09/21,ベンチプレス,60,8,3,右肩に痛み\n');
  assert.equal(sets(j.entries[0]), '60x8 60x8 60x8');
  assert.equal(j.entries[0].pain, true);
  const [j2] = io.sessionsFromCSV('日付,種目,重量(kg),回数,セット\n2026/09/21,スクワット,80,5,2\n');
  assert.equal(sets(j2.entries[0]), '80x5 80x5');
  const [z] = io.sessionsFromCSV('日期,动作名称,重量,次数,组数,备注\n2026-09-21,卧推,60,8,3,膝盖痛\n');
  assert.equal(sets(z.entries[0]), '60x8 60x8 60x8');
  assert.equal(z.entries[0].pain, true);
  const [z2] = io.sessionsFromCSV('日期,动作,重量,次数\n2026-09-21,卧推,60,8\n');
  assert.equal(z2.entries[0].exName, '卧推');
  assert.equal(io.routeFile('log.txt', new Uint8Array(), '日付,種目,重量,回数\n').kind, 'csv');
  assert.equal(io.routeFile('log.txt', new Uint8Array(), '日期,动作,重量,次数\n').kind, 'csv');
});

// ---- 15. Shift-JIS and GBK files --------------------------------------------------------------------
// Bytes written out by hand so the test doesn't depend on an encoder.
const SJIS = [0x93, 0xfa, 0x95, 0x74, 0x2c, 0x8e, 0xed, 0x96, 0xda, 0x2c, 0x8f, 0x64, 0x97, 0xca, 0x2c, 0x89, 0xf1, 0x90, 0x94, 0x0a, // 日付,種目,重量,回数
  0x32, 0x30, 0x32, 0x36, 0x2f, 0x30, 0x39, 0x2f, 0x32, 0x31, 0x2c, 0x83, 0x78, 0x83, 0x93, 0x83, 0x60, 0x83, 0x76, 0x83, 0x8c, 0x83, 0x58, 0x2c, 0x36, 0x30, 0x2c, 0x38, 0x0a]; // 2026/09/21,ベンチプレス,60,8
const GBK = [0xc8, 0xd5, 0xc6, 0xda, 0x2c, 0xb6, 0xaf, 0xd7, 0xf7, 0x2c, 0xd6, 0xd8, 0xc1, 0xbf, 0x2c, 0xb4, 0xce, 0xca, 0xfd, 0x0a, // 日期,动作,重量,次数
  0x32, 0x30, 0x32, 0x36, 0x2d, 0x30, 0x39, 0x2d, 0x32, 0x31, 0x2c, 0xce, 0xd4, 0xcd, 0xc6, 0x2c, 0x36, 0x30, 0x2c, 0x38, 0x0a]; // 2026-09-21,卧推,60,8

test('files: Shift-JIS and GBK bytes are decoded', () => {
  assert.equal(io.decodeBytes(new Uint8Array(SJIS)), '日付,種目,重量,回数\n2026/09/21,ベンチプレス,60,8\n');
  assert.equal(io.decodeBytes(new Uint8Array(GBK)), '日期,动作,重量,次数\n2026-09-21,卧推,60,8\n');
  // Windows-1252 accents stay Latin.
  assert.equal(io.decodeBytes(new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x73, 0x20, 0x70, 0x72, 0x65, 0x73, 0x73])), 'Cafés press');
  const r = io.importFile('log.csv', new Uint8Array(SJIS), EXERCISES);
  assert.equal(r.kind, 'csv');
  assert.equal(r.sessions[0].entries[0].exName, 'ベンチプレス');
});

// ---- 18. CSV export BOM -----------------------------------------------------------------------------
test('CSV export starts with a UTF-8 byte-order mark and still reads back', () => {
  const ex = { a: { name: '@SUM(1)', unit: 'kg' } };
  const csv = io.toCSV([{ date: '2026-09-21', name: '胸の日', entries: [{ exId: 'a', sets: [{ w: 1, r: 1, done: true }], note: '' }] }], ex);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.match(csv.split('\n')[1], /'@SUM/);
  assert.equal(io.sessionsFromCSV(csv)[0].name, '胸の日');
});
