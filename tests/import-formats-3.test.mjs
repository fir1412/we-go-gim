// Run: node --test tests/import-formats-3.test.mjs
// Round-3 findings from simulated users: rep lists after one load, 3-letter lift names, timed holds, Malay and
// Japanese set words, Malay names, CSV headers, sets with no reps, and numbered days in pasted plans.
// Every log and plan here is made up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as io from '../js/io.js';
import { parseSplitText } from '../js/split.js';
import { EXERCISES } from '../js/seed.js';

await io.foreignNamesReady;

const parse = (text, opts = {}) => io.parseLogText(text, EXERCISES, { year: 2026, ...opts });
const ents = (lines, head = '21/9') => parse(`${head}\n${lines}`).sessions[0]?.entries || [];
const one = (line, head = '21/9') => ents(line, head).at(-1);
const sets = e => e?.sets.map(x => `${x.w}x${x.r}`).join(' ');
const days = r => r.days.map(d => `${d.name}:${d.items.map(x => x.name).join(',')}`);

// ---- 1. one load, a list of reps -------------------------------------------------------------------
test('import r3: "60kg x 8, 8, 6" is three sets at 60 kg', () => {
  assert.equal(sets(one('Bench press 60kg x 8, 8, 6')), '60x8 60x8 60x6');
  assert.equal(sets(one('Bench press 45kg×10,10,8')), '45x10 45x10 45x8');
});
test('import r3: "60kg x8 x8 x6" is three sets, not eight', () => {
  assert.equal(sets(one('Bench press 60kg x8 x8 x6')), '60x8 60x8 60x6');
  // Two numbers after a load still mean reps x sets.
  assert.equal(sets(one('Bench press 60kg x 8 x 3')), '60x8 60x8 60x8');
});
test('import r3: "45kg 10.10.8" is three sets; "10.5kg" stays a load', () => {
  const r = parse('21/9\nBench press 45kg 10.10.8');
  assert.equal(sets(r.sessions[0]?.entries[0]), '45x10 45x10 45x8');
  assert.equal(sets(one('Lateral raise 10.5kg 12')), '10.5x12');
  assert.equal(sets(one('Lateral raise 10.5kg x 12, 12')), '10.5x12 10.5x12');
});

// ---- 2. three-letter lift names ----------------------------------------------------------------------
test('import r3: "Dip", "Row" and "Fly" start their own entries', () => {
  const e = ents('Bench press 60kg x8\nDip 3x10\nRow 60kg 3x8\nFly 12kg 3x12');
  assert.deepEqual(e.map(x => x.exName), ['Bench press', 'Dip', 'Row', 'Fly']);
  assert.equal(e[1].match, 'dip');
  assert.equal(sets(e[1]), '0x10 0x10 0x10');
  assert.equal(e[2].match, 'bbrow');
  assert.equal(sets(e[2]), '60x8 60x8 60x8');
  assert.ok(['dbfly', 'fly'].includes(e[3].match), e[3].match);
  assert.equal(sets(e[3]), '12x12 12x12 12x12');
});

// ---- 3. a load means the barbell squat -----------------------------------------------------------------
test('import r3: "Squat 100kg" with its sets is the barbell squat', () => {
  for (const t of ['Squat 100kg 5x5', 'Squat 100kg\n5x5', 'Squat\n100kg\n5x5']) {
    const e = one(t);
    assert.equal(e?.match, 'bbsquat', t);
    assert.equal(sets(e), '100x5 100x5 100x5 100x5 100x5', t);
  }
});

// ---- 4. timed holds ------------------------------------------------------------------------------------
test('import r3: "Plank 3x60s" and "Plank 3x60 sec" are three sets of 60', () => {
  for (const t of ['Plank 3x60s', 'Plank 3x60 sec', 'Plank 3 x 60 seconds']) {
    const e = one(t);
    assert.equal(e?.match, 'plank', t);
    assert.deepEqual(e.sets.map(x => x.r), [60, 60, 60], t);
  }
});

// ---- 5. Malay set and rep words ---------------------------------------------------------------------
test('import r3: "3 set, 5 ulangan" is three sets of five', () => {
  assert.equal(sets(one('Bench press 3 set, 5 ulangan')), 'nullx5 nullx5 nullx5');
  assert.equal(sets(one('Squat 60kg 3 set 5 ulangan')), '60x5 60x5 60x5');
  assert.equal(sets(one('Squat 60kg 3 set, 5 ulangan')), '60x5 60x5 60x5');
});

// ---- 6. Japanese per-hand loads and day headings ------------------------------------------------------
test('import r3: "片手12kg" is 12 kg per dumbbell and keeps the name', () => {
  const e = one('ダンベルプレス 片手12kg 10回×3', '9月28日');
  assert.equal(e.exName, 'ダンベルプレス');
  assert.equal(e.match, 'bench');
  assert.equal(e.unit, 'kg/DB');
  assert.equal(sets(e), '12x10 12x10 12x10');
});
test('import r3: a day heading names the session', () => {
  const name = t => parse(t).sessions[0]?.name;
  assert.equal(name('9月28日 胸の日\nベンチプレス 60kg 10回×3'), 'Chest Day');
  assert.equal(name('9月28日\n胸の日\nベンチプレス 60kg 10回×3'), 'Chest Day');
  assert.equal(name('21/9 Chest day\nBench press 60kg x8'), 'Chest Day');
  assert.equal(name('21/9\nChest day\nBench press 60kg x8'), 'Chest Day');
  // A file name already names it: the heading doesn't replace it.
  assert.equal(parse('21/9\nChest day\nBench press 60kg x8', { sessionName: 'Push 1' }).sessions[0].name, 'Push 1');
});

// ---- 7. Malay names -------------------------------------------------------------------------------------
test('import r3: Malay names match', () => {
  assert.equal(one('Tekan bahu dumbbell 12kg x10').match, 'shp');
  assert.equal(one('Tarik dagu 3x8').match, 'chinup');
  assert.equal(one('Lunge berjalan 10kg x12').match, 'lunge');
});

// ---- 8. CSV headers -------------------------------------------------------------------------------------
test('import r3: Malay CSV headers "Nama senaman" and "Beban"', () => {
  const s = io.sessionsFromCSV('Tarikh,Nama senaman,Beban,Ulangan\n2026-09-21,Bench press,60,8\n2026-09-21,Bench press,60,6');
  assert.equal(s.length, 1);
  assert.equal(s[0].entries[0].exName, 'Bench press');
  assert.equal(sets(s[0].entries[0]), '60x8 60x6');
});
test('import r3: a CSV with no weight column (bodyweight log) is accepted', () => {
  const s = io.sessionsFromCSV('Date,Exercise,Reps\n2026-09-21,Pull up,8\n2026-09-21,Pull up,6');
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].entries[0].sets.map(x => x.r), [8, 6]);
});
test('import r3: Chinese "训练日期" is the date column', () => {
  const s = io.sessionsFromCSV('训练日期,动作,重量,次数\n2026-09-21,深蹲,100,5');
  assert.equal(s[0].date, '2026-09-21');
  assert.equal(sets(s[0].entries[0]), '100x5');
});

// ---- 9. sets written, no reps ---------------------------------------------------------------------------
test('import r3: "60kg 3 sets" with no reps is three sets, reps unknown', () => {
  assert.equal(sets(one('深蹲 60kg 3组', '9月28日')), '60xnull 60xnull 60xnull');
  assert.equal(sets(one('Squat 60kg 3 sets')), '60xnull 60xnull 60xnull');
  assert.equal(sets(one('Squat 60kg 3 set')), '60xnull 60xnull 60xnull');
});

// ---- 10. numbered days in a pasted plan -----------------------------------------------------------------
test('plan r3: "D2", "Day 2", "第4天", "4日目" each start a day', () => {
  assert.deepEqual(days(parseSplitText('D1\nBench 3x8\nD2\nSquat 3x5')), ['Day 1:Bench', 'Day 2:Squat']);
  assert.deepEqual(days(parseSplitText('D1 - Push\nBench 3x8\nD2 - Legs\nSquat 3x5')), ['Push:Bench', 'Legs:Squat']);
  assert.deepEqual(days(parseSplitText('Day 1: Push\nBench 3x8\nDay 2: Legs\nSquat 3x5')), ['Push:Bench', 'Legs:Squat']);
  assert.deepEqual(days(parseSplitText('第1天 胸\n卧推 3x8\n第4天 腿\n深蹲 3x5')), ['胸:卧推', '腿:深蹲']);
  assert.deepEqual(days(parseSplitText('1日目\nベンチプレス 3x8\n4日目\nスクワット 3x5')), ['Day 1:ベンチプレス', 'Day 4:スクワット']);
});

// ---- 11. Japanese names ---------------------------------------------------------------------------------
test('import r3: Japanese gym names match', () => {
  const m = n => io.matchExercise(n, EXERCISES)?.ex.id || null;
  assert.equal(m('ダンベルプレス'), 'bench');
  assert.equal(m('ブルガリアン'), 'bss');
  assert.equal(m('ブルガリアンスクワット'), 'bss');
  assert.equal(m('ルーマニアン'), 'rdl');
  assert.equal(m('ルーマニアンデッドリフト'), 'rdl');
  assert.ok(['calf', 'bwcalf'].includes(m('カーフレイズ')));
  assert.equal(m('ハイパーエクステンション'), 'backext');
  assert.equal(m('ケーブルクロス'), 'fly');
  assert.equal(m('ケーブルクロスオーバー'), 'fly');
  assert.equal(m('プッシュダウン'), 'pushdown');
  assert.equal(m('アダクション'), 'hipadd');
  assert.equal(m('ワンハンドロウ'), 'dbrow');
  assert.equal(one('ワンハンドロウ 20kg×10', '9月28日').match, 'dbrow');
});

// ---- 12. Japanese timed holds ---------------------------------------------------------------------------
test('import r3: Japanese timed holds are sets of seconds', () => {
  const r = t => one(t, '9月28日')?.sets.map(x => x.r);
  assert.deepEqual(r('プランク 60秒×3セット'), [60, 60, 60]);
  assert.deepEqual(r('プランク 1分×3'), [60, 60, 60]);
  assert.deepEqual(r('サイドプランク 左右30秒'), [30, 30]);
  assert.equal(one('プランク 60秒×3セット', '9月28日').match, 'plank');
});

// ---- 13. Japanese pain words ------------------------------------------------------------------------------
test('import r3: 違和感, 張り and しびれ flag pain', () => {
  for (const w of ['肩に違和感', '腰に張り', '指にしびれ']) assert.equal(io.hasPain(w), true, w);
  assert.equal(one('ベンチプレス 60kg×10 肩に違和感', '9月28日').pain, true);
});

// ---- 14. Japanese plan words ------------------------------------------------------------------------------
test('plan r3: "最後に：", "×限界" and "60秒×3"', () => {
  const r = parseSplitText('月曜日 胸\nベンチプレス 3セット×8回\n最後に：\n腕立て伏せ 2セット×限界\nプランク 60秒×3');
  const it = r.days[0].items;
  assert.equal(it.length, 3);
  assert.equal(it[1].sets, 2);
  assert.match(it[1].note, /Finisher/);
  assert.match(it[1].note, /failure/);
  assert.equal(it[2].sets, 3);
  assert.equal(it[2].lo, 60);
  assert.match(it[2].note, /seconds/);
});

// ---- 15. added load on bodyweight, machine levels --------------------------------------------------------
test('import r3: "自重+10kg×6回×3セット" is three sets of 6 at bodyweight + 10', () => {
  const e = one('懸垂 自重+10kg×6回×3セット', '9月28日');
  assert.equal(e.unit, 'bw');
  assert.equal(sets(e), '10x6 10x6 10x6');
  assert.equal(sets(one('Pull up BW+10kg x6 x3')), '10x6 10x6 10x6');
});
test('import r3: "レベル4" is machine level 4', () => {
  const e = one('ラットプルダウン レベル4×10回×3セット', '9月28日');
  assert.equal(e.exName, 'ラットプルダウン');
  assert.equal(e.unit, 'L');
  assert.equal(sets(e), '4x10 4x10 4x10');
});
