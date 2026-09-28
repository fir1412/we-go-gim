// Malay and Chinese: every piece of text on screen (after the plain-English pass) is looked up in the chosen
// language's dictionary. Numbers and names inside a sentence become placeholders first, so
// "Add a set to Flat Dumbbell bench press" and "Add a set to Leg press" share one entry, "Add a set to {0}".
// Library exercise names, muscles and the built-in day names are translated too; anything the user typed stays
// as typed. Text with no dictionary entry is left in English rather than guessed.
import { EXERCISES, PROGRAM, TEMPLATES, setSearchLocal } from './seed.js';
import { plainText, setRawTexts } from './plain.js';

export const LANGS = [['en', 'English'], ['ms', 'Bahasa Melayu'], ['zh', '简体中文'], ['zh-Hant', '繁體中文'], ['ja', '日本語']];
// Chinese in either script: sentences join without spaces and lists use 、.
const cjk = () => lang === 'zh' || lang === 'zh-Hant' || lang === 'ja';

/** The app language for the phone's language list: zh-TW / zh-HK / zh-MO / zh-Hant-* → 'zh-Hant', other zh → 'zh', else the first two letters when supported, else 'en'. */
export function pickLang(navigatorLanguages) {
  const list = (Array.isArray(navigatorLanguages) ? navigatorLanguages : [navigatorLanguages]).filter(Boolean).map(String);
  for (const raw of list) {
    const l = raw.toLowerCase().replace(/_/g, '-');
    if (/^zh-(hant|tw|hk|mo)\b/.test(l)) return 'zh-Hant';
    const two = l.slice(0, 2);
    if (LANGS.some(([k]) => k === two)) return two;
  }
  return 'en';
}
let dict = null, lang = 'en', nameRe = null, userNames = [], userKey = '';

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
  const CJK = String.raw`(?:\s?[(（]?[日月火水木金土一二三四五六周週星期]+[)）]?)?`;
  const DATES = String.raw`\d{4}年\d{1,2}月(?:\d{1,2}日)?${CJK}|\d{1,2}月\d{1,2}日${CJK}|\d{1,2}月|\b(?:${WD} )?\d{1,2} ${MON}\b(?: \d{4})?|\b${MON} \d{4}\b|\b${MON}\b|星期[一二三四五六日天]|[週周][一二三四五六日]|[月火水木金土日]曜日|\b(?:Isnin|Selasa|Rabu|Khamis|Jumaat|Sabtu|Ahad)\b`;
  if (!nameRe) nameRe = new RegExp(`(?<![\\p{L}\\d])(${[...new Set([...knownNames(), ...userNames])].sort((a, b) => b.length - a.length).map(escRe).join('|')})(?![\\p{L}\\d])|(${DATES}|\\d+(?:[.,:]\\d+)*)`, 'gu');
  const vals = [];
  const key = s.replace(nameRe, (m, name, n) => { vals.push(name ? ['name', name] : ['num', n]); return `{${vals.length - 1}}`; });
  return { key, vals };
}

const lookup = k => (dict && Object.prototype.hasOwnProperty.call(dict.s, k) ? dict.s[k] : null);
const nameIn = v => dict?.names[v] ?? (dict && lookup(v)) ?? v;
const fill = (tpl, vals) => tpl.replace(/\{(\d+)\}/g, (m, i) => { const v = vals[+i]; return v ? (v[0] === 'name' ? nameIn(v[1]) : v[1]) : m; });

/** "{0}: {1}, {2}, {3} reps" → "{0}: {1} reps" with the numbers joined, so one entry covers any number of sets. */
export function collapse(key, vals) {
  const sep = cjk() ? '、' : ', ';
  const out = [];
  const k = key.replace(/\{(\d+)\}(?:, \{(\d+)\})*/g, (m) => {
    const ids = [...m.matchAll(/\{(\d+)\}/g)].map(x => +x[1]);
    const nums = ids.every(i => vals[i][0] === 'num');
    if (ids.length > 1 && nums) { out.push(['num', ids.map(i => vals[i][1]).join(sep)]); return `{${out.length - 1}}`; }
    return ids.map(i => { out.push(vals[i]); return `{${out.length - 1}}`; }).join(', ');
  });
  return { key: k, vals: out };
}

/**
 * The user's own day and exercise names. They stay as typed, but count as names, so a sentence around them
 * ("Next: Shoulders · tomorrow") still matches its entry. Words that are phrases in the dictionary are left out.
 */
let lastUserList = [], extraNames = [];
export function setUserNames(list) {
  lastUserList = list;
  const clean = [...new Set([...list, ...extraNames].map(n => String(n || '')).filter(n => n.length <= 200).map(n => plainText(n).trim()))].filter(n => n.length > 2);
  const key = clean.join('\u0001');
  if (key !== userKey) { userKey = key; userNames = clean; nameRe = null; }
}

function one(core) {
  const exact = lookup(core);
  if (exact != null) return exact;
  // A label with a closing full stop ("Floor and a chair.") uses the entry without it.
  if (/[^.]\.$/.test(core)) { const t = one(core.slice(0, -1)); if (t != null) return t + (cjk() ? '。' : '.'); }
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
  // Pieces with no entry (a user's own note or exercise name) stay as they are; the rest are translated.
  const tr = ps.map(p => one(p));
  if (!tr.some(x => x != null)) return null;
  // Chinese and Japanese sentences join with nothing between them (each already ends in 。), but a piece left in
  // English keeps its space on both sides, so it never runs into the next sentence.
  return tr.reduce((out, x, i) => out + (i ? (joiner || (x != null && tr[i - 1] != null) ? joiner : ' ') : '') + (x ?? ps[i]), '');
}

/** One piece of on-screen text in the current language (unchanged in English or when there's no entry). */
export function translate(s, ctx = null) {
  // Very long text (a pasted log, a huge typed name) is never a dictionary entry: left as it is, cheaply.
  if (!dict || !s || s.length > 2000 || !/[A-Za-z]/.test(s)) return s;
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const core = m[2].replace(/\s+/g, ' ');
  // A word with two meanings ("Back" the button, "Back" the muscle) has its own entry per context: "nav:Back".
  let t = (ctx && lookup(`${ctx}:${core}`)) ?? one(core);
  // Several sentences, or several pieces joined by " · ", in one piece of text: translate each on its own.
  if (t == null) t = parts(core, /(?<=[.!?])\s+/, cjk() ? '' : ' ');
  if (t == null) t = parts(core, / · /, ' · ');
  return t == null ? s : m[1] + t + m[3];
}

let knownSet = null, rawKey = null;
/**
 * Names the user typed (days, exercises, workouts) that aren't library names: shown exactly as typed, with no
 * plain-English rewrite and no translation ("Abs lift up" stays "Abs lift up"). Library names are still translated.
 */
export function setRawNames(list) {
  if (!knownSet) {
    const days = [...PROGRAM.days, ...TEMPLATES.flatMap(t => t.program.days)].map(d => d.name);
    knownSet = new Set([...EXERCISES.map(e => e.name), ...MUSCLE_NAMES, ...days].flatMap(n => [n, plainText(n)]));
  }
  const raw = [...new Set(list.map(n => String(n ?? '').trim()))].filter(n => n && n.length <= 200 && !knownSet.has(n)).sort();
  const key = raw.join('');
  if (key === rawKey) return;
  rawKey = key;
  setRawTexts(raw);
}
/** The state's own names: day names, exercise names and workout names. Cheap to call on every render. */
export function syncRawNames(S) {
  if (!S) return;
  const sess = [...new Set((S.sessions || []).map(x => x.name))];
  setRawNames([...(S.program?.days || []).map(d => d.name), ...(S.exercises || []).map(x => x.name), ...sess]);
  // Workout names ("Push 1") also count as names inside sentences ("Delete Push 1 on 2 Mar?").
  if (lang !== 'en' && sess.join('') !== extraNames.join('')) { extraNames = sess; setUserNames(lastUserList); }
}

/** Load a language ('en' clears it). Returns once the dictionary is ready. */
export async function setLang(want) {
  lang = LANGS.some(([k]) => k === want) ? want : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;  // 'zh-Hant' stays as it is
  if (lang === 'en') { dict = null; return; }
  const mod = await import(`./i18n/${lang}.js`);
  dict = mod.default;
  // The browser tab and app switcher show the title in the chosen language too.
  if (typeof document !== 'undefined' && document.title) document.title = translate(document.title);
  setSearchLocal(x => [x.name, ...(x.muscles || [])].map(n => translate(plainText(n))).join(' '));
}
export const getLang = () => lang;
