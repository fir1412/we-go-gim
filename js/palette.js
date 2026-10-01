// App colours: preset palettes and your own ("Mine"). A palette sets the surfaces (background, cards) for the dark and
// the light theme; text, lines and the day colours are then worked out to stay readable on them. Adapted from Tally.

// ---- colour maths (pure) -------------------------------------------------------------------------------------------
const HEX = /^#[0-9a-f]{6}$/i;
const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = a => `#${a.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
/** WCAG relative luminance and contrast ratio. */
export const luminance = hex => { const [r, g, b] = rgb(hex).map(v => (v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
export const mix = (a, b, k) => { const B = rgb(b); return toHex(rgb(a).map((v, i) => v + (B[i] - v) * k)); };
/** The nearest shade of `hex` that reads at `min`:1 on every surface: lighter on a dark palette, darker on a light one. */
export function readable(hex, surfaces, min = 4.5) {
  const toward = luminance(surfaces[0]) < 0.2 ? '#FFFFFF' : '#000000';
  for (let k = 0; k <= 20; k++) { const c = mix(hex, toward, k / 20); if (surfaces.every(s => contrast(c, s) >= min)) return c; }
  return toward;
}

// ---- palettes --------------------------------------------------------------------------------------------------------
/** Surfaces per theme: [background, cards, raised]. "Default" is css/app.css's own tokens. */
export const PALETTES = {
  default: { name: 'Default', dark: ['#0F1117', '#161922', '#1C202B'], light: ['#F2F3F8', '#FFFFFF', '#F7F8FB'] },
  graphite: { name: 'Graphite', dark: ['#111111', '#1A1A1A', '#222222'], light: ['#F4F4F5', '#FFFFFF', '#F9F9FA'] },
  midnight: { name: 'Midnight', dark: ['#0B1220', '#111A2E', '#17223A'], light: ['#EEF2FA', '#FFFFFF', '#F6F8FC'] },
  forest: { name: 'Forest', dark: ['#0C1611', '#12201A', '#182A22'], light: ['#EEF6F1', '#FFFFFF', '#F5FAF7'] },
  ember: { name: 'Ember', dark: ['#16110E', '#1F1814', '#281F1A'], light: ['#F8F2EC', '#FFFFFF', '#FBF7F3'] },
  grape: { name: 'Grape', dark: ['#130F1A', '#1B1525', '#231C30'], light: ['#F4F0FA', '#FFFFFF', '#F9F6FC'] },
};
/** Your own ("Mine"): {dark: [background, cards], light: [background, cards]}, every one "#RRGGBB". */
export const okMine = p => !!p && typeof p === 'object' && ['dark', 'light'].every(m => Array.isArray(p[m]) && p[m].length === 2 && p[m].every(h => HEX.test(h)));
/** A colour as a surface of this theme: dark enough for the dark theme (luminance ≤ .03, like its own cards), light
 *  enough for the light one (≥ .78). A mid grey can't hold readable text in either, so it's moved to fit. */
export function fitSurface(hex, mode) {
  const dark = mode === 'dark';
  for (let k = 0; k <= 20; k++) { const c = mix(hex, dark ? '#000000' : '#FFFFFF', k / 20); if (dark ? luminance(c) <= 0.03 : luminance(c) >= 0.78) return c; }
  return dark ? '#000000' : '#FFFFFF';
}
/** Background and cards → the three surfaces: the raised one a step from the cards (lighter on dark, darker on light). */
export const surfacesFrom = (mode, bg, card) => { const [b, c] = [bg, card].map(h => fitSurface(h, mode)); return [b, c, mix(c, mode === 'dark' ? '#FFFFFF' : '#000000', 0.06)]; };
/** The surfaces the settings pick, per theme. A broken "Mine" falls back to the default. */
export function paletteFor(s) {
  if (s?.appPalette === 'mine' && okMine(s.myPalette)) return { dark: surfacesFrom('dark', ...s.myPalette.dark), light: surfacesFrom('light', ...s.myPalette.light) };
  return PALETTES[Object.hasOwn(PALETTES, s?.appPalette) ? s.appPalette : 'default'];
}

// Text and the day/status colours, as css/app.css sets them per theme. Only palettes other than the default use this
// copy (the default is the stylesheet itself). ponytail: a copy, keep it in step with css/app.css when those change.
const TEXT = {
  dark: { ink: '#EEF0F7', mute: '#8D94A9', faint: '#8A91A6' },
  light: { ink: '#141722', mute: '#5A6177', faint: '#666D82' },
};
export const TOKENS = {
  dark: { push: '#FF8A3D', pull: '#22C7B8', legs: '#9B8CFF', upper: '#4DA8FF', legsb: '#FF5FA2', arms: '#F5C542', rest: '#858CA1', up: '#3DDC84', flat: '#FFC145', down: '#FF5A6E' },
  light: { push: '#C2540F', pull: '#08776E', legs: '#5B4AD6', upper: '#1A68B3', legsb: '#B8285F', arms: '#876500', rest: '#6B7186', up: '#0F7A42', flat: '#8A6100', down: '#C0283F' },
};
/** The CSS variables for one theme on these surfaces: body text 7:1, secondary text 4.5:1, day colours 3:1. */
export function themeVars(mode, s) {
  const t = TEXT[mode], dark = mode === 'dark';
  const v = { page: mix(s[0], '#000000', dark ? 0.3 : 0.06), bg: s[0], panel: s[1], card: s[2], line: mix(s[2], dark ? '#FFFFFF' : '#000000', dark ? 0.08 : 0.1),
    ink: readable(t.ink, s, 7), mute: readable(t.mute, s), faint: readable(t.faint, s) };
  for (const [k, c] of Object.entries(TOKENS[mode])) v[k] = readable(c, s, 3);
  return v;
}
const block = (mode, s) => Object.entries(themeVars(mode, s)).map(([k, c]) => `--${k}:${c};`).join('');
/** The stylesheet for a palette, in the same shape as css/app.css's theme rules (forced theme, or the system's).
 *  html:root outranks css/app.css's :root rules wherever the tag sits (js/first.js puts it above the stylesheet). */
export const paletteCss = p => `html:root{${block('dark', p.dark)}}html:root[data-theme="light"]{${block('light', p.light)}}@media (prefers-color-scheme: light){html:root:not([data-theme="dark"]){${block('light', p.light)}}}`;

// ---- applying --------------------------------------------------------------------------------------------------------
const SAVED = 'wgg-palette';   // the last stylesheet, which js/first.js puts on the page before anything is drawn
function styleTag(css) {
  let st = document.getElementById('palette-css');
  if (!css) return st?.remove();
  if (!st) { st = document.createElement('style'); st.id = 'palette-css'; document.head.append(st); }
  if (st.textContent !== css) st.textContent = css;
}
/** Put the settings' palette on the page (the default needs no stylesheet). */
export function applyPalette(s) {
  const css = s?.appPalette && s.appPalette !== 'default' ? paletteCss(paletteFor(s)) : '';
  styleTag(css);
  try { if (css) localStorage.setItem(SAVED, css); else localStorage.removeItem(SAVED); } catch { /* private window: the database copy still applies */ }
}
