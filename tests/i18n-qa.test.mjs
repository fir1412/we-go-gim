// Languages QA (agent 4): help tips, the coach's "why" texts, screen-reader labels, toasts and the plain-English rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLang, translate, setUserNames, setRawNames } from '../js/i18n.js';
import { plainText, isRawText } from '../js/plain.js';

const LANGS = ['ms', 'zh', 'zh-Hant', 'ja'];
const tr = s => translate(plainText(s));
// (the sample dates below are English; on screen they are already in the app's language)
const hasLatin = s => /[A-Za-z]{3}/.test(s.replace(/\d+ Sep\b/g, '').replace(/\b(kg|lb|RIR|XP|we go gim|three\.js|MIT|Z-Anatomy|BodyParts|The Database Center for Life Science|FitMitWith|CC BY-SA|anatomy\/ATTRIBUTION\.txt|PDF)\b/g, ''));

// The TIPS table in js/ui.js (ui.js needs a browser, so it is read as text).
function tips() {
  const src = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('const TIPS = {'), src.indexOf('};', src.indexOf('const TIPS = {')));
  return [...body.matchAll(/^\s*(\w+): '((?:\\'|[^'])*)',?$/gm)].map(m => [m[1], m[2].replace(/\\'/g, "'")]);
}

test('every help tip ("?") is translated in every language', async () => {
  const list = tips();
  assert.ok(list.length >= 10);
  for (const L of LANGS) {
    await setLang(L);
    for (const [k, v] of list) {
      const out = tr(v);
      assert.notEqual(out, plainText(v), `${L} tip ${k} untranslated`);
      if (L !== 'ms') assert.ok(!hasLatin(out), `${L} tip ${k}: ${out}`);
    }
  }
  await setLang('en');
});

// Every "why this target" sentence js/engine.js suggest() can produce, with the line the workout adds after it.
const WHY = [
  'Every set reached 8 last time. Add 2.5 kg per dumbbell and let reps drop back toward 6. Aim for 1-3 reps left on each set.',
  'Every set reached 12 last time. Add 5 kg and let reps drop back toward 8. Aim for 1-3 reps left on each set.',
  'Every set reached 12 last time. Add 1 level and let reps drop back toward 8.',
  'Every set reached 12. Add 2.5 kg with a belt (or slow the tempo); reps drop back toward 8.',
  "Every set reached 12, but there's no heavier dumbbell in your equipment list. Add a set, slow the lowering to 3 seconds, or switch to a harder variation.",
  'No comparable log for this exercise at this gym. Find a load for about 10 reps with 2 left in the tank. That becomes your baseline. Aim for 2 reps left on each set.',
  'Old entries for this lift mix per-side and total load. Pick one unit in the exercise settings so progress means something.',
  'Last log has reps but no load. Log every set today to unlock suggestions.',
  'Last log has the load (25) but no reps. Log every set today to unlock suggestions.',
  'Deload week: about half the sets at roughly 85–90% of normal load, 3–4 reps in reserve. No strength testing. Aim for 3-4 reps left on each set.',
  'Low readiness today. Repeat last load and reps and stop 2–3 reps short of failure.',
  'You flagged pain on this lift last time (21 Sep). Hold the load and stop if it returns.',
  'Last time the final set went to failure (0 reps left) and reps fell short of 8–12. Same load; aim to get every set into the range with a rep or two to spare.',
  'No gain in load or clean reps for 3 comparable sessions. Check sleep, effort and exercise order; if it stays flat, a deload or a variation swap is reasonable.',
  'Two sessions without beating your best on this lift. One more flat session confirms a plateau. Log RIR on every set.',
  'Last time 8·8·6 at 25 kg ea. Keep the load and add a rep per set until all 3 sets reach 12, then add 2.5 kg.',
  'Last time 10·9 at 25 kg. Keep the load and add a rep per set until all 2 sets reach 12, then add 5 kg. Keep a neutral back; stop the set if form breaks.',
];

test('the coach\'s "why" text is translated sentence by sentence, CJK sentences joined without spaces', async () => {
  for (const L of LANGS) {
    await setLang(L);
    for (const w of WHY) {
      const out = tr(w);
      assert.notEqual(out, plainText(w), `${L}: ${w}`);
      if (L !== 'ms') {
        assert.ok(!hasLatin(out.replace(/RIR/g, '')), `${L}: ${out}`);
        assert.ok(!/。 /.test(out), `${L} has a space after 。: ${out}`);
      }
    }
  }
  await setLang('zh');
  assert.equal(tr(WHY[0]), '上次每组都达到 8 次。每只哑铃加 2.5 公斤，次数回落到 6 次左右。每组目标还剩 1-3 次的余力。');
  // A sentence with no entry keeps a space on both sides instead of running into its neighbours.
  assert.equal(translate('No strength testing. Some note of mine. Low readiness today.'), '不做力量测试。 Some note of mine. 今天状态不佳。');
  await setLang('en');
});

test('screen-reader labels on set inputs and the session editor are translated, with the exercise name', async () => {
  await setLang('zh');
  setUserNames(['My curl']);
  assert.equal(translate('Push-up, set 1: added weight in kg'), '俯卧撑，第 1 组：附加重量（公斤）');
  assert.equal(translate('Push-up, set 2: weight in lb'), '俯卧撑，第 2 组：重量（磅）');
  assert.equal(translate('My curl, warm-up set: reps'), 'My curl，热身组：次数');
  assert.equal(translate('Push-up, set 1 done'), '俯卧撑，第 1 组已完成');
  await setLang('ja');
  assert.equal(translate('Push-up, set 1: added weight in kg'), '腕立て伏せ、1 セット目：追加の重さ（kg）'.replace('腕立て伏せ', translate('Push-up')));
  await setLang('en');
});

test('toasts, confirm sheets, import preview and labels have entries', async () => {
  const lines = [
    'Delete Chest on 21 Sep?', 'An undo copy is kept on this phone.',
    'All 345 sessions, weigh-ins, cardio, programme changes and settings are deleted and the app starts over empty.',
    'Saved 77 kg', 'The file is empty.', 'This file is not a we go gim backup.',
    'Backup rejected: session #3 is malformed. Nothing was changed.',
    'Missing columns: date, reps. Expected at least date, exercise and reps (weight if there is one).',
    "Sharing isn't available here, so the file was saved to Downloads", "You're on the latest version (1.8.1)",
    'Imported 3 sessions and 1 new exercise; 1 needs its muscles set under Exercises',
    "That's the limit for today. Thank you for all the feedback!", "You're offline. It'll send automatically when you're back online.",
    'Nothing found.', '1 line before the first date skipped', 'Import 1 session', 'New 2', 'Skip these 2', '2 lifts', '1 of 3 selected', 'muscle not set',
    'Weight jump (kg per dumbbell)', 'Rest between sets (s)', 'Caution note (shown with suggestions)', 'History and records (1 session)', 'Bodyweight (+kg)',
    '1 set', 'set done', '3 skipped', 'in workout', 'Distance (km, optional)', '5 exercises from your programme', '→ Lv13', 'free workout tracker',
    'XP (experience points) earned', 'first log',
  ];
  for (const L of LANGS) {
    await setLang(L);
    for (const s of lines) {
      const p = plainText(s), out = translate(p);
      if (L === 'ms' && /^(\d+ set|→ Lv\d+)$/.test(s)) continue; // same words in Malay
      assert.notEqual(out, p, `${L}: ${s}`);
    }
  }
  await setLang('zh');
  assert.equal(translate('Delete Chest on 9月21日?'), '删除 9月21日 的 胸？'.replace(' 胸', ' ' + translate('Chest')));
  assert.equal(translate('Change colour for 星期一'), '更改星期一的颜色');
  await setLang('en');
});

test('plain English writes out short forms, singular where it should be', () => {
  assert.equal(plainText('+30s'), '+30 seconds');
  assert.equal(plainText('Rest between sets (s)'), 'Rest between sets (seconds)');
  assert.equal(plainText('kg / week (4 wk)'), 'kg / week (4 weeks)');
  assert.equal(plainText('1 set · 1 ex · 40 min'), '1 set · 1 exercise · 40 minutes');
  assert.equal(plainText('12 sets · 3 ex'), '12 sets · 3 exercises');
  for (const s of ['+30s', 'Rest between sets (s)', 'kg / week (4 wk)', '3 ex']) assert.equal(plainText(plainText(s)), plainText(s));
});

test("names the user typed stay as typed; library names don't count", () => {
  setRawNames(['Abs lift up', 'Biceps & triceps', 'Flat Dumbbell bench press', 'Chest']);
  assert.ok(isRawText('Abs lift up'));
  assert.ok(isRawText(' Biceps & triceps '));
  assert.ok(!isRawText('Flat Dumbbell bench press'));
  assert.ok(!isRawText('Chest'));
  setRawNames([]);
  assert.ok(!isRawText('Abs lift up'));
});

test('very long text is left alone quickly', async () => {
  await setLang('zh');
  setUserNames(['x'.repeat(50000), 'Short one']);
  const big = 'Finish workout '.repeat(3000);
  assert.equal(translate(big), big);
  await setLang('en');
});

// Screen text goes through the plain-English pass before the lookup, so a sentence key written with a short form
// ("sessions", "min") never matches and shows in English. Short labels and names are exempt.
test('sentence keys are written the way they appear on screen', async () => {
  for (const L of LANGS) {
    const dict = (await import(`../js/i18n/${L}.js`)).default.s;
    const off = Object.keys(dict).filter(k => k.length > 40 && plainText(k) !== k);
    assert.deepEqual(off, [], `${L}: ${off.join(' | ')}`);
  }
});

// One word per idea in each language (the 2026-10-01 review loop). A word on this list is the one the review
// replaced, so seeing it again means two screens call the same thing by different names.
const RETIRED = {
  ms: [/\b[Dd]umbel\b/, /\b[Bb]arbel\b/, /Hari Ini/, /timbangan/i, /rekod timbang berat/, /\bjadual\b/i, /\blawatan\b/, /rekod berturut-turut/, /\bpustaka\b/, /\b[Ll]onjakan berat|\b[Ll]ompatan berat/],
  zh: [/训练安排/, /示例安排/, /连续记录/, /编造/, /点击添加/, /\d kg|\} kg|\} lb|用 (kg|lb) 显示/],
  'zh-Hant': [/訓練安排/, /範例安排/, /連續記錄/, /編造/, /\} kg|\} lb|用 (kg|lb) 顯示/],
  ja: [/分割メニュー/, /ワークアウト/, /インポート/, /プログラム/, /土台づくり/, /ダンベル1つあたり/, /（\+?ポンド/],
};
test('retired words stay retired, and Insights is not called Progress', async () => {
  for (const [L, words] of Object.entries(RETIRED)) {
    const d = (await import(`../js/i18n/${L}.js`)).default.s;
    for (const re of words) {
      const hit = Object.entries(d).filter(([, v]) => re.test(v)).map(([k, v]) => `${k} -> ${v}`);
      assert.deepEqual(hit, [], `${L} ${re}`);
    }
    assert.notEqual(d.Insights, d.Progress, `${L}: Insights is a tab inside Progress`);
  }
});
