// Malay and Chinese: every piece of text on screen (after the plain-English pass) is looked up in the chosen
// language's dictionary. Numbers and names inside a sentence become placeholders first, so
// "Add a set to Flat Dumbbell bench press" and "Add a set to Leg press" share one entry, "Add a set to {0}".
// Library exercise names, muscles and the built-in day names are translated too; anything the user typed stays
// as typed. Text with no dictionary entry is left in English rather than guessed.
import { EXERCISES, PROGRAM, TEMPLATES } from './seed.js';
import { plainText } from './plain.js';

export const LANGS = [['en', 'English'], ['ms', 'Bahasa Melayu'], ['zh', '中文'], ['ja', '日本語']];
let dict = null, lang = 'en', nameRe = null;

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MUSCLE_NAMES = ['Chest', 'Back', 'Calves', 'Forearms', 'Neck', 'Quads', 'Hamstrings', 'Glutes', 'Triceps', 'Biceps', 'Abs', 'Front delts', 'Side delts', 'Rear delts'];

/** Every name the dictionaries can translate on its own: library exercises, muscles, built-in day names. */
export function knownNames() {
  const days = [...PROGRAM.days, ...TEMPLATES.flatMap(t => t.program.days)].flatMap(d => [d.name]);
  const all = [...EXERCISES.map(e => e.name), ...MUSCLE_NAMES, ...days].map(plainText);
  return [...new Set(all.filter(n => n && n.length > 1))].sort((a, b) => b.length - a.length);
}

/** "Add a set to Flat Dumbbell bench press (3)" → { key: 'Add a set to {0} ({1})', vals: [['name', …], ['num', '3']] }. */
export function tokenize(s) {
  // Dates and month names (already in the chosen language) are kept as they are, like numbers.
  // A whole date is one placeholder in every language: "Mon 21 Sep 2026", "Sep 2026", "9月21日 周一", "2026年9月".
  const MON = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mac|Mei|Ogo|Okt|Dis)';
  const WD = '(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat|Ahd|Isn|Sel|Rab|Kha|Jum|Sab)';
  const CJK = String.raw`(?:\s?[(（]?[日月火水木金土一二三四五六周星期]+[)）]?)?`;
  const DATES = String.raw`\d{4}年\d{1,2}月(?:\d{1,2}日)?${CJK}|\d{1,2}月\d{1,2}日${CJK}|\d{1,2}月|\b(?:${WD} )?\d{1,2} ${MON}\b(?: \d{4})?|\b${MON} \d{4}\b|\b${MON}\b`;
  if (!nameRe) nameRe = new RegExp(`(?<![\\p{L}\\d])(${knownNames().map(escRe).join('|')})(?![\\p{L}\\d])|(${DATES}|\\d+(?:[.,:]\\d+)*)`, 'gu');
  const vals = [];
  const key = s.replace(nameRe, (m, name, n) => { vals.push(name ? ['name', name] : ['num', n]); return `{${vals.length - 1}}`; });
  return { key, vals };
}

const lookup = k => (dict && Object.prototype.hasOwnProperty.call(dict.s, k) ? dict.s[k] : null);
const nameIn = v => dict?.names[v] ?? v;
const fill = (tpl, vals) => tpl.replace(/\{(\d+)\}/g, (m, i) => { const v = vals[+i]; return v ? (v[0] === 'name' ? nameIn(v[1]) : v[1]) : m; });

/** "{0}: {1}, {2}, {3} reps" → "{0}: {1} reps" with the numbers joined, so one entry covers any number of sets. */
export function collapse(key, vals) {
  const sep = lang === 'zh' || lang === 'ja' ? '、' : ', ';
  const out = [];
  const k = key.replace(/\{(\d+)\}(?:, \{(\d+)\})*/g, (m) => {
    const ids = [...m.matchAll(/\{(\d+)\}/g)].map(x => +x[1]);
    const nums = ids.every(i => vals[i][0] === 'num');
    if (ids.length > 1 && nums) { out.push(['num', ids.map(i => vals[i][1]).join(sep)]); return `{${out.length - 1}}`; }
    return ids.map(i => { out.push(vals[i]); return `{${out.length - 1}}`; }).join(', ');
  });
  return { key: k, vals: out };
}

function one(core) {
  const exact = lookup(core);
  if (exact != null) return exact;
  if (dict.names[core]) return dict.names[core];
  const { key, vals } = tokenize(core);
  const t = lookup(key);
  if (t != null) return fill(t, vals);
  const c = collapse(key, vals);
  const tc = c.key === key ? null : lookup(c.key);
  return tc == null ? null : fill(tc, c.vals);
}

function parts(core, re, joiner) {
  const ps = core.split(re);
  if (ps.length < 2) return null;
  const tr = ps.map(p => one(p) ?? (/[A-Za-z]/.test(p) ? null : p));
  return tr.every(x => x != null) ? tr.join(joiner) : null;
}

/** One piece of on-screen text in the current language (unchanged in English or when there's no entry). */
export function translate(s, ctx = null) {
  if (!dict || !s || !/[A-Za-z]/.test(s)) return s;
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = m[2].replace(/\s+/g, ' ');
  // A word with two meanings ("Back" the button, "Back" the muscle) has its own entry per context: "nav:Back".
  let t = (ctx && lookup(`${ctx}:${core}`)) ?? one(core);
  // Several sentences, or several pieces joined by " · ", in one piece of text: translate each on its own.
  if (t == null) t = parts(core, /(?<=[.!?])\s+/, lang === 'zh' || lang === 'ja' ? '' : ' ');
  if (t == null) t = parts(core, / · /, ' · ');
  return t == null ? s : m[1] + t + m[3];
}

/** Load a language ('en' clears it). Returns once the dictionary is ready. */
export async function setLang(want) {
  lang = LANGS.some(([k]) => k === want) ? want : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
  if (lang === 'en') { dict = null; return; }
  const mod = await import(`./i18n/${lang}.js`);
  dict = mod.default;
}
export const getLang = () => lang;
