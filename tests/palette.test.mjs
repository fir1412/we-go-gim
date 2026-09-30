// App colours: every preset, and any "Mine", keeps text and day colours readable on its own surfaces.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTES, TOKENS, okMine, paletteFor, themeVars, contrast } from '../js/palette.js';

const MINES = [
  { dark: ['#808080', '#FF00FF'], light: ['#808080', '#00FFFF'] },   // mid grey and neon: the worst anyone could pick
  { dark: ['#FFFFFF', '#FFFFFF'], light: ['#000000', '#000000'] },   // the wrong way round
  { dark: ['#101820', '#1A2430'], light: ['#FAF7F0', '#FFFFFF'] },
];

test('every palette keeps text at 7:1 / 4.5:1 and day colours at 3:1 on background, cards and raised', () => {
  const all = [...Object.keys(PALETTES).map(k => [k, paletteFor({ appPalette: k })]), ...MINES.map((m, i) => [`mine ${i}`, paletteFor({ appPalette: 'mine', myPalette: m })])];
  for (const [name, p] of all) for (const mode of ['dark', 'light']) {
    const v = themeVars(mode, p[mode]), surfaces = p[mode];
    for (const s of surfaces) {
      assert.ok(contrast(v.ink, s) >= 7, `${name} ${mode} ink on ${s}`);
      for (const k of ['mute', 'faint']) assert.ok(contrast(v[k], s) >= 4.5, `${name} ${mode} ${k} on ${s}`);
      for (const k of Object.keys(TOKENS[mode])) assert.ok(contrast(v[k], s) >= 3, `${name} ${mode} ${k} ${v[k]} on ${s}`);
    }
  }
});

test('presets keep the day colours as designed (they only shift when a surface needs it)', () => {
  for (const k of Object.keys(PALETTES)) for (const mode of ['dark', 'light']) {
    const v = themeVars(mode, PALETTES[k][mode]);
    for (const [t, c] of Object.entries(TOKENS[mode])) if (t !== 'rest') assert.equal(v[t], c, `${k} ${mode} ${t}`);
  }
});

test('"Mine" must be two #RRGGBB colours per theme, or the default is used', () => {
  assert.equal(okMine(MINES[2]), true);
  for (const bad of [null, {}, { dark: ['#000000'], light: ['#FFFFFF', '#FFFFFF'] }, { dark: ['#000000', 'red'], light: ['#FFFFFF', '#FFFFFF'] }, { dark: ['#000000', '#000000;}body{'], light: ['#FFFFFF', '#FFFFFF'] }]) {
    assert.equal(okMine(bad), false, JSON.stringify(bad));
    assert.equal(paletteFor({ appPalette: 'mine', myPalette: bad }), PALETTES.default);
  }
  assert.equal(paletteFor({ appPalette: 'constructor' }), PALETTES.default);
});

test("the default palette and the token copy match css/app.css", () => {
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  const [dark] = css.match(/:root \{[^}]*\}/), light = css.match(/:root\[data-theme="light"\] \{[^}]*\}/)[0];
  const val = (block, k) => block.match(new RegExp(`--${k}: (#[0-9A-F]{6})`, 'i'))?.[1].toUpperCase();
  assert.deepEqual(['bg', 'panel', 'card'].map(k => val(dark, k)), PALETTES.default.dark);
  assert.deepEqual(['bg', 'panel', 'card'].map(k => val(light, k)), PALETTES.default.light);
  // The day colours are set more than once (later rules win): the last value in the file for each theme's rule.
  const last = (sel, k) => [...css.matchAll(new RegExp(`${sel} \\{[^}]*--${k}: (#[0-9A-F]{6})`, 'gi'))].at(-1)?.[1].toUpperCase();
  for (const k of Object.keys(TOKENS.light)) assert.equal(last(':root\\[data-theme="light"\\]', k), TOKENS.light[k], `light ${k}`);
  for (const k of Object.keys(TOKENS.dark)) assert.equal(last(':root', k) ?? val(dark, k), TOKENS.dark[k], `dark ${k}`);
});

test('a restored backup keeps only a real palette and "#RRGGBB" colours', async () => {
  globalThis.location ??= { search: '' };
  const { sanitizeBackup } = await import('../js/state.js');
  const s = x => sanitizeBackup({ app: 'setlist', sessions: [], settings: x }).settings;
  assert.equal(s({ appPalette: 'forest' }).appPalette, 'forest');
  assert.equal('appPalette' in s({ appPalette: '__proto__' }), false);
  assert.deepEqual(s({ appPalette: 'mine', myPalette: MINES[2] }).myPalette, MINES[2]);
  assert.equal('myPalette' in s({ myPalette: { dark: ['#000000', 'red;}*{display:none'], light: ['#FFFFFF', '#FFFFFF'] } }), false);
  // A picked colour that already suits its theme is kept as picked.
  assert.equal(paletteFor({ appPalette: 'mine', myPalette: MINES[2] }).dark[0], '#101820');
});
