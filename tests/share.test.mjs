// Share pictures: what each picture says in the edge cases, text fitting, and the two truth fixes the pictures depend
// on (badges and the month recap must never count or compare sample data). Run: node --test tests/share.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { S } from '../js/state.js';
import { recapStats, summaryStats, setUnits, xpForLevel } from '../js/engine.js';
import { badges } from '../js/gamify.js';
import { setLang } from '../js/i18n.js';

// ui.js (sheets, toasts) expects a window; the pure parts of share.js don't touch it.
globalThis.window ??= globalThis; globalThis.addEventListener ??= () => {};
const { wrap, fitLines, clip, latin, sayStreak, sayWorkout, sayBest, sayMonth, sayLevel, caption, longMonth, streakData, layout, fitLayout } = await import('../js/share.js');

const EX = {
  bench: { id: 'bench', name: 'Barbell bench press', unit: 'kg', equip: 'barbell', muscles: ['Chest', 'Triceps'] },
  row: { id: 'row', name: 'Seated cable row', unit: 'L', equip: 'cable', muscles: ['Back'] },
  pullup: { id: 'pullup', name: 'Pull-up', unit: 'bw', equip: 'bodyweight', muscles: ['Back', 'Biceps'] },
};
const sets = (w, r, n = 3) => Array.from({ length: n }, () => ({ w, r, done: true }));
const sess = (id, date, entries, extra = {}) => ({ id, date, name: 'Push day', entries, ...extra });
const LINK = 'https://fir1412.github.io/we-go-gim/';

// ---- text fitting ----------------------------------------------------------------------------------------------
const m = (s, size = 10) => s.length * size * 0.5;   // a fake measure: half an em per character

test('wrap: between words, at CJK characters, and inside a word only when it is wider than the line', () => {
  assert.deepEqual(wrap(m, 'Rest days never break it', 60), ['Rest days', 'never break', 'it']);
  const zh = wrap(m, '杠铃卧推刷新了个人最佳', 25, 'zh');
  assert.ok(zh.length >= 3 && zh.every(l => m(l) <= 25) && zh.join('') === '杠铃卧推刷新了个人最佳', JSON.stringify(zh));
  assert.deepEqual(wrap(m, 'Supercalifragilistic', 50), ['Supercalif', 'ragilistic']);
  assert.deepEqual(wrap(m, '  spaced   out  ', 1000), ['spaced out']);
});

test('fitLines shrinks first, then wraps; at the minimum it never cuts', () => {
  // A 3-digit streak: 380 px digits are too wide beside the grid, 300 px fit.
  assert.equal(fitLines(m, '100', 936 - 56 - 450, 380, 300).size, 286 <= 300 ? 300 : 300);
  const long = fitLines(m, 'Incline dumbbell bench press', 936, 180, 110, 2);   // 28 characters: two lines at the minimum
  assert.deepEqual(long, { size: 116, lines: ['Incline dumbbell', 'bench press'] });
  const longer = fitLines(m, 'Incline dumbbell bench press (wide grip)', 936, 180, 110, 2);   // too long even so: 3 lines, cut to 2 with an ellipsis by the caller
  assert.equal(longer.lines.length, 3); assert.deepEqual(clip(s => m(s, 110), longer.lines, 2, 936)[1].slice(-1), '…');
  const ms = fitLines(m, 'Percuma · Tanpa akaun · Guna tanpa internet', 824, 28, 22);
  assert.equal(ms.lines.length, 1); assert.ok(ms.size >= 22);
  const tiny = fitLines(m, 'A very very very long name that cannot fit', 100, 20, 20, 1);
  assert.ok(tiny.lines.length > 1 && tiny.lines.join(' ') === 'A very very very long name that cannot fit', 'all words kept');
  assert.deepEqual(clip(s => m(s), ['one', 'two', 'three'], 2, 1000), ['one', 'two…']);
  assert.ok(latin('Barbell bench press 100 kg × 5') && !latin('杠铃卧推') && !latin('ベンチプレス'));
});

// ---- what a picture says -----------------------------------------------------------------------------------------
test('streak: number, best only when higher, perfect weeks only when any, a 28-day grid, the link first in the caption', () => {
  const days = new Set(['2026-10-02', '2026-10-01', '2026-09-29']);
  const d = streakData('2026-10-02', { streak: 21, best: 24, perfectWeeks: 3 }, days);
  assert.equal(d.grid.length, 28); assert.equal(d.grid[27], true); assert.equal(d.grid[26], true); assert.equal(d.grid[25], false);
  const say = sayStreak(d);
  assert.equal(say.number, '21'); assert.equal(say.word, 'day streak'); assert.equal(say.mark, 'flame');
  assert.deepEqual(say.sub.map(ph => ph.map(r => r.t).join('')), ['Rest days never break it', 'Best: 24', '3 perfect weeks']);
  assert.ok(say.sub[1][1].b, 'the best is bold');
  assert.equal(caption(say, false), `${LINK}\n21 days in a row 🔥 Rest days don't break it. Free app, no account.`);
  const fresh = sayStreak(streakData('2026-10-02', { streak: 5, best: 5, perfectWeeks: 0 }, days));
  assert.deepEqual(fresh.sub.map(ph => ph.map(r => r.t).join('')), ['Rest days never break it', 'Best streak yet'], 'the sharer speaks, not the app ("your")');
});

test('workout: first workout, no bests, lb units, bodyweight-only, names off, many lifts beaten', () => {
  const base = { name: 'Push day', date: '2026-10-02', done: 18, tot: 20, reps: 140, vol: 4250, anyKg: true, mins: 52, xp: 180, prs: [], beat: [], first: false };
  const o = { name: true, names: true, vol: false };
  let s = sayWorkout({ ...base, first: true, done: 12 }, o);
  assert.deepEqual(s.chips, ['First workout logged']); assert.equal(s.big, 'Push day');
  assert.equal(s.caption, '12 sets done today 💪 Free app, no account, works offline.');
  assert.deepEqual(s.stats.map(x => [x.v, x.label]), [['12', 'sets'], ['52', 'minutes'], ['+180', 'XP']]);
  // No lifts beaten and no bests: no chip row, the stats carry it. The caption always describes this picture (sets),
  // even when the workout has bests: those belong to the Best lift picture.
  assert.equal(sayWorkout(base, o).chips.length, 0);
  assert.equal(sayWorkout({ ...base, prs: [{}, {}] }, o).caption, '18 sets done today 💪 Free app, no account, works offline.');
  // Weight lifted only when switched on; in lb when the app is in lb; reps for a bodyweight-only workout.
  s = sayWorkout(base, { ...o, vol: true }); assert.deepEqual(s.stats.at(-1), { v: '4,250', label: 'kg lifted', short: 'kg' });
  setUnits('lb'); s = sayWorkout(base, { ...o, vol: true }); assert.deepEqual(s.stats.at(-1), { v: '9,370', label: 'lb lifted', short: 'lb' }); setUnits('kg');
  s = sayWorkout({ ...base, anyKg: false, vol: 0 }, { ...o, vol: true }); assert.deepEqual(s.stats.at(-1), { v: '140', label: 'reps' });
  // Lift names: up to 4, then 3 + "more"; off: a count. Workout name off: the sets count is the hero.
  const beat = ['Barbell bench press', 'Incline dumbbell press', 'Lateral raise', 'Dip', 'Cable fly'];
  s = sayWorkout({ ...base, beat }, o); assert.equal(s.chipLabel, 'Beat last time'); assert.deepEqual(s.chips, ['Barbell bench press', 'Incline dumbbell press', 'Lateral raise', '+2 more']);
  s = sayWorkout({ ...base, beat: beat.slice(0, 3) }, { ...o, names: false }); assert.deepEqual(s.chips, ['Beat last time on 3 lifts']); assert.equal(s.chipLabel, '');
  s = sayWorkout(base, { ...o, name: false }); assert.equal(s.big, undefined); assert.equal(s.number, '18'); assert.equal(s.word, 'sets done'); assert.equal(s.stats[0].label, 'minutes');
  assert.ok(!('mins' in s) && !JSON.stringify(s).includes('%'), 'no "vs last time" percentage on a picture');
  assert.equal(sayWorkout({ ...base, mins: null }, o).stats.length, 2, 'a stale clock leaves the minutes out');
});

test('best lift: plain wording, loads only when asked (cable levels too), stacked names, a count from four', () => {
  const d = { date: '2026-10-02', prs: [{ ex: EX.bench, kind: 'max', v: 116.7, w: 100, r: 5 }] };
  let s = sayBest(d, { load: false });
  assert.equal(s.big, 'Barbell bench press'); assert.equal(s.sub[0][0].t, 'Beat my best'); assert.equal(s.load, '');
  assert.deepEqual(s.chips, ['+40 XP', 'October 2026']);
  s = sayBest(d, { load: true }); assert.equal(s.load, '100 kg × 5');
  s = sayBest({ date: d.date, prs: [{ ex: EX.row, kind: 'heavy', w: 9, r: 10 }] }, { load: true });
  assert.equal(s.load, 'level 9 × 10'); assert.equal(s.sub[0][0].t, 'Heaviest ever');
  s = sayBest({ date: d.date, prs: [d.prs[0], { ex: EX.row, kind: 'heavy', w: 9, r: 10 }] }, { load: false });
  assert.deepEqual(s.lines, ['Barbell bench press', 'Seated cable row']); assert.equal(s.sub[0][0].t, '2 lifts beat their best'); assert.equal(s.chips[0], '+80 XP'); assert.ok(!s.subRows);
  s = sayBest({ date: d.date, prs: [d.prs[0], { ex: EX.row, kind: 'heavy', w: 9, r: 10 }] }, { load: true });
  assert.ok(s.subRows, 'with loads on, one lift per line'); assert.deepEqual(s.sub.map(ph => ph.map(r => r.t).join('')), ['Barbell bench press 100 kg × 5', 'Seated cable row level 9 × 10']);
  s = sayBest({ date: d.date, prs: Array.from({ length: 5 }, (_, i) => ({ ex: { ...EX.bench, name: `Lift ${i}` }, kind: 'max', v: 1, w: 1, r: 1 })) }, { load: false });
  assert.equal(s.number, '5'); assert.equal(s.word, 'new bests'); assert.deepEqual(s.chips, ['Lift 0', 'Lift 1', 'Lift 2', 'Lift 3', '+160 XP', 'October 2026']);
  assert.equal(s.caption, '5 new bests today 💪 Free app, no account, works offline.');
});

test('month: weight on by default, no bests, first month, bodyweight-only, most improved and most sets on request', () => {
  const d = { ym: '2026-09', days: 14, sets: 212, vol: 42300, bests: 3, top: { ex: { name: 'Barbell squat' }, g: 0.083 }, busiest: ['Chest', 61], first: false };
  let s = sayMonth(d, { vol: true, top: false, story: false });
  assert.equal(s.kicker, 'September 2026'); assert.equal(s.number, '14'); assert.equal(s.word, 'days trained');
  assert.deepEqual(s.stats.map(x => [x.v, x.label]), [['212', 'sets'], ['42,300', 'kg lifted'], ['3', 'lifts beat their best']]);
  assert.deepEqual(s.chips, []);
  assert.equal(s.caption, 'September 2026: 14 days trained 💪 Tracked in a free workout app. No account, nothing uploaded.');
  s = sayMonth(d, { vol: true, top: true, story: true }); assert.deepEqual(s.chips, ['Most improved: Barbell squat up 8%', 'Most sets: Chest']);
  s = sayMonth({ ...d, bests: 0, top: null }, { vol: false }); assert.deepEqual(s.stats.map(x => x.label), ['sets']);
  s = sayMonth({ ...d, bests: 1 }, { vol: false }); assert.equal(s.stats.at(-1).label, 'lift beat its best');
  s = sayMonth({ ...d, vol: 0, bests: 0, top: null, first: true }, { vol: true, top: true }); assert.deepEqual(s.stats.map(x => x.label), ['sets']); assert.deepEqual(s.chips, ['First month logged']);
  assert.equal(longMonth('2026-09', 'ms'), 'September 2026');
});

test('level: "Level up" only after a fresh one, fresh muscles as tiles (a count from three), else the top muscle', () => {
  const d = { L: 7, title: 'Strong lifter', total: 12400, fresh: [], top: { muscle: 'Chest', level: 8 } };
  let s = sayLevel(d);
  assert.equal(s.kicker, 'My level'); assert.equal(s.number, '7'); assert.equal(s.word, 'Strong lifter'); assert.ok(s.gradient);
  assert.deepEqual(s.stats.map(x => [x.v, x.label]), [['12,400', 'XP earned'], ['Lv 8', 'Chest']]);
  assert.equal(s.caption, 'Level 7: Strong lifter 😤 Every muscle levels up in this free workout app. No account.');
  s = sayLevel({ ...d, fresh: [{ muscle: 'Chest', level: 8, date: '2026-10-01' }, { muscle: 'Back', level: 6, date: '2026-10-02' }] });
  assert.equal(s.kicker, 'Level up'); assert.deepEqual(s.stats.slice(1).map(x => [x.v, x.label]), [['Lv 8', 'Chest'], ['Lv 6', 'Back']]);
  s = sayLevel({ ...d, fresh: ['Chest', 'Back', 'Quads'].map(muscle => ({ muscle, level: 5, date: '2026-10-02' })) });
  assert.deepEqual(s.stats[1], { v: '3', label: 'muscles levelled up' });
  assert.equal(caption(s, true).split('\n').at(-1), 'Sample data, not my real workouts. Just trying the app.');
});

test('captions in Malay and Japanese keep the link first and fill the numbers', async () => {
  await setLang('ms');
  const ms = caption(sayMonth({ ym: '2026-09', days: 14, sets: 1, vol: 0, bests: 0, top: null, busiest: null, first: false }, { vol: true }), true);
  assert.equal(ms, `${LINK}\nSeptember 2026: 14 hari berlatih 💪 Direkod dalam apl senaman percuma. Tanpa akaun, tiada apa dimuat naik.\nData contoh, bukan latihan sebenar saya. Sekadar mencuba apl.`);
  await setLang('ja');
  const ja = sayStreak(streakData('2026-10-02', { streak: 21, best: 24, perfectWeeks: 0 }, new Set()));
  assert.equal(ja.word, '日連続'); assert.equal(caption(ja, false), `${LINK}\n21日連続でトレーニング 🔥 休息日でも途切れません。無料・登録不要。`);
  assert.equal(longMonth('2026-09', 'ja'), '2026年9月');
  const jm = sayMonth({ ym: '2026-09', days: 22, sets: 1, vol: 0, bests: 0, top: null, busiest: null, first: false }, { vol: true });
  assert.match(jm.caption, /^2026年9月は22日間トレーニングしました 💪/, '"22日間", not "22日" (the 22nd)');
  await setLang('en');
});

// ---- layout in Node: a fake 2D context whose measureText follows the font size (CJK a full em, caps .6, lower case .5) ---
function fakeContext() {
  const g = { font: '16px x', letterSpacing: '0px', fillStyle: '', textAlign: '', textBaseline: '' };
  const px = () => +(g.font.match(/(\d+(?:\.\d+)?)px/)?.[1] || 16);
  g.measureText = s => { const z = px(); return { width: [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e7f ? z : /[A-Z0-9]/.test(ch) ? z * .6 : z * .5), 0), actualBoundingBoxAscent: z * .72, actualBoundingBoxDescent: /[gjpqy（）]/.test(s) ? z * .2 : z * .02 }; };
  return g;
}
const cjkMeasure = s => [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e7f ? 24 : 12), 0);

test('kinsoku: a line never ends with an opening bracket or starts with a closing one', () => {
  const lines = wrap(cjkMeasure, '総挙上量（kg）', 160, 'ja');   // 168 px in all: must break, but not as 総挙上量（ / kg）
  assert.ok(lines.length >= 2 && lines.every(l => !/^[）」。、]/.test(l) && !/[（「]$/.test(l)), JSON.stringify(lines));
  assert.equal(lines.join(''), '総挙上量（kg）');
  const long = wrap(cjkMeasure, '連続記録を更新しました。', 24 * 5, 'ja');   // the 。 hangs on a full line rather than starting one
  assert.ok(long.every(l => !/^。/.test(l)), JSON.stringify(long));
});

test('stacked names share one size; a 13-glyph katakana name sets it for two 4-glyph ones, and is cut only past the minimum', async () => {
  await setLang('ja');
  const g = fakeContext(), say = { kicker: '自己ベスト更新', mark: 'star', lines: ['インクラインダンベルプレス', 'ラットプル', 'ロウ'], sub: [[{ t: '3 種目で自己ベスト更新' }]], chips: ['+120 XP'] };
  const L = layout(g, 'best', say, false);
  const sizes = L.blocks.filter(b => b.kind === 'line').map(b => b.r.size);
  assert.equal(sizes.length, 3); assert.ok(sizes.every(z => z === sizes[0]), `one size: ${sizes}`);
  assert.equal(sizes[0], 72, '13 glyphs × 92 px is wider than 936 px: the stack shrinks to the CJK minimum'); assert.ok(L.blocks.filter(b => b.kind === 'line').every(b => b.r.lines === 1));
  const en = layout(fakeContext(), 'best', { ...say, lines: ['Incline Dumbbell press', 'Chest-supported row', 'Lat pulldown'] }, false).blocks.filter(b => b.kind === 'line').map(b => b.r.size);
  assert.ok(en.every(z => z === en[0] && z >= 80), `Latin stack one size ≥ 80: ${en}`);
  // Story: the stack measures against 936 like chat (not the 900 column), so the same 13 glyphs fit at 72; 14 glyphs
  // (1008 at 72) drop the whole stack to 64 (896) rather than cutting; 16 glyphs (1024 at 64) are cut with "…".
  const drawn = (lines, story = true) => {
    const g2 = fakeContext(), out = []; g2.fillText = s => out.push(s);
    const L2 = layout(g2, 'best', { ...say, lines }, story), ls = L2.blocks.filter(b => b.kind === 'line');
    ls.forEach(b => b.draw(0)); return { sizes: ls.map(b => b.r.size), out };
  };
  let st = drawn(['インクラインダンベルプレス', 'ラットプル', 'ロウ']);
  assert.deepEqual(st.sizes, [72, 72, 72], `story 13 glyphs: ${st.sizes}`); assert.ok(!st.out.some(s => s.includes('…')), `no cut: ${st.out}`);
  st = drawn(['ダンベルインクラインプレス機', 'ラットプル', 'ロウ']);   // 14 glyphs
  assert.deepEqual(st.sizes, [64, 64, 64], `story 14 glyphs: ${st.sizes}`); assert.ok(!st.out.some(s => s.includes('…')), `no cut: ${st.out}`);
  st = drawn(['インクラインダンベルベンチプレス', 'ラットプル', 'ロウ']);   // 16 glyphs
  assert.deepEqual(st.sizes, [64, 64, 64]); assert.ok(st.out[0].endsWith('…') && st.out.length === 3, `16 glyphs cut: ${st.out}`);
  assert.deepEqual(drawn(['Incline Dumbbell press', 'Chest-supported row', 'Lat pulldown']).sizes.every(z => z >= 80), true, 'Latin floor stays 80 on story');
  await setLang('en');
});

test('sub rows: one lift per line, 34 px shrinking to 28, never wrapped; four tiles fall back to the short unit label', () => {
  const g = fakeContext();
  const sub = [[{ t: 'Incline Dumbbell press ' }, { t: '35 kg ea × 10', b: true }], [{ t: 'Chest-supported row ' }, { t: '57.5 kg × 12', b: true }], [{ t: 'Lat pulldown ' }, { t: '60 kg × 8', b: true }]];
  const L = layout(g, 'best', { lines: ['A', 'B', 'C'], sub, subRows: true, chips: ['+120 XP'] }, false);
  const r = L.blocks.find(b => b.kind === 'sub').r;
  assert.equal(r.rows.length, 3); assert.ok(r.rows.every(row => row.length === 1 && !row[0].dotBefore)); assert.equal(r.size, 34);
  const wide = [[{ t: 'A very very very very very very very very long machine name ' }, { t: '35 kg ea × 10', b: true }]];
  const W = layout(g, 'best', { lines: ['A'], sub: wide, subRows: true }, false).blocks.find(b => b.kind === 'sub').r;
  assert.equal(W.size, 28); assert.ok(W.rows[0][0].ph[0].t.endsWith('… '), 'the name is cut, the set is kept whole'); assert.ok(W.rows[0][0].w <= 936);
  // Stats: "総挙上量（kg）" needs two lines in a 216 px tile even at 24 px, so the label becomes the unit.
  const st = [{ v: '20', label: 'セット' }, { v: '53', label: '分' }, { v: '+315', label: 'XP' }, { v: '6,538', label: '総挙上量（kg）', short: 'kg' }];
  assert.equal(layout(g, 'workout', { big: '上半身', stats: st }, false).blocks.find(b => b.kind === 'stats').r.rows[3].label, 'kg');
  assert.equal(layout(g, 'workout', { big: '上半身', stats: st.slice(1) }, false).blocks.find(b => b.kind === 'stats').r.rows[2].label, '総挙上量（kg）', 'three tiles have the room');
});

test('bounds guard: the content ends ≤ 880 (chat) / ≤ 1250 (story) for every picture in its longest language', async () => {
  const g = fakeContext();
  const kick = (L, story) => { const i = L.blocks.findIndex(b => b.kind === 'kicker'); return i < 0 ? null : L.gaps[i + 1] + L.blocks[i].r.desc + (L.blocks[i + 1].r.cap || 0); };
  for (const lang of ['ms', 'ja']) {
    await setLang(lang);
    const prs = [{ ex: { name: 'Incline dumbbell press', unit: 'kg' }, kind: 'max', w: 35, r: 10 }, { ex: { name: 'Chest-supported row', unit: 'kg' }, kind: 'max', w: 57.5, r: 12 }, { ex: { name: 'Lat pulldown', unit: 'kg' }, kind: 'heavy', w: 60, r: 8 }];
    const says = {
      streak: sayStreak(streakData('2026-10-02', { streak: 138, best: 138, perfectWeeks: 16 }, new Set(['2026-10-01']))),
      workout: sayWorkout({ name: 'Upper body', date: '2026-10-02', done: 20, tot: 20, reps: 180, vol: 6538, anyKg: true, mins: 53, xp: 315, prs, beat: ['Incline dumbbell press', 'Chest-supported row', 'Lat pulldown', 'Dip', 'Cable fly'], first: false }, { name: true, names: true, vol: true }),
      best: sayBest({ date: '2026-10-02', prs }, { load: true }),
      month: story => sayMonth({ ym: '2026-09', days: 22, sets: 371, vol: 159085, bests: 26, top: { ex: { name: 'Barbell squat' }, g: .083 }, busiest: ['Chest', 61], first: true }, { vol: true, top: true, story }),
      level: sayLevel({ L: 10, title: 'Beast lifter', total: 21050, fresh: ['Chest', 'Back', 'Quads'].map(muscle => ({ muscle, level: 5, date: '2026-10-02' })), top: null }),
    };
    for (const [kind, s0] of Object.entries(says)) for (const story of [false, true]) {
      const say = typeof s0 === 'function' ? s0(story) : s0, L = fitLayout(g, kind, say, story);
      assert.ok(L.top + L.total <= L.limit, `${kind} ${story ? 'story' : 'chat'} ${lang}: ends at ${L.top + L.total} > ${L.limit}`);
      // kicker baseline → hero cap top is 40 / 48, except when the chat grid beside a short number pushes the number lower
      if (say.kicker) { const k = Math.round(kick(L, story)), want = story ? 48 : 40; assert.ok(L.blocks[1].r.cap ? k >= want : k === want, `${kind} ${story ? 'story' : 'chat'}: kicker → cap ${k}, want ${want}`); }
    }
    // The Designer's case: a streak story whose sub line runs to three lines still ends above 1250, with the grid label kept.
    const sub = [[{ t: 'Hari rehat tidak memutuskannya' }], [{ t: 'Kiraan berturut-turut terbaik anda setakat ini' }], [{ t: '6 minggu sempurna' }]];
    const L = fitLayout(g, 'streak', { ...says.streak, sub }, true);
    assert.equal(L.blocks.find(b => b.kind === 'sub').r.rows.length, 3);
    assert.ok(L.top + L.total <= 1250, `ends at ${L.top + L.total}`); assert.ok(L.blocks.find(b => b.kind === 'number').r.o2.size < 520, 'the number shrank first');
    assert.ok(L.blocks.find(b => b.kind === 'grid').h > 4 * 54 + 3 * 12, 'the grid label survived');
  }
  await setLang('en');
});

// ---- the two truth fixes ----------------------------------------------------------------------------------------
test('badges: a sample session never earns the level-5 muscle badge (seed sessions are left out like everywhere else)', () => {
  S.program = { days: [] }; S.settings = {}; S.exById = { bench: EX.bench };
  const big = { exId: 'bench', sets: sets(60, 8, xpForLevel(5) / 10) };   // 100 working sets: 1,000 XP for Chest, level 5
  S.sessions = [sess('seed1', '2026-09-20', [big], { seed: true })];
  assert.equal(badges('2026-10-02').find(b => b.id === 'lv5').date, null, 'sample data earned a badge');
  S.sessions = [sess('real1', '2026-09-20', [big])];
  assert.equal(badges('2026-10-02').find(b => b.id === 'lv5').date, '2026-09-20');
  S.sessions = [];
});

test('recap: "most improved" never comes from a levels or bodyweight lift, and bests compare within the given history', () => {
  const aug = sess('a', '2026-08-20', [{ exId: 'bench', sets: sets(60, 8) }, { exId: 'row', sets: sets(5, 10) }, { exId: 'pullup', sets: sets(0, 8) }]);
  const sep = sess('s', '2026-09-20', [{ exId: 'bench', sets: sets(65, 8) }, { exId: 'row', sets: sets(6, 10) }, { exId: 'pullup', sets: sets(2.5, 8) }]);
  const r = recapStats('2026-09', [sep], [aug, sep], EX);
  assert.equal(r.bests, 3, 'every lift beat its best');
  assert.equal(r.top.ex.id, 'bench', 'the percentage comes from the estimated max, not from the +2.5 kg added to a pull-up (score 15 → 2515)');
  assert.equal(Math.round(r.top.g * 100), 8);
  assert.equal(recapStats('2026-09', [sep], [{ ...aug, exId: 'x', entries: [aug.entries[1], aug.entries[2]] }, sep], EX).top, null, 'levels and bodyweight only: no percentage');
  // A real September against a sample August: with the real history alone there is nothing to beat, and it's the first month.
  const only = recapStats('2026-09', [sep], [sep], EX);
  assert.equal(only.bests, 0); assert.equal(only.top, null); assert.equal(only.first, true);
  assert.deepEqual([r.days, r.sets, r.vol, r.busiest], [1, 9, 65 * 8 * 3, ['Back', 6]]);   // the row and the pull-up both lead with Back
  assert.equal(recapStats('2026-09', [], [aug], EX), null);
});

test('summaryStats: bests as data, lifts beaten, first workout, partial workout has no percentage', () => {
  const prev = sess('p', '2026-09-25', [{ exId: 'bench', sets: sets(60, 8) }, { exId: 'row', sets: sets(5, 10) }]);
  const d = { id: 'd', date: '2026-10-02', name: 'Push day', start: Date.now() - 50 * 60000, entries: [{ exId: 'bench', sets: [...sets(60, 8, 2), { w: 70, r: 5, done: true }] }, { exId: 'row', sets: sets(6, 10) }] };
  const s = summaryStats(d, [prev], EX, { now: Date.now() });
  assert.deepEqual(s.prs.map(p => [p.ex.id, p.kind, p.w, p.r]), [['bench', 'max', 70, 5], ['row', 'heavy', 6, 10]]);
  assert.deepEqual(s.beat, ['Barbell bench press', 'Seated cable row']);
  assert.equal(s.done, 6); assert.equal(s.mins, 50); assert.equal(s.first, false); assert.ok(s.xp > 0);
  const first = summaryStats(d, [], EX, { now: Date.now() });
  assert.equal(first.first, true); assert.deepEqual(first.prs, []); assert.deepEqual(first.beat, []); assert.equal(first.pct, null);
  const part = summaryStats({ ...d, entries: [{ exId: 'bench', sets: [{ w: 60, r: 8, done: true }, { w: 60, r: 8 }, { w: 60, r: 8 }] }] }, [prev], EX);
  assert.equal(part.partial, true); assert.equal(part.pct, null);
});
