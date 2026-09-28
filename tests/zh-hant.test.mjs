import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLang, translate, knownNames, pickLang, LANGS, getLang } from '../js/i18n.js';
import zh from '../js/i18n/zh.js';
import hant from '../js/i18n/zh-Hant.js';

const ph = s => [...s.matchAll(/\{\d+\}/g)].map(m => m[0]).sort().join();

test('zh-Hant has the same entries as zh, with placeholders kept and every library name', () => {
  assert.deepEqual(Object.keys(hant.s).sort(), Object.keys(zh.s).sort());
  assert.deepEqual(Object.keys(hant.names).sort(), Object.keys(zh.names).sort());
  for (const [k, v] of Object.entries(hant.s)) assert.equal(ph(v), ph(k), `${k} -> ${v}`);
  for (const n of knownNames()) assert.ok(hant.names[n], `missing name ${n}`);
});

test('no Simplified-only characters are left', () => {
  const simp = [...'这们个设练组动杠铃哑绳后数据时间发现应该还没过进让说对轮计记录'];
  const all = [...Object.values(hant.s), ...Object.values(hant.names)].join('');
  for (const c of simp) assert.ok(!all.includes(c), `Simplified ${c} left in zh-Hant`);
});

test('Taiwan gym words', () => {
  const all = Object.values(hant.names).join(' ');
  for (const w of ['臥推', '啞鈴', '槓鈴', '深蹲', '硬舉', '引體向上', '划船', '滑輪', '腿後肌', '股四頭肌', '伏地挺身']) assert.ok(all.includes(w), w);
  assert.ok(!/硬拉|膕繩肌|俯臥撐|繩索/.test(all));
});

test('translate() in zh-Hant', async () => {
  assert.ok(LANGS.some(([k, l]) => k === 'zh-Hant' && l === '繁體中文'));
  assert.ok(LANGS.some(([k, l]) => k === 'zh' && l === '简体中文'));
  await setLang('zh-Hant');
  assert.equal(getLang(), 'zh-Hant');
  assert.equal(translate('Finish workout'), '完成訓練');
  assert.equal(translate('60 kg: 8, 8, 6 reps'), '60 公斤：8、8、6 次');
  const name = knownNames().find(n => hant.names[n] && /press/i.test(n));
  assert.equal(translate(`Options for ${name}`), `${hant.names[name]} 的選項`);
  assert.equal(translate('Barbell bench press'), '槓鈴臥推');
  assert.equal(translate('My own custom thing'), 'My own custom thing');
  await setLang('en');
});

test('pickLang maps the phone language list', () => {
  assert.equal(pickLang(['zh-TW']), 'zh-Hant');
  assert.equal(pickLang(['zh-HK', 'en']), 'zh-Hant');
  assert.equal(pickLang(['zh-Hant-TW']), 'zh-Hant');
  assert.equal(pickLang(['zh-MO']), 'zh-Hant');
  assert.equal(pickLang(['zh_TW']), 'zh-Hant');
  assert.equal(pickLang(['zh-CN']), 'zh');
  assert.equal(pickLang(['zh-Hans-SG']), 'zh');
  assert.equal(pickLang(['zh']), 'zh');
  assert.equal(pickLang(['fr-FR', 'ms-MY']), 'ms');
  assert.equal(pickLang(['ja-JP']), 'ja');
  assert.equal(pickLang(['de']), 'en');
  assert.equal(pickLang([]), 'en');
  assert.equal(pickLang('zh-TW'), 'zh-Hant');
});
