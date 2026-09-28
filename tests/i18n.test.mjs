import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLang, translate, tokenize, knownNames } from '../js/i18n.js';
import ms from '../js/i18n/ms.js';
import zh from '../js/i18n/zh.js';
import ja from '../js/i18n/ja.js';

const ph = s => [...s.matchAll(/\{\d+\}/g)].map(m => m[0]).sort().join();

test('every language has the same entries, and each keeps its placeholders', () => {
  const keys = Object.keys(ms.s).sort();
  for (const d of [zh, ja]) assert.deepEqual(Object.keys(d.s).sort(), keys);
  for (const d of [ms, zh, ja]) {
    for (const [k, v] of Object.entries(d.s)) assert.equal(ph(v), ph(k), `${k} -> ${v}`);
    for (const n of knownNames()) assert.ok(d.names[n], `missing name ${n}`);
  }
});

test('whole phrases, names inside phrases and unknown text', async () => {
  await setLang('zh');
  assert.equal(translate('Finish workout'), '完成训练');
  assert.equal(translate('  Finish workout '), '  完成训练 ');
  const name = knownNames().find(n => zh.names[n] && /press/i.test(n));
  assert.equal(translate(`Options for ${name}`), `${zh.names[name]} 的选项`);
  assert.equal(translate('My own custom thing'), 'My own custom thing');
  await setLang('en');
  assert.equal(translate('Finish workout'), 'Finish workout');
});

test('lists of reps collapse into one entry, whatever the number of sets', async () => {
  await setLang('zh');
  assert.equal(translate('60 kg: 8, 8, 6 reps'), '60 公斤：8、8、6 次');
  assert.equal(translate('60 kg: 8, 8, 6, 5, 5 reps'), '60 公斤：8、8、6、5、5 次');
  await setLang('ms');
  assert.equal(translate('60 kg: 8, 8, 6 reps'), '60 kg: 8, 8, 6 ulangan');
  await setLang('en');
});

test('pieces joined by a middle dot are translated one by one', async () => {
  await setLang('ja');
  assert.equal(translate('4 sets · 3 exercises · tap for details'), '4 セット · 3 種目 · タップで詳細');
  assert.equal(translate('Today · Not medical advice.'), '今日 · 医療アドバイスではありません。');
  await setLang('en');
});

test('dates stay one placeholder and Back up is not read as the Back muscle', async () => {
  assert.equal(tokenize('Saved Mon 21 Sep 2026').key, 'Saved {0}');
  await setLang('ms');
  assert.equal(translate('Back up now'), 'Buat sandaran sekarang');
  await setLang('en');
});
