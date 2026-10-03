import { setExercise, loadMeta } from './set-units.js';
// Import / export: CSV, JSON backup, and a forgiving parser for free-text workout logs (pasted or from PDF).
import { MAX_KG, MAX_REPS, cleanText, validIso } from './engine.js';
import { EXERCISES } from './seed.js';
import { plainText } from './plain.js';

// ---- CSV ------------------------------------------------------------------------------
// Weights are always kg (unit says how: per dumbbell, level, added to bodyweight). The session note and heart
// rate come last so older readers of this file still find every column they know.
const CSV_COLS = ['date', 'session', 'exercise', 'unit', 'set', 'warmup', 'weight', 'reps', 'done', 'rir', 'pain', 'gym', 'note', 'session_note', 'hr'];
// Quoted when it holds a delimiter (comma, or semicolon for European Excel), a quote or a line break.
const q = v => { const s = String(v ?? ''); return /[",;\n\r\t]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
/**
 * Text that Excel or Sheets would run as a formula (=, +, -, @, tab, return, after any leading spaces) is kept
 * as text with a leading apostrophe. A semicolon-locale Excel splits cells on ";" even inside quotes, so a
 * formula character after a ";" gets one too.
 */
const safeText = v => {
  const s = String(v ?? '').replace(/;(?=[ \t]*[=+\-@\t\r])/g, ";'");
  return /^[ \t]*[=+\-@\t\r]/.test(s) ? "'" + s : s;
};
/** Undoes safeText on a cell of our own export (only the apostrophes it adds: before a formula character). */
const unsafeText = s => String(s).replace(/^'(?=[ \t]*[=+\-@\t\r])/, '').replace(/;'(?=[ \t]*[=+\-@\t\r])/g, ';');

export function toCSV(sessions, exById, gyms = []) {
  const gname = id => (Array.isArray(gyms) ? gyms.find(g => g?.id === id)?.name : '') || '';
  const rows = [CSV_COLS.join(',')];
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of s.entries || []) {
      const ex = exById[e.exId];
      let n = 0;
      for (const set of e.sets || []) {
        rows.push([s.date, safeText(s.name), safeText(ex?.name || e.exId), setExercise(ex || { unit: '' }, set).unit, set.warm ? 'W' : ++n, set.warm ? 1 : 0, set.w ?? '', set.r ?? '', set.done ? 1 : 0, safeText(e.rir ?? ''), e.pain ? 1 : 0, safeText(gname(s.gymId)), safeText(e.note || ''),
          safeText(s.note || ''), Number.isFinite(s.hr) ? s.hr : ''].map(q).join(','));
      }
    }
  }
  // A byte-order mark so Excel opens Chinese and Japanese names as UTF-8 (sessionsFromCSV strips it again).
  return '﻿' + rows.join('\n');
}

/** The delimiter a CSV uses: comma, semicolon (Strong in many European locales) or tab, judged on its header line. */
export function csvDelimiter(text) {
  const first = String(text).split(/\r?\n/, 1)[0].replace(/"[^"]*"/g, '');
  const n = c => first.split(c).length - 1;
  return [';', '\t'].reduce((best, c) => (n(c) > n(best) ? c : best), ',');
}

export function parseCSV(text, delim = ',') {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

/**
 * CSV -> parsed sessions [{date, name, notes, entries:[{exName, unit, sets, rir, pain, note}]}].
 * Reads our own export, hand-made sheets, Hevy (title, start_time, exercise_title, set_index, set_type,
 * weight_kg | weight_lbs, reps, duration_seconds, rpe…) and Strong (comma or semicolon, "Set Order" W = warm-up).
 * Pounds are converted to kg: a "weight_lbs"/"lbs" column, a "Weight Unit" of lbs, or opts.lb for a bare "weight".
 * Numeric dates are read day first unless the file is clearly month first (a "9/21/2026") or opts.dateOrder says so.
 */
export function sessionsFromCSV(text, { lb = false, dateOrder = 'auto', fallbackDate = null, lang = null, today = null } = {}) {
  loadForeignNames(); // for the review screen's name matching
  let rows = parseCSV(String(text).replace(/^\uFEFF/, ''), csvDelimiter(text));
  if (!rows.length) throw new Error('The file is empty.');
  // Accept common header spellings from other apps and hand-made sheets.
  const ALIAS = {
    day: 'date', when: 'date', 'start time': 'date', 'exercise name': 'exercise', 'exercise title': 'exercise', lift: 'exercise', movement: 'exercise',
    kg: 'weight', load: 'weight', 'weight kg': 'weight', 'weight kgs': 'weight', 'weight lbs': 'weightlb', 'weight lb': 'weightlb', lbs: 'weightlb', lb: 'weightlb', pounds: 'weightlb',
    rep: 'reps', repetitions: 'reps', notes: 'note', comment: 'note', comments: 'note', 'exercise notes': 'note',
    workout: 'session', 'workout name': 'session', title: 'session', 'workout title': 'session', description: 'wnote', 'workout notes': 'wnote',
    'set type': 'settype', 'set order': 'setorder', 'set index': 'setindex', 'duration seconds': 'seconds', seconds: 'seconds', 'weight unit': 'wunit',
    // Other apps and languages: Jefit, MyFitnessPal, GymBook (German), Spanish, French, Malay sheets.
    mydate: 'date', ename: 'exercise', 'reps per set': 'reps', 'weight per set': 'weight', 'weight per set kg': 'weight',
    datum: 'date', fecha: 'date', tarikh: 'date', übung: 'exercise', ejercicio: 'exercise', exercice: 'exercise', senaman: 'exercise',
    wdh: 'reps', wiederholungen: 'reps', repeticiones: 'reps', répétitions: 'reps', ulangan: 'reps', gewicht: 'weight', 'gewicht kg': 'weight', peso: 'weight', 'peso kg': 'weight', poids: 'weight', 'poids kg': 'weight', berat: 'weight', 'berat kg': 'weight', satz: 'setindex', serie: 'setindex', séries: 'sets', series: 'sets',
    'exercise name': 'exercise', 'weight kilograms': 'weight',
    // Our own export's session columns.
    'session note': 'wnote', 'heart rate': 'hr', 'avg hr': 'hr', 'avg heart rate': 'hr', bpm: 'hr',
    // Malay, Japanese and Chinese sheets.
    latihan: 'exercise', 'nama latihan': 'exercise', 'nama senaman': 'exercise', beban: 'weight', 'beban kg': 'weight', 'tarikh latihan': 'date',
    训练日期: 'date', 訓練日期: 'date', 锻炼日期: 'date', トレーニング日: 'date', 'bil set': 'sets', 'bilangan set': 'sets', 'berat kgs': 'weight', catatan: 'note', nota: 'note',
    日付: 'date', 種目: 'exercise', 種目名: 'exercise', 重量: 'weight', '重量 kg': 'weight', 回数: 'reps', レップ数: 'reps', セット: 'sets', セット数: 'sets', メモ: 'note', 備考: 'note',
    日期: 'date', 动作: 'exercise', 动作名称: 'exercise', 動作: 'exercise', 动作名: 'exercise', 项目: 'exercise', '重量 公斤': 'weight', 次数: 'reps', 组数: 'sets', 組數: 'sets', 备注: 'note', 備註: 'note',
  };
  const norm = h => { const k = String(h).trim().toLowerCase().replace(/[()_.]/g, ' ').replace(/\s+/g, ' ').trim(); return ALIAS[k] || k; };
  // Some exports put a title line or two above the header ("### EXERCISE LOGS ###").
  const at = rows.findIndex(r => { const h = r.map(norm); return h.includes('exercise') && (h.includes('date') || fallbackDate); });
  if (at > 0) rows = rows.slice(at);
  const head = rows[0].map(norm);
  // A Malay sheet's "Set" column is the number of sets ("Latihan, Set, Ulangan, Berat"); elsewhere "Set" numbers the rows.
  if (!head.includes('sets') && head.includes('set') && rows[0].some(h => /^\s*(tarikh|latihan|senaman|nama senaman|ulangan|berat|beban)\b/i.test(h))) head[head.indexOf('set')] = 'sets';
  const has = n => head.includes(n);
  // "Set 1", "Set 2"… columns hold either reps (with a weight column) or whole sets ("60x8").
  const setCols = head.map((h, i) => (/^(set|satz|serie) ?\d+$/.test(h) ? i : -1)).filter(i => i >= 0);
  const perRowSets = has('logs') || setCols.length > 0;
  // A weight column is optional: a bodyweight log (date, exercise, reps) has none, and its loads stay unknown.
  const miss = [['date', has('date') || fallbackDate], ['exercise', has('exercise')], ['reps', has('reps') || has('seconds') || perRowSets]].filter(x => !x[1]).map(x => x[0]);
  if (miss.length) throw new Error(`Missing column${miss.length > 1 ? 's' : ''}: ${miss.join(', ')}. Expected at least date, exercise and reps (weight if there is one).`);
  const ix = n => head.indexOf(n);
  // Japanese and Chinese files write the month first ("9/5" is 5 September), as their text notes do: a sheet
  // written in Chinese or Japanese (its header, or most of its lift names), or read with the app in those languages.
  // A few Chinese lift names in a Western sheet don't count. The dates themselves decide when any can (21/9, 9/21).
  const cjkish = t => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(t);
  const monthFirst = () => {
    if (['zh', 'zh-Hant', 'ja'].includes(lang) || cjkish(rows[0].join(' '))) return true;
    const names = rows.slice(1).map(r => String(r[ix('exercise')] ?? '').trim()).filter(Boolean);
    return names.length > 0 && names.filter(cjkish).length * 2 > names.length;
  };
  const order = !has('date') ? 'ymd' : dateOrder === 'auto' ? detectDateOrder(rows.slice(1).map(r => r[ix('date')]), { monthFirst: monthFirst() }) : dateOrder;
  const kgHeader = /kg/i.test(rows[0][ix('weight')] || '');
  // Our own export (see toCSV): its weights are kg whatever the unit column says, and its guard apostrophes come off.
  const ours = rows[0].slice(0, 7).map(h => String(h).trim()).join(',') === CSV_COLS.slice(0, 7).join(',');
  const map = new Map();
  const num = csvNum;
  // Rows dated after tomorrow can't be workouts that happened: left out, and counted.
  const tomorrow = today && validIso(today) ? isoOf(t(today) + DAY) : null;
  let future = 0;
  for (const r of rows.slice(1)) {
    const date = has('date') ? normDate(excelDate(r[ix('date')]), order) : fallbackDate;
    if (!date) continue;
    if (tomorrow && date > tomorrow) { future++; continue; }
    const cell = n => { if (ix(n) < 0) return ''; const v = String(r[ix(n)] ?? ''); return (ours ? unsafeText(v) : v).trim(); };
    const name = cell('session') || 'Imported';
    const key = date + '|' + name;
    if (!map.has(key)) map.set(key, { date, name, entries: [], notes: [] });
    const sess = map.get(key);
    const wn = cell('wnote');
    if (wn && !sess.notes.includes(wn)) sess.notes.push(wn);
    const hr = num(cell('hr'));
    if (hr > 0 && hr < 260 && sess.hr == null) sess.hr = Math.round(hr);
    if (cell('gym') && sess.gym == null) sess.gym = cleanText(cell('gym'), 60);
    const exName = keepZwj(cell('exercise').replace(/_+/g, ' '), cleanText);
    if (!exName) continue;
    // Whole sets in one cell: Jefit "logs" ("60x8,60x8") or "Set 1…" columns ("60x8", or reps with a weight column).
    if (perRowSets && !has('reps')) {
      const lbCell = /^(lbs?|pounds?)$/i.test(cell('wunit') || cell('unit')) || (lb && !kgHeader);
      const found = [];
      if (has('logs')) found.push(...(parseSetLine(cell('logs').replace(/,/g, ' '), { lb: lbCell })?.sets || []));
      for (const i of setCols) {
        const v = String(r[i] ?? '').trim();
        if (!v) continue;
        if (/x|×/i.test(v)) found.push(...(parseSetLine(v, { lb: lbCell })?.sets || []));
        else if (num(v) != null) { let w = has('weightlb') ? num(cell('weightlb')) : num(cell('weight')); if (w != null && (lbCell || has('weightlb'))) w = lbToKg(w); found.push({ w, r: num(v) }); }
      }
      if (!found.length) continue;
      let e2 = sess.entries.find(e => e.exName === exName);
      if (!e2) { e2 = { exName, unit: '', sets: [], rir: null, pain: false, note: '' }; sess.entries.push(e2); }
      e2.sets.push(...found.map(s => ({ w: s.w, r: s.r, done: true })));
      continue;
    }
    // Pounds: the cell says so ("135lbs"), its own column, a unit column that says so, or the whole file (opts.lb)
    // when nothing says kg. Our own export is always kg (its unit column is kg, kg/DB, L or bw), and a cable
    // level (L) is never a weight at all.
    const wcell = cell('weightlb') !== '' ? cell('weightlb') : cell('weight');
    const cellUnit = /\d\s*(?:lbs?|pounds?)$/i.test(wcell) ? 'lb' : /\d\s*(?:kgs?|kilos?)$/i.test(wcell) ? 'kg' : null;
    const level = /^(l|level|lvl|levels)$/i.test(cell('unit')) || /^(l|level|lvl|levels)$/i.test(cell('wunit'));
    const lbRow = !ours && !level && (cellUnit ? cellUnit === 'lb'
      : cell('weightlb') !== '' || /^(lbs?|pounds?)$/i.test(cell('wunit')) || /^(lbs?|pounds?)$/i.test(cell('unit')) || (lb && !kgHeader && !/^(kgs?|kg\/db|bw)$/i.test(cell('wunit') || cell('unit'))));
    let w = num(wcell);
    // A negative load is assistance (an assisted pull-up or dip machine); on any other lift the sign is a typo.
    if (w < 0 && !ASSISTED_RE.test(exName)) w = -w;
    let reps = num(cell('reps'));
    if (reps < 0) reps = null;
    // Timed sets (a plank in Hevy or Strong): seconds count as reps.
    if (reps == null && num(cell('seconds'))) reps = num(cell('seconds'));
    // Cardio and distance rows have no load and no reps: nothing to log as a set.
    if (reps == null && w == null) continue;
    if (lbRow && w != null) w = lbToKg(w);
    let ent = sess.entries.find(e => e.exName === exName);
    if (!ent) { ent = { exName, unit: ['kg', 'kg/DB', 'L', 'bw'].includes(cell('unit')) ? cell('unit') : '', sets: [], rir: null, pain: false, note: '' }; sess.entries.push(ent); }
    const warm = cell('warmup') === '1' || /^warm/i.test(cell('settype')) || /^w$/i.test(cell('setorder'));
    const set = { w, r: reps, ...(ours && ['kg', 'kg/DB', 'L', 'bw'].includes(cell('unit')) ? { loadUnit: cell('unit') } : {}), done: cell('done') !== '0', ...(warm ? { warm: true } : {}) };
    const k = Math.min(12, Math.max(1, Math.round(num(cell('sets')) || 1)));
    for (let i = 0; i < k; i++) ent.sets.push({ ...set });
    if (cell('rir')) ent.rir = cell('rir');
    // RPE 8 = about 2 reps left.
    else if (num(cell('rpe')) != null && !warm) ent.rir = String(Math.max(0, Math.round(10 - num(cell('rpe')))));
    const note = cell('note');
    if (cell('pain') === '1' || (note && hasPain(note))) ent.pain = true;
    if (note && !ent.note.includes(note)) ent.note = ent.note ? ent.note + ' ' + note : note;
  }
  for (const s of map.values()) {
    for (const e of s.entries) e.sets = e.sets.filter(x => !(+x.w > MAX_KG) && !(+x.r > MAX_REPS));
    s.entries = s.entries.filter(e => e.sets.length);
  }
  const out = [...map.values()].filter(s => s.entries.length);
  out.future = future;
  return out;
}

/**
 * What an imported session keeps besides its sets: a heart rate a person can have (30–250, rounded) and the
 * gym, when one of `gyms` has the same name. Anything else is left out. Returns {hr?, gymId?}.
 */
export function importExtras(s, gyms) {
  const out = {};
  if (typeof s?.hr === 'number' && s.hr >= 30 && s.hr <= 250) out.hr = Math.round(s.hr);
  const key = v => String(v ?? '').trim().toLowerCase();
  const name = key(s?.gym);
  const g = name && Array.isArray(gyms) ? gyms.find(x => x && typeof x.id === 'string' && key(x.name) === name) : null;
  if (g) out.gymId = g.id;
  return out;
}

/** An assisted lift: a negative load on it is the machine's help, not a typo. */
const ASSISTED_RE = /\bassist(?:ed|ance)?\b|\bgravitron\b/i;

/**
 * A number from a CSV cell: "60", "60 kg", "135lbs", "60,5" (decimal comma), "1,000" and "1.000,5" (thousands
 * separators), "1,234.5". Hex, exponents and other oddities are not numbers. Conservative: "1.500" stays 1.5;
 * a single "." group counts as thousands only as "1.000" (up to MAX_KG).
 */
export function csvNum(v) {
  let x = String(v ?? '').trim().replace(/\s*(?:kgs?|kilos?|lbs?|pounds?|reps?|s)$/i, '').replace(/\s+/g, '');
  if (x.includes(',') && x.includes('.')) {
    // Both: the last one is the decimal point.
    x = x.lastIndexOf(',') > x.lastIndexOf('.') ? x.replace(/\./g, '').replace(',', '.') : x.replace(/,/g, '');
  } else if (x.includes(',')) {
    x = /^-?[1-9]\d{0,2}(,\d{3})+$/.test(x) ? x.replace(/,/g, '') : x.replace(',', '.');
  } else if (/^-?[1-9]\d{0,2}(\.\d{3}){2,}$/.test(x) || (/^-?[1-9]\d{0,2}\.000$/.test(x) && Math.abs(+x) * 1000 <= MAX_KG)) {
    x = x.replace(/\./g, '');
  }
  return /^[-+]?(\d+\.?\d*|\.\d+)$/.test(x) ? +x : null;
}

/** fn(s) with emoji joined by zero-width joiners ("🏋️‍♀️") kept whole: cleanText would take the joiner out. */
const ZWJ_KEEP = '\u{10FFFD}';
function keepZwj(s, fn) {
  const t = String(s).replace(/(\p{Extended_Pictographic}️?)‍(?=\p{Extended_Pictographic})/gu, `$1${ZWJ_KEEP}`);
  return fn(t).replaceAll(ZWJ_KEEP, '‍');
}

// ---- reading any file someone picks ------------------------------------------------------------------
/** Bytes to text: UTF-8, or UTF-16 (Excel's "Unicode text", some Windows notes apps), with or without a byte-order mark. */
export function decodeBytes(u8) {
  const b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b.subarray(2));
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return new TextDecoder('utf-8').decode(b.subarray(3));
  // No mark, but every other byte is zero: UTF-16 as well.
  const n = Math.min(b.length, 400);
  let odd = 0, even = 0;
  for (let i = 0; i < n; i++) if (!b[i]) (i % 2 ? odd++ : even++);
  if (n > 8 && odd > n / 3 && even < n / 20) return new TextDecoder('utf-16le').decode(b);
  if (n > 8 && even > n / 3 && odd < n / 20) return new TextDecoder('utf-16be').decode(b);
  const utf8 = new TextDecoder('utf-8').decode(b);
  if (!utf8.includes('�')) return utf8;
  // Not valid UTF-8: a Japanese (Shift-JIS) or Chinese (GBK) Windows file, or an old Western one (Windows-1252).
  return cjkLegacy(b) ?? new TextDecoder('windows-1252').decode(b);
}
/**
 * Shift-JIS or GBK text, or null. Such text keeps its non-ASCII bytes in pairs, while Western accents ("é")
 * mostly sit alone between plain letters; of the two decodings the one that reads as real text wins
 * (Japanese has kana; Chinese read as Shift-JIS turns into half-width katakana).
 */
function cjkLegacy(b) {
  let high = 0, paired = 0;
  for (let i = 0; i < b.length; i++) if (b[i] >= 0x80) { high++; if (b[i - 1] >= 0x80 || b[i + 1] >= 0x80) paired++; }
  if (high < 4 || paired < high * 0.6) return null;
  let best = null, bestScore = 0;
  for (const enc of ['shift_jis', 'gb18030']) {
    let t;
    try { t = new TextDecoder(enc, { fatal: true }).decode(b); } catch { continue; }
    const count = re => (t.match(re) || []).length;
    const score = count(/[\p{Script=Hiragana}゠-ヿ]/gu) * 2 + count(/\p{Script=Han}/gu) - count(/[｡-ﾟ]/g) * 3;
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return best;
}

const REJECT = {
  photo: 'is a photo. Import reads text, not pictures: copy the text out of it (most phones can select text in a photo) and paste it below.',
  sheet: 'is an Excel or Numbers file. Save it as CSV first (File → Save as / Download → CSV), then import the CSV.',
  doc: 'is a Word or Pages document. Save it as plain text or PDF first, or copy the text and paste it below.',
  zip: 'is a zip archive. Unzip it and pick the CSV, text or PDF files inside.',
  gps: 'is a GPS track (runs and rides). Log cardio under Progress → Cardio instead.',
  json: 'is a data file from another app. Export a CSV from that app instead, or paste the workouts as text.',
  audio: 'is not a workout log this app can read. Use PDF, text or CSV.',
};
/**
 * What the Import screen does with a picked file, from its name, first bytes and the start of its text.
 * kind: pdf | csv | text | html | rtf | backup | reject (with a message).
 */
export function routeFile(name, head, sample = '') {
  loadForeignNames(); // a file was picked: the names are ready by the time it has been read
  const ext = (String(name).match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const h = head instanceof Uint8Array ? head : new Uint8Array(head || []);
  const sig = String.fromCharCode(...h.subarray(0, 12));
  const no = why => ({ kind: 'reject', message: `${name} ${REJECT[why]}` });
  if (ext === 'pdf' || sig.startsWith('%PDF-')) return { kind: 'pdf' };
  if (/^(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/.test(ext) || (h[0] === 0xff && h[1] === 0xd8) || sig.startsWith('\x89PNG') || sig.startsWith('GIF8') || (sig.startsWith('RIFF') && sig.slice(8, 12) === 'WEBP') || /^....ftyp(heic|heix|mif1)/.test(sig)) return no('photo');
  if (/^(xlsx?|xlsm|ods|numbers)$/.test(ext)) return no('sheet');
  if (/^(docx?|odt|pages)$/.test(ext)) return no('doc');
  if (/^(zip|rar|7z|gz)$/.test(ext)) return no('zip');
  if (h[0] === 0x50 && h[1] === 0x4b) return no(/sheet|xl\//i.test(name) ? 'sheet' : 'zip');
  if (h[0] === 0xd0 && h[1] === 0xcf && h[2] === 0x11) return no(ext === 'doc' ? 'doc' : 'sheet');
  if (/^(gpx|tcx|fit|kml)$/.test(ext)) return no('gps');
  if (/^(mp3|m4a|wav|mp4|mov)$/.test(ext)) return no('audio');
  const t = String(sample).replace(/^﻿/, '').trimStart();
  if (ext === 'rtf' || t.startsWith('{\\rtf')) return { kind: 'rtf' };
  if (ext === 'json' || /^[{[]\s*["{[\]]/.test(t)) return /"app"\s*:\s*"setlist"/.test(t) ? { kind: 'backup' } : no('json');
  if (/^<\?xml[^>]*>\s*<(gpx|TrainingCenterDatabase)\b/i.test(t) || /^<(gpx|TrainingCenterDatabase)\b/i.test(t)) return no('gps');
  if (/^(html?|enex|xml|mhtml?)$/.test(ext) || /^<(!doctype html|html|\?xml|en-export|body|div|table|p)\b/i.test(t)) return { kind: 'html' };
  if (/^(csv|tsv)$/.test(ext) || /^[^\n]*\b(date|start_time|datum|fecha|tarikh)\b[^\n]*[,;\t][^\n]*\b(exercise|exercise_title|übung|ejercicio|senaman|latihan)/i.test(t)
    || /^[^\n]*(日付|日期)[^\n]*[,;\t][^\n]*(種目|动作|動作|项目)/.test(t)) return { kind: 'csv' };
  return { kind: 'text' };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '×', ndash: '–', mdash: '—', hellip: '…' };
/** HTML, Evernote or Notion exports to plain lines: block ends and table cells become line breaks and spaces. */
export function htmlToText(html) {
  // The tag-pair steps are indexOf scans, not regexes: a crafted file of unclosed tags would make a
  // backtracking regex take minutes (each is linear in the file's length).
  return stripBlocks(unwrapCdata(smsBodies(String(html))))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|note|title|en-note|table|ul|ol)>/gi, '\n')
    .replace(/<\/t[dh]>/gi, ' ')
    // A tag never holds another '<': that keeps this linear on a file of unclosed tags.
    .replace(/<[^<>]+>/g, '')
    .replace(/&(#x?[0-9a-f]{1,8}|[a-z]{1,10});/gi, (m, e) => {
      if (e[0] !== '#') { const k = e.toLowerCase(); return Object.hasOwn(ENT, k) ? ENT[k] : m; }
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : /^\d+$/.test(e.slice(1)) ? +e.slice(1) : NaN;
      // Past U+10FFFF, or a lone surrogate half: not a character.
      return Number.isInteger(cp) && cp > 0 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) ? String.fromCodePoint(cp) : '�';
    })
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
}
/** SMS Backup & Restore XML: each <sms … body="…"> becomes a paragraph of its body. */
function smsBodies(s) {
  const re = /<sms\b/gi;
  let out = '', from = 0, m;
  while ((m = re.exec(s))) {
    const i = m.index;
    let end = s.indexOf('>', i);
    if (end < 0) break; // no '>' left: no later tag can close either
    // Every '<sms' up to `end` is consumed below, so each character is looked at a bounded number of times.
    const bm = /[\s"']body="/i.exec(s.slice(i, end));
    let body = null;
    if (bm) {
      const b = i + bm.index + 1;
      const close = s.indexOf('"', b + 6);
      if (close < 0) break;
      body = s.slice(b + 6, close);
      if (close > end) { end = s.indexOf('>', close); if (end < 0) break; }
    }
    if (body == null) { re.lastIndex = end + 1; continue; }
    out += s.slice(from, i) + `<p>${body.replace(/&#10;/g, '<br>')}</p>`;
    from = re.lastIndex = end + 1;
  }
  return from ? out + s.slice(from) : s;
}
/** <![CDATA[x]]> -> x. */
function unwrapCdata(s) {
  let out = '', from = 0;
  for (;;) {
    const i = s.indexOf('<![CDATA[', from);
    if (i < 0) break;
    const j = s.indexOf(']]>', i + 9);
    if (j < 0) break;
    out += s.slice(from, i) + s.slice(i + 9, j);
    from = j + 3;
  }
  return from ? out + s.slice(from) : s;
}
/** <script>, <style> and <head> blocks removed with their contents (an unclosed one stays, as before). */
const BLOCK_OPEN = /<(script|style|head)\b/gi;
const BLOCK_CLOSE = { script: /<\/script>/gi, style: /<\/style>/gi, head: /<\/head>/gi };
function stripBlocks(s) {
  let out = '', from = 0, m;
  const noClose = new Set();
  BLOCK_OPEN.lastIndex = 0;
  while ((m = BLOCK_OPEN.exec(s))) {
    const tag = m[1].toLowerCase();
    if (noClose.has(tag)) continue;
    const close = BLOCK_CLOSE[tag];
    close.lastIndex = m.index + m[0].length;
    const c = close.exec(s);
    // Not closed: no later block of this kind can be either.
    if (!c) { noClose.add(tag); continue; }
    out += s.slice(from, m.index);
    from = BLOCK_OPEN.lastIndex = c.index + c[0].length;
  }
  return from ? out + s.slice(from) : s;
}
/** Rich text (TextEdit, WordPad) to plain lines. */
export function rtfToText(rtf) {
  return String(rtf)
    .replace(/\{\\\*[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '')
    .replace(/\{\\(fonttbl|colortbl|stylesheet|info)[\s\S]*?\}\s*\}/g, '')
    .replace(/\\par[d]?\b ?|\\line\b ?/g, '\n')
    .replace(/\\'([0-9a-f]{2})/gi, (m, x) => new TextDecoder('windows-1252').decode(new Uint8Array([parseInt(x, 16)])))
    .replace(/\\u(-?\d+) ?\??/g, (m, n) => String.fromCharCode(+n < 0 ? +n + 65536 : +n))
    .replace(/\\[a-z]+-?\d* ?/gi, '')
    .replace(/[{}]/g, '')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n');
}

/**
 * One non-PDF file, start to finish, the way the Import screen reads it: sessions found, or why not.
 * Used by the Import screen and by the import tests.
 */
export function importFile(name, bytes, exercises, opts = {}) {
  loadForeignNames();
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const text = decodeBytes(u8);
  const route = routeFile(name, u8.subarray(0, 16), text.slice(0, 2000));
  if (route.kind === 'reject' || route.kind === 'backup' || route.kind === 'pdf') return { ...route, sessions: [] };
  if (route.kind === 'csv') {
    const fallbackDate = findDate(String(name).replace(/[_]+/g, ' '), opts.year || new Date().getFullYear(), 'ymd');
    try { const sessions = sessionsFromCSV(text, { ...opts, fallbackDate }); return { kind: 'csv', sessions, future: sessions.future || 0 }; }
    catch (e) {
      // A CSV that isn't a set-by-set log (one row per exercise, or a coach's sheet) still reads as text lines.
      const r = parseLogText(text.replace(/[,;\t]+/g, ' '), exercises, { sessionName: sessionNameFromFile(name), ...opts });
      return r.sessions.length ? { kind: 'text', sessions: r.sessions, skipped: r.skipped, future: r.future, impossible: r.impossible, badYears: r.badYears } : { kind: 'reject', message: e.message, sessions: [] };
    }
  }
  const plain = route.kind === 'html' ? htmlToText(text) : route.kind === 'rtf' ? rtfToText(text) : text;
  const r = parseLogText(plain, exercises, { sessionName: sessionNameFromFile(name), ...opts });
  return { kind: route.kind, sessions: r.sessions, skipped: r.skipped, future: r.future, impossible: r.impossible, badYears: r.badYears || [] };
}

/** Excel stores dates as day numbers (46286 = 21 Sep 2026); a CSV saved from it can keep them. */
export function excelDate(v) {
  const s = String(v ?? '').trim();
  if (!/^\d{5}(\.\d+)?$/.test(s) || +s < 20000 || +s > 80000) return v;
  return new Date(Date.UTC(1899, 11, 30) + Math.floor(+s) * 864e5).toISOString().slice(0, 10);
}

/** Pounds to kg, kept to 3 decimals so it shows back as the same number of pounds. */
export const lbToKg = v => Math.round(+v * 0.45359237 * 1000) / 1000;

// ---- dates ------------------------------------------------------------------------------
// English and Malay (Mac, Mei, Ogos, Okt, Dis; Januari, Julai…): the first three letters pick the month.
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, mac: 3, mei: 5, ogo: 8, okt: 10, dis: 12 };
const pad = n => String(n).padStart(2, '0');
function mk(y, m, d) {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

// Whole month words only: "maybe 2 rir" is not 2 May, "4 decent reps" is not 4 December.
const MONTH = String.raw`(jan(?:uary|uari)?|feb(?:ruary|ruari)?|mar(?:ch)?|mac|apr(?:il)?|may|mei|june?|julai|july?|aug(?:ust)?|ogos?|sep(?:t(?:ember)?)?|oct(?:ober)?|okt(?:ober)?|nov(?:ember)?|dec(?:ember)?|dis(?:ember)?)\.?`;
// A weekday in front of a short date ("Mon 21/9 Push", "Isnin 28/9"), English or Malay.
const WEEKDAY_BEFORE_DATE = /^(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|isnin|selasa|rabu|khamis|jumaat|sabtu|ahad)\.?,?\s+(?=\d{1,2}[/.-]\d{1,2}(?![/.-]?\d))/i;
// A number followed by these is a set, not a day: "May 2 rir", "7.5 x8", "12.5 kg".
const NOT_DAY = String.raw`(?!\s*(?:x\s*\d|[x×]\b|reps?\b|sets?\b|rir\b|rpe\b|kgs?\b|lbs?\b|more\b|%|\.\d))`;
const RE_DMY = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH}(?![a-z])(?:,?\s*(\d{4}|\d{2})\b)?`, 'i');
const RE_MDY = new RegExp(String.raw`\b${MONTH}(?![a-z])\s+(\d{1,2})(?:st|nd|rd|th)?\b${NOT_DAY}(?:,?\s*(\d{4})\b)?`, 'i');
const RE_DM = new RegExp(String.raw`^\s*(\d{1,2})[/.](\d{1,2})\b(?![/.]\d)${NOT_DAY}`);
/** Years on date-shaped text that the reader skips (outside 1991–2099), e.g. "21/9/9999": shown so "Nothing found" has a reason. */
export function badYearsIn(text) {
  const out = new Set();
  const res = [/\b(\d{4})[-/.]\d{1,2}[-/.]\d{1,2}\b/g, /\b\d{1,2}[-/.]\d{1,2}[-/.](\d{4})\b/g, /(\d{4})\s*年\s*\d{1,2}\s*月/g,
    new RegExp(String.raw`\b\d{1,2}(?:st|nd|rd|th)?\s+${MONTH}(?![a-z]),?\s*(\d{4})\b`, 'gi'), new RegExp(String.raw`\b${MONTH}(?![a-z])\s+\d{1,2}(?:st|nd|rd|th)?,?\s*(\d{4})\b`, 'gi')];
  for (const re of res) for (const m of String(text || '').matchAll(re)) { const y = +m[m.length - 1]; if (!(y > 1990 && y < 2100)) out.add(String(y)); }
  return [...out].slice(0, 10);
}
export const MONTH_RE = new RegExp(String.raw`\b${MONTH}(?![a-z])`, 'gi');

/** Find a date in a line. Numeric dates are day first (Malaysian/UK style) unless order is 'mdy' (US). Returns {iso, index}. */
export function findDateAt(line, fallbackYear, order = 'dmy') {
  let m;
  const us = order === 'mdy';
  if ((m = line.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) return { iso: mk(+m[1], +m[2], +m[3]), index: m.index };
  // Chinese and Japanese: "2026年9月28日", "9月28日(月)", "9月28号".
  if ((m = line.match(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]?/))) return { iso: mk(+m[1], +m[2], +m[3]), index: m.index };
  if ((m = line.match(/(?<!\d)(\d{1,2})\s*月\s*(\d{1,2})\s*[日号號]/))) return { iso: mk(fallbackYear, +m[1], +m[2]), index: m.index };
  if ((m = line.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) return { iso: us ? mk(+m[3], +m[1], +m[2]) : mk(+m[3], +m[2], +m[1]), index: m.index };
  if ((m = line.match(RE_DMY))) return { iso: mk(m[3] ? +m[3] : fallbackYear, MON[m[2].toLowerCase().slice(0, 3)], +m[1]), index: m.index };
  if ((m = line.match(RE_MDY))) return { iso: mk(m[3] ? +m[3] : fallbackYear, MON[m[1].toLowerCase().slice(0, 3)], +m[2]), index: m.index };
  if ((m = line.match(RE_DM))) return { iso: us ? mk(fallbackYear, +m[1], +m[2]) : mk(fallbackYear, +m[2], +m[1]), index: m.index };
  return null;
}
export function findDate(line, fallbackYear, order) { return findDateAt(line, fallbackYear, order)?.iso || null; }
export function normDate(v, order) { return v ? findDate(String(v), new Date().getFullYear(), order) : null; }

/**
 * Day first or month first? 'mdy' only when the numeric dates are clearly American: some can only be
 * month first (9/21/2026) and none can only be day first (21/9/2026). Otherwise 'dmy'.
 */
export function detectDateOrder(lines, { monthFirst = false } = {}) {
  const v3 = { dmy: 0, mdy: 0 }, v2 = { dmy: 0, mdy: 0 };
  const vote = (v, a, b) => { if (a > 31 || b > 31 || !a || !b) return; if (a > 12 && b <= 12) v.dmy++; else if (b > 12 && a <= 12) v.mdy++; };
  for (const l of lines) {
    const t = String(l ?? '');
    if (/\b\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(t)) continue;
    const re = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g;
    let m, any = false;
    while ((m = re.exec(t))) { any = true; vote(v3, +m[1], +m[2]); }
    if (!any && t.length <= 40 && (m = t.match(RE_DM))) vote(v2, +m[1], +m[2]);
  }
  // Japanese and Chinese logs write the month first ("10/3" is 3 October) unless the dates clearly say otherwise.
  if (monthFirst) return (v3.dmy && !v3.mdy) || (!v3.mdy && !v3.dmy && v2.dmy && !v2.mdy) ? 'dmy' : 'mdy';
  if (v3.mdy && !v3.dmy) return 'mdy';
  if (!v3.mdy && !v3.dmy && v2.mdy >= 2 && !v2.dmy) return 'mdy';
  return 'dmy';
}
/** Text clearly written in Chinese or Japanese: kana, or a few Han characters. */
export function isCJK(t) {
  const s = String(t);
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(s)) return true;
  let n = 0;
  for (const _ of s.matchAll(/\p{Script=Han}/gu)) if (++n >= 2) return true;
  return false;
}

// ---- free-text log parser ------------------------------------------------------------------
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;/**
 * Parse one line into sets, or null if it holds none.
 * Returns {sets:[{w,r}], unit?, before, after, rest}: `before` is text ahead of the first set (an inline
 * exercise name, e.g. "Incline DB press 25 kg 8,8,8"); `after` is text behind the sets (a remark).
 */
export function parseSetLine(line, { lb = false } = {}) {
  // Real set lines are short; a huge line (a pasted blob of digits) would make the patterns below crawl.
  if (line.length > 400) return null;
  // Thousands separators: "1,000 lbs", and "1.000 kg" (European) when that is a real load.
  let s = line.replace(/[×✕]/g, 'x').replace(/,(?=\d{3}\b)/g, '')
    .replace(/\b([1-9])\.000(?=\s*(?:kgs?|kilos?|lbs?|pounds?)\b)/gi, (m, d) => (+d * 1000 <= MAX_KG ? d + '000' : m));
  // Pounds become kg ("135 lbs x5" -> "61.235kg x5"). A line that gives both ("80lbs or 36kg x8") keeps its kg.
  const saysKg = /\d\s*(?:kgs?|kilos?)\b/i.test(s);
  if (!saysKg) s = s.replace(/(\d+(?:[.,]\d+)?)\s*(?:lbs?|pounds?)\b/gi, (m, v) => `${lbToKg(+v.replace(',', '.'))}kg`);
  const r = parseSets(s);
  // A log kept in pounds (opts.lb): bare numbers are pounds too. Cable levels are never converted.
  if (r && lb && !saysKg && r.unit !== 'L') for (const x of r.sets) if (x.w) x.w = lbToKg(x.w);
  return r;
}
function parseSets(s) {
  const sets = [];
  let unit = null, m;
  const num = v => +String(v).replace(',', '.');
  const out = (a, b) => ({ sets, unit, before: s.slice(0, a).trim(), after: s.slice(b).trim(), rest: (s.slice(0, a) + ' ' + s.slice(b)).trim() });
  if (/\b(bw|body ?weigh\w*)\b/i.test(s)) unit = 'bw';
  if (/\b(level|lvl|l)\s?\d/i.test(s)) unit = 'L';
  if (/\b(each|per (side|hand|db)|ea)\b|\bdbs?\b/i.test(s)) unit = unit || 'kg/DB';
  // "Bodyweight 70 x10": 70 is the lifter's body weight, not added load.
  const bwOnly = unit === 'bw' && !/\+\s*\d/.test(s);

  // "10 reps x 3 sets" with no load (what "3组×10次" becomes): the load is unknown.
  if ((m = s.match(/\b(\d{1,3})\s*reps?\s*x\s*(\d{1,2})\s*sets?\b/i)) && !/\d\s*(?:kgs?|lbs?)\b/i.test(s)) {
    for (let i = 0; i < Math.min(+m[2], 12); i++) sets.push({ w: bwOnly ? 0 : null, r: +m[1] });
    return out(m.index, m.index + m[0].length);
  }

  // "3x8 @ 25" / "4 x 6 @25kg" / "3 sets of 8 at 60kg"
  if ((m = s.match(new RegExp(String.raw`\b(\d{1,2})\s*(?:x|sets?\s*(?:of|x)?)\s*(\d{1,3})\s*(?:reps?)?\s*(?:@|at|with)\s*${NUM}\s*(?:kgs?)?`, 'i')))) {
    for (let i = 0; i < +m[1]; i++) sets.push({ w: num(m[3]), r: +m[2] });
    return out(m.index, m.index + m[0].length);
  }
  // "Deadlift 100kg 5x3", "Press banca 40kg 3x10": a load with its unit, then sets × reps
  if ((m = s.match(new RegExp(String.raw`${NUM}\s*(?:kgs?|kilos?|lbs?)\s+(\d{1,2})\s*x\s*(\d{1,3})\b(?!\s*x)`, 'i')))) {
    for (let i = 0; i < Math.min(+m[2], 12); i++) sets.push({ w: num(m[1]), r: +m[3] });
    return out(m.index, m.index + m[0].length);
  }
  // Bodyweight sets: "BW x16", "Bodyweight x6", "Bodyweight 70 x10" (70 = body weight), "Bodyweight +5kg x6" (added load)
  // "BW +10kg x6 x3": reps, then a set count.
  const bwRe = /\b(?:bw|body ?weigh\w*)\s*(\+\s*)?(\d+(?:[.,]\d+)?)?\s*(?:kgs?)?\s*x\s*(\d{1,3})\b(?:\s*x\s*(\d{1,2})\b)?/gi;
  let first = -1, last = 0;
  while ((m = bwRe.exec(s))) {
    if (first < 0) first = m.index;
    last = m.index + m[0].length;
    for (let i = 0; i < Math.min(m[4] ? +m[4] : 1, 12); i++) sets.push({ w: m[1] && m[2] ? num(m[2]) : 0, r: +m[3] });
  }
  if (sets.length) { unit = 'bw'; return out(first, last); }
  // One load, then a list of reps: "60kg x 8, 8, 6", "60kg x8 x8 x6" (three or more: "25kg x 8 x 4" is still reps x sets).
  if ((m = s.match(new RegExp(String.raw`(?:\b(?:level|lvl|l)\s?)?${NUM}\s*(?:kgs?|kilos?)?\s*(?:each|ea)?\s*x\s*((?:\d{1,3}\s*[,/;]\s*)+\d{1,3}|\d{1,3}(?:\s*x\s*\d{1,3}){2,})(?!\d|\.\d|\s*(?:x|kgs?|lbs?|[,/;]\s*\d))`, 'i')))) {
    const w = bwOnly ? 0 : num(m[1]);
    for (const r of m[2].split(/[,/;x]/i)) sets.push({ w, r: +r.trim() });
    return out(m.index, m.index + m[0].length);
  }
  // "L9 x 12 x 3", "25kg x 8 x 4", "25 x 8", several per line: "50kg x3 55kg x3"
  const re = new RegExp(String.raw`(?:\b(?:level|lvl|l)\s?)?${NUM}\s*(?:kgs?|kilos?)?\s*(?:each|ea)?\s*x\s*(\d{1,3})(?:\s*x\s*(\d{1,2}))?\b`, 'gi');
  let n = 0, bare = null;
  while ((m = re.exec(s))) {
    if (first < 0) first = m.index;
    last = m.index + m[0].length;
    const w = bwOnly ? 0 : num(m[1]), r = +m[2], k = m[3] ? +m[3] : 1;
    for (let i = 0; i < Math.min(k, 12); i++) sets.push({ w, r });
    // "3x6" with no unit: a load of 3, or 3 sets of 6? The caller decides once it knows the lift.
    if (!n++ && /^\d{1,2}\s*x\s*\d{1,3}$/i.test(m[0]) && +m[1] <= 10 && !unit) bare = { k: +m[1], r };
  }
  if (sets.length) return { ...out(first, last), ...(n === 1 && bare ? { bare } : {}) };
  // "45kg 10.10.8": reps split by dots. Two dots at least, so a load such as "10.5kg" is never taken apart.
  if ((m = s.match(new RegExp(String.raw`${NUM}\s*(?:kgs?|lbs?)\s*(?:each|ea|dbs?)?\s*[:\-–]?\s*(\d{1,2}(?:\.\d{1,2}){2,})(?![\d.,]|\s*(?:kgs?|lbs?|x))`, 'i')))) {
    const w = num(m[1]);
    for (const r of m[2].split('.')) sets.push({ w, r: +r });
    return out(m.index, m.index + m[0].length);
  }
  // "60kg 3 sets" / "60kg 3 set": sets written, reps not. The reps are unknown (the review asks for them).
  if ((m = s.match(new RegExp(String.raw`${NUM}\s*(?:kgs?|lbs?)\s*(?:each|ea)?\s*[,:\-–]?\s*(\d{1,2})\s*sets?\b(?!\s*(?:of|x)?\s*\d)`, 'i')))) {
    for (let i = 0; i < Math.min(+m[2], 12); i++) sets.push({ w: num(m[1]), r: null });
    return out(m.index, m.index + m[0].length);
  }
  // "25kg 8,8,6,6" / "25 kg: 8/8/8" / "L6: 15, 15"
  // (needs a unit, a colon or "level" so a bare "12/9" isn't read as sets; the three forms capture the load in groups 1–3)
  if ((m = s.match(new RegExp(String.raw`(?:\b(?:level|lvl|l)\s?${NUM}\s*[:\-–]?|${NUM}\s*(?:kgs?|lbs?)\s*(?:each|ea|dbs?)?\s*[:\-–]?|${NUM}\s*:)\s*((?:\d{1,3}\s*[,/;]\s*)+\d{1,3})`, 'i')))) {
    const w = num(m[1] ?? m[2] ?? m[3]);
    for (const r of m[4].split(/[,/;]/)) sets.push({ w, r: +r.trim() });
    return out(m.index, m.index + m[0].length);
  }
  // "15kg 8 8 7" / "45 kg 12" (needs the kg so plain numbers aren't mistaken for sets)
  if ((m = s.match(new RegExp(String.raw`${NUM}\s*kgs?\s*(?:each|ea)?\s*[:\-–]?\s*((?:\d{1,3}\s+)*\d{1,3})(?![\d.,]|\s*kg)`, 'i')))) {
    const w = num(m[1]);
    for (const r of m[2].trim().split(/\s+/)) sets.push({ w, r: +r });
    return out(m.index, m.index + m[0].length);
  }
  // "BW 6,6,6"
  if (unit === 'bw' && (m = s.match(/((?:\d{1,3}\s*[,/;]\s*)+\d{1,3})\s*(?:reps?)?/))) {
    for (const r of m[1].split(/[,/;]/)) sets.push({ w: 0, r: +r.trim() });
    return out(m.index, m.index + m[0].length);
  }
  return null;
}

/** "Monday Push 1_260928_054205.pdf" -> "Push 1" (the notes app's export stamp and the weekday are dropped). */
export function sessionNameFromFile(name) {
  const n = String(name).replace(/\.[a-z0-9]+$/i, '').replace(/\s*\(\d+\)$/, '').replace(/_\d{6}_\d{6}$/, '').replace(/_+/g, ' ').trim();
  // "Monday Push 1" -> "Push 1": History already shows the day, and it's wrong when the session moved.
  const rest = n.replace(/^(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b[\s,-]*/i, '');
  return rest.length >= 3 ? rest.charAt(0).toUpperCase() + rest.slice(1) : n;
}

/** RIR hints in a remark: "2 rir" -> "2"; "mech fail", "cannot", "failure" -> "0". */
const RIR_NUM_RE = /(\d)\s*\+?\s*rir|rir\s*(\d)/i;
function rirFrom(t) {
  let m;
  if ((m = t.match(RIR_NUM_RE))) return String(m[1] ?? m[2]);
  if (/\b(mech\w* fail\w*|muscles? failure|failure|cannot|can'?t (do|push|lift)|cant do|no juice|out of juice|failed)\b/i.test(t)) return '0';
  return null;
}

/** Split set-up details off a name line: "Bench press w dumbbells no machine" -> ["Bench press", "w dumbbells no machine"]. */
function splitName(line) {
  // "Chest press machine, did this set last" / "Shoulder press." -> cut at punctuation
  const p = line.match(/^([^,.;:!?]{3,}?)\s*[,.;:!?]\s*(.*)$/);
  if (p && /[a-z]{3}/i.test(p[1])) return [p[1].trim(), p[2].trim()];
  const m = line.match(/^(.{3,}?)\s+((?:w\/?|with|no|using|on|at|done|again|replacing|same|instead)\b.*|\(.*)$/i);
  if (!(m && /[a-z]{3}/i.test(m[1]))) return [line.trim(), ''];
  // "Bench press w dumbbells no machine": the equipment belongs to the name ("Bench press dumbbells").
  const eq = m[2].match(/^(?:w\/?|with|using)\s+((?:dumb+el+s?|dumbbells?|dbs?|barbell|cable|smith(?: machine)?|machine|rope|ez ?bar)\b)\s*(.*)$/i);
  if (eq) return [`${m[1].trim()} ${eq[1]}`, eq[2].trim()];
  return [m[1].trim(), m[2].replace(/^\(|\)$/g, '').trim()];
}

const MODIFIERS = ['reverse', 'incline', 'decline', 'close', 'wide', 'front', 'rear', 'single', 'hack', 'smith', 'romanian', 'overhead', 'bulgarian', 'split', 'goblet', 'hammer', 'preacher', 'wrist', 'hanging', 'lying', 'supported'];
// Plurals and spacing are ignored: "Pull ups" = "Pull-up", "Hammer curls" = "Hammer curl".
// Common spellings in gym notes, folded to one form before matching.
// Exercise names in other languages, mapped to the English words the library uses.
const FOREIGN = [
  [/bankdrücken|press (?:de )?banca|développé couché|supino(?: reto)?|panca piana|卧推/gu, 'bench press'],
  [/kniebeugen?|sentadillas?|agachamentos?|深蹲/gu, 'barbell squat'],
  [/latzug|jalón al pecho|jalon al pecho|tirage vertical|puxada(?: frontal)?|lat machine|高位下拉/gu, 'lat pulldown'],
  [/kreuzheben|peso muerto|soulevé de terre|levantamento terra|stacco(?: da terra)?|硬拉/gu, 'deadlift'],
  [/schulterdrücken|press militar|développé militaire|desenvolvimento|lento avanti|推举/gu, 'overhead press'],
  [/rudern|remo con barra|rowing barre|remada curvada/gu, 'barbell row'],
  [/bizepscurls?|curl de bíceps|rosca direta/gu, 'bicep curl'],
  // Malay gym names (older and everyday ones the translated library doesn't use).
  [/\btekan bahu (?:dumb+el+s?|dumbbells?|dbs?)\b|\b(?:dumb+el+s?|dumbbells?|dbs?) tekan bahu\b/g, 'db shoulder press'],
  [/\btarik dagu\b/g, 'chin up'], [/\blunge berjalan\b|\bberjalan lunge\b/g, 'walking lunge'],
  [/\btarik naik\b/g, 'pull up'], [/\bangkat mati romania\b/g, 'romanian deadlift'], [/\bangkat mati\b/g, 'deadlift'],
  [/\bcangkung(?: barbell)?\b/g, 'barbell squat'], [/\btekan bahu\b/g, 'overhead press'], [/\btekan dada\b/g, 'bench press'],
  [/\bdayung\b/g, 'row'], [/\b(?:bangkit|angkat) betis\b/g, 'calf raise'], [/\btekan tubi\b/g, 'push up'],
];
const ALIASES = [
  [/\bdumb+el+s?\b|\bdumbbells?\b|\bdbs?\b/g, 'db'], [/\btriceps?\b/g, 'triceps'], [/\bcalves\b/g, 'calf'], [/\blegs\b/g, 'leg'],
  [/\bpull ?-?ups?\b/g, 'pull up'], [/\bchin ?-?ups?\b/g, 'chin up'], [/\bpush ?-?ups?\b/g, 'push up'], [/\bsmitch\b/g, 'smith'],
  [/\bsquad\b/g, 'squat'], [/\binclined\b/g, 'incline'], [/\breversed\b/g, 'reverse'], [/\bpreachers\b/g, 'preacher'],
  [/\bdec\b/g, 'deck'], [/\bromanian deadlifts?\b/g, 'rdl'], [/\begypt\b/g, 'egyptian'], [/\bwrisr\b/g, 'wrist'],
  [/\bbar\b/g, 'barbell'], [/\bdl\b/g, 'deadlift'], [/\bpec fly\b/g, 'pec deck'], [/\boverheat\b/g, 'overhead'], [/\begyptian raises?\b/g, 'egyptian lateral raise'],
  [/\bcheat(?:ed|ing|er)?\b/g, 'cheat'], [/\bohp\b|\bmilitary press\b/g, 'overhead press'], [/\bhex barbell\b/g, 'trap barbell'],
  [/\bbiceps?\b/g, 'bicep'], [/\bhamstrings?\b|\bhams\b/g, 'hamstring'], [/\bglutes?\b/g, 'glute'],
  // A bent-over or Pendlay row is a barbell row unless the name says dumbbell or cable.
  [/(?<!\b(?:db|cable|machine|one arm|single arm) )\b(?:bent ?over|pendlay) rows?\b/g, 'barbell row'],
  // "Bench" on its own is the bench press.
  [/^bench$/, 'bench press'],
];
// Chinese and Japanese words inside names the library doesn't have word for word ("ダンベルフライ", "绳索弯举").
const CJK_WORDS = Object.entries({
  ベンチプレス: 'bench press', スクワット: 'squat', デッドリフト: 'deadlift', ラットプルダウン: 'lat pulldown', レッグプレス: 'leg press',
  レッグカール: 'leg curl', レッグエクステンション: 'leg extension', ショルダープレス: 'shoulder press', サイドレイズ: 'lateral raise',
  ダンベル: 'db', バーベル: 'barbell', ケーブル: 'cable', マシン: 'machine', スミス: 'smith', インクライン: 'incline',
  カール: 'curl', ローイング: 'row', ロウ: 'row', フライ: 'fly', プレス: 'press', 懸垂: 'pull up', チンニング: 'pull up',
  哑铃: 'db', 杠铃: 'barbell', 绳索: 'cable', 器械: 'machine', 史密斯: 'smith', 上斜: 'incline', 弯举: 'curl', 划船: 'row',
  飞鸟: 'fly', 侧平举: 'lateral raise', 腿举: 'leg press', 引体向上: 'pull up', 腿弯举: 'leg curl', 腿屈伸: 'leg extension',
  // Gym nicknames: cable-tower fly, "reverse pedal" leg press, seated chest press, ab wheel; "bench", "dead", "lat pull".
  龙门架夹胸: 'cable chest fly', 龍門架夾胸: 'cable chest fly', 龙门架: 'cable', 夹胸: 'chest fly', 倒蹬机: 'leg press', 倒蹬: 'leg press',
  坐姿推胸: 'machine chest press', 腹肌轮: 'ab wheel rollout', 健腹轮: 'ab wheel rollout',
  ラットプル: 'lat pulldown', チェストプレス: 'machine chest press', ベンチ: 'bench press', デッド: 'deadlift', シーテッドロウ: 'seated cable row',
  腹筋ローラー: 'ab wheel rollout', 腕立て伏せ: 'push up', 腕立て: 'push up',
  ダンベルプレス: 'flat db bench press', ブルガリアンスクワット: 'bulgarian split squat', ブルガリアン: 'bulgarian split squat',
  ルーマニアンデッドリフト: 'romanian deadlift', ルーマニアン: 'romanian deadlift', カーフレイズ: 'calf raise',
  ハイパーエクステンション: 'back extension', バックエクステンション: 'back extension', ケーブルクロスオーバー: 'cable chest fly', ケーブルクロス: 'cable chest fly',
  プッシュダウン: 'pushdown', アダクション: 'hip adduction machine', アブダクション: 'hip abduction machine',
  ワンハンドロウ: 'one arm db row', ワンアームロウ: 'one arm db row', サイドプランク: 'side plank', プランク: 'plank',
}).sort((a, b) => b[0].length - a[0].length);
const CJK_WORD_RE = new RegExp(CJK_WORDS.map(([k]) => k).join('|'), 'g');
const CJK_WORD_TO = new Map(CJK_WORDS);

// Library names as the Chinese, Japanese and Malay screens show them, read back to the library's own name
// ("杠铃卧推" → "Barbell bench press"). The dictionaries are large (~400 KB), so they are loaded only when an
// import needs them: the first call of an import function starts the load (in the background), and
// `await foreignNamesReady` (or loadForeignNames()) waits for it.
let foreignRe = null;
const foreignTo = new Map(); // translated name (lower case) → library exercise
const foreignKey = s => String(s).normalize('NFKC').replace(/[・･]/g, '').toLowerCase().trim();
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
let foreignLoad = null;
/** Starts loading the Chinese, Japanese and Malay exercise names (once); resolves when they are in use. */
export const loadForeignNames = () => (foreignLoad ??= loadForeign());
/** A promise-like: awaiting it loads the names. Nothing is fetched until then or until an import runs. */
export const foreignNamesReady = { then: (ok, fail) => loadForeignNames().then(ok, fail) };
const loadForeign = () => Promise.all(['zh', 'ja', 'ms'].map(l => import(`./i18n/${l}.js`).then(m => m.default?.names || {}, () => ({}))))
  .then(dicts => {
    const english = new Set(EXERCISES.map(e => e.name.toLowerCase()));
    for (const ex of EXERCISES) for (const names of dicts) {
      const tr = names[plainText(ex.name)] ?? names[ex.name];
      if (typeof tr !== 'string') continue;
      const k = foreignKey(tr);
      // A translation spelled like an English name (Malay often keeps "Deadlift") adds nothing, and must not change English.
      if (k.length < 2 || english.has(k) || k === plainText(ex.name).toLowerCase() || foreignTo.has(k)) continue;
      foreignTo.set(k, ex);
    }
    // Longest first; Latin (Malay) names only as whole words.
    // Only Chinese and Japanese names are swapped inside longer text. Latin-script (Malay) names are mostly gym
    // English ("Cable fly"), so they match only as a whole name: "Reverse cable fly" must stay a rear-delt lift.
    const keys = [...foreignTo.keys()].filter(k => /[^\x00-\x7f]/.test(k)).sort((a, b) => b.length - a.length)
      .map(k => (/[a-z]/.test(k) ? String.raw`(?<![\p{L}\p{N}])${escRe(k)}(?![\p{L}\p{N}])` : escRe(k)));
    foreignRe = keys.length ? new RegExp(keys.join('|'), 'gu') : null;
  }, () => {});
/** The library exercise a whole name is the translation of, or null. */
const foreignExercise = name => foreignTo.get(foreignKey(name)) || null;
/** Lower-case text with Chinese, Japanese and Malay exercise names and words put into English. */
function toEnglish(s) {
  let t = s.toLowerCase();
  if (/[^\x00-\x7f]/.test(t)) t = t.normalize('NFKC').replace(/[・･]/g, '');
  if (foreignRe) t = t.replace(foreignRe, m => ` ${foreignTo.get(m).name.toLowerCase()} `);
  t = FOREIGN.reduce((a, [re, to]) => a.replace(re, to), t);
  return /[^\x00-\x7f]/.test(t) ? t.replace(CJK_WORD_RE, m => ` ${CJK_WORD_TO.get(m)} `) : t;
}
const norm = s => ALIASES.reduce((a, [re, to]) => a.replace(re, to), toEnglish(s)).replace(/[^a-z0-9 ]/g, ' ').replace(/\b([a-z]{2,}?)(es|s)\b/g, (w, st, suf) => (w.endsWith('ss') ? w : suf === 'es' && !/(ch|sh|x)$/.test(st) ? st + 'e' : st)).replace(/\s+/g, ' ').trim();
const squash = s => norm(s).replace(/ /g, '');
// Words that name the equipment, and words that don't change which lift it is.
// "Competition bench", "Bench press (BB)" and an Olympic bar are barbell lifts: never matched to a dumbbell one, or the other way round.
// (No prototype: a lift named "constructor…" must not find Object's own keys here.)
const EQUIP_WORD = { __proto__: null, db: 'db', machine: 'machine', cable: 'machine', rope: 'machine', smith: 'smith', barbell: 'barbell', bb: 'barbell', competition: 'barbell', comp: 'barbell', olympic: 'barbell', bw: 'bw', bodyweight: 'bw' };
// A body part in the logged name must be one the exercise trains: "Hamstring curl" is not "DB curl".
const BODY_WORD = { __proto__: null, hamstring: ['Hamstrings'], ham: ['Hamstrings'], leg: ['Quads', 'Hamstrings', 'Glutes', 'Calves'], bicep: ['Biceps'], triceps: ['Triceps'], tricep: ['Triceps'],
  calf: ['Calves'], glute: ['Glutes'], quad: ['Quads'], ab: ['Abs'], core: ['Abs'], lat: ['Back'], delt: ['Front delts', 'Side delts', 'Rear delts'], shoulder: ['Front delts', 'Side delts', 'Rear delts'], wrist: ['Forearms'], forearm: ['Forearms'], neck: ['Neck'] };
const SOFT = new Set(['flat', 'seated', 'standing', 'one', 'arm', 'hand', 'triceps', 'tricep', 'bicep', 'the', 'with', 'on', 'and']);
// "Bench press" and "Chest press" are one pattern; "bench" is folded into "chest" when matching.
// Unit words aren't part of a lift's name: "Pec deck (levels)" is the pec deck.
const keepTok = w => w.length > 1 && !/\d/.test(w) && !/^(kg|lb|level|lvl)$/.test(w);
const rawToks = s => norm(s).split(' ').filter(keepTok);
const toks = s => norm(s).replace(/\bbench\b/g, 'chest').split(' ').filter(keepTok);
const equipOf = (words, ex) => {
  const e = new Set(words.map(w => EQUIP_WORD[w]).filter(Boolean));
  if (ex) e.add(ex.equip === 'cable' ? 'machine' : ex.equip === 'bodyweight' ? 'bw' : ex.equip);
  return e;
};
/**
 * Best library match for an exercise name. Returns {ex, score} or null.
 * Every distinctive word of the library name must be in the logged name ("Bench press" is not "Bench dip";
 * "Abs curl" is not "Hammer curl"), the equipment must not contradict ("Barbell squat" is not "Smith squat";
 * cable and machine count as one), and a modifier such as "reverse" or "incline" must be on both sides.
 * Ties go to exercises in `prefer` (the programme), then to one whose unit fits `unit`.
 */
const WORKOUT_WORDS = new Set(['push', 'pull', 'legs', 'leg', 'chest', 'back', 'shoulders', 'shoulder', 'arms', 'arm', 'biceps', 'triceps', 'upper', 'lower', 'full', 'body', 'glutes', 'core', 'abs', 'cardio']);
const libCache = new Map(); // library names, tokenised once
/** Distinctive words two exercise names share ("Egyptian raises" / "DB lateral raise" -> 1). For loose suggestions. */
export function nameOverlap(a, b) {
  const x = new Set(toks(a).filter(w => !SOFT.has(w) && !EQUIP_WORD[w]));
  return toks(b).filter(w => x.has(w)).length;
}
export function matchExercise(name, exercises, { prefer = null, unit = null } = {}) {
  const aw = toks(name);
  const a = new Set(aw), ar = new Set(rawToks(name));
  if (!a.size) return null;
  const sq = rawToks(name).join('');
  const qEq = equipOf(aw);
  if (qEq.has('smith')) qEq.delete('machine'); // "Squat smith machine"
  // "Bench press 60kg" (a load in plain kilos, no equipment named) is the barbell bench, even when the programme
  // has the dumbbell one: 60 kg per dumbbell would double the load. With no unit known the programme still wins,
  // and kilos per dumbbell ("each") point to dumbbells.
  const plainBench = unit === 'kg' && ar.has('bench') && !qEq.size;
  let best = null;
  for (const ex of exercises) {
    let c = libCache.get(ex.name);
    if (!c) {
      // A note in brackets ("Plank (seconds as reps)") isn't part of the name; equipment in brackets is ("Overhead press (barbell)").
      const nm = ex.name.replace(/\(([^)]*)\)/g, (m, x) => (/barbell|dumb+el+|\bdb\b|cable|machine|smith|body ?weight/i.test(x) ? ` ${x} ` : ' '));
      const bw = toks(nm);
      libCache.set(ex.name, c = { sq: rawToks(ex.name).join(''), bw, b: new Set(bw), raw: new Set(rawToks(nm)) });
    }
    if (c.sq === sq) return { ex, score: 1 };
    const { bw, b } = c;
    const soft = w => SOFT.has(w) || EQUIP_WORD[w] || (w === 'chest' && b.has('fly'));
    if (![...b].every(w => soft(w) || a.has(w))) continue;
    if (MODIFIERS.some(w => a.has(w) !== b.has(w))) continue;
    if (qEq.size) { const cEq = equipOf(bw, ex); if (![...qEq].every(e => cEq.has(e))) continue; }
    if (ex.muscles?.length && aw.some(w => BODY_WORD[w] && !b.has(w) && !BODY_WORD[w].some(m => ex.muscles.includes(m)))) continue;
    let hit = 0;
    // Counted on the words as written, so "Bench press" is nearer "Flat DB bench press" than "Machine chest press".
    for (const w of ar) if (c.raw.has(w)) hit++;
    const key = [...b].filter(w => !soft(w)).length;
    if (!key) continue;
    let sc = 0.5 + 0.4 * hit / Math.max(a.size, b.size);
    if (prefer?.has(ex.id)) sc += 0.12; // the programme's own lifts win a close call
    if (unit && ex.unit === unit) sc += 0.03;
    if (unit === 'kg/DB' && ex.equip === 'db') sc += 0.1; // "20kg each": a dumbbell lift unless the name says otherwise
    if (plainBench && ex.equip === 'barbell') sc += 0.15;
    if (!best || sc > best.score) best = { ex, score: sc };
  }
  return best;
}

// ---- rewriting unusual logs into the forms the parser reads ------------------------------------------------------
const MON3 = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
const KGU = String.raw`(\d+(?:[.,]\d+)?\s*(?:kgs?|kilos?|lbs?|pounds?)(?:\s*each\b)?)`;
const REPW = String.raw`(?:reps?|repetitions?|ulangan|wdh\.?|repeticiones|répétitions)`;
const SETW = String.raw`(?:sets?|set|series|séries|sätze|satz)`;
// Set and rep words in Chinese, Japanese and Malay (with English), for the forms those logs use.
const SETU = String.raw`(?:组|組|セット|sets?\b)`;
const REPU = String.raw`(?:次|回|reps?\b|ulangan\b)`;
/**
 * Lines from chats, tables and other apps rewritten into forms the parser reads: chat prefixes become a
 * date line, table rows become "Name 60kg x 8 x 3", "8 reps @ 60kg" becomes "60kg x 8", and so on.
 * Exported for tests; parseLogText runs it first.
 */
export function normalizeLog(text, exercises = []) {
  const out = [];
  let lastChatDate = null, table = null;
  const known = n => exercises.length && !!matchExercise(n, exercises);
  // Full-width letters and digits ("６０ｋｇ×１０回", "：") become their plain forms first.
  let wasBlank = false;
  for (let l of String(text).normalize('NFKC').split(/\r\n|\r|\n/)) {
    if (l.length > 2000) l = l.slice(0, 2000); // keeps a long note, bounds the work per line
    // A run of blank lines means what one does (a break): the rest are skipped before any of the work below.
    const empty = !/\S/.test(l);
    if (empty && wasBlank) continue;
    wasBlank = empty;
    // Chat exports: "[21/09/2026, 18:02:11] Name: text" (iOS) or "21/09/2026, 18:02 - Name: text" (Android).
    const chat = l.match(/^\u200e?\[?(\d{1,2}[/.]\d{1,2}[/.]\d{2,4}),? \d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?\]?\s*(?:-\s*)?[^:]{1,40}:\s(.*)$/i);
    if (chat) {
      if (chat[1] !== lastChatDate) { out.push('', chat[1]); lastChatDate = chat[1]; }
      l = chat[2];
    }
    l = l.replace(/[\u00a0\u2007\u202f]/g, ' ')
      .replace(/^\s*#{1,6}\s+/, '')                                             // markdown headings
      .replace(/^\s*(?:[-*•◦▪☐☑✓✔]|\[[ xX]\])\s+/, '')                         // bullets and checkboxes
      .replace(/(\d)\s*(?:公斤|千克|キロ(?:グラム)?)/g, '$1kg')                    // "60公斤", "60キロ"
      .replace(/(?:片手|両手とも|单手|單手|每只|每隻|每边|每邊)\s*(\d+(?:\.\d+)?)\s*kg/g, ' $1kg each ')  // "片手12kg": per dumbbell
      .replace(/(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?/g, '$1')  // ISO timestamps
      .replace(/(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, (m, y, mo, d) => `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`)
      .replace(new RegExp(String.raw`\b(\d{1,2})-(${MON3})[a-z]*-(\d{2})\b`, 'gi'), (m, d, mo, y) => `${d} ${mo} 20${y}`)
      .replace(/^(\p{L}{2,9}\.?,?\s+)?(\d{1,2})\.(\d{1,2})\.(?=\s|$)/u, (m, w, d, mo) => `${w || ''}${d}/${mo}`)
      // "Mon 21/9 Push": a weekday in front of a short date
      .replace(WEEKDAY_BEFORE_DATE, '');
    // Tables: "| Bench press | 60kg | 8 | 3 |" or "Bench press | 3 | 8 | 60kg" under a header naming the columns.
    if ((l.match(/\|/g) || []).length >= 2 || (table && l.includes('|'))) {
      const cells = l.replace(/^\s*\||\|\s*$/g, '').split('|').map(c => c.trim());
      if (cells.every(c => /^:?-{2,}:?$/.test(c) || !c)) continue;
      const roles = cells.map(c => /^(exercise|lift|movement|name|übung|ejercicio|exercice)$/i.test(c) ? 'name' : /^(sets?|series|sätze)$/i.test(c) ? 'sets' : /^(reps?|repetitions|wdh)$/i.test(c) ? 'reps' : /^(weight|load|kg|lbs?|peso|gewicht|poids)$/i.test(c) ? 'w' : null);
      if (roles.includes('name') && roles.filter(Boolean).length >= 3) { table = roles; continue; }
      if (table) {
        const get = k => cells[table.indexOf(k)] ?? '';
        const w = get('w'), unit = /lb/i.test(w) || /lb/i.test(table.join()) ? 'lbs' : 'kg';
        const wn = (w.match(/\d+(?:[.,]\d+)?/) || [''])[0], r = (get('reps').match(/\d+/) || [''])[0], k = (get('sets').match(/\d+/) || ['1'])[0];
        if (get('name') && wn && r) { out.push(`${get('name')} ${wn}${unit} x ${r} x ${k}`); continue; }
      }
      l = cells.join(' ');
    } else if (table && !l.trim()) table = null;
    // Chinese and Japanese: a number before 组/セット counts sets, before 次/回 counts reps, and a bare ×N after
    // a rep count is sets. Each form is put as "R reps x N sets" first, then joined to its load, level (档, 目盛り)
    // or bodyweight (自重); with none of those the load stays unknown.
    if (/[　-鿿]/.test(l)) l = l
      .replace(/自重|徒手/g, ' BW ')
      .replace(/(\d)\s*、\s*(?=\d)/g, '$1,')
      .replace(/(\d{1,2})\s*档/g, ' L$1 ')
      .replace(/目盛り?\s*(\d{1,2})/g, ' L$1 ')
      .replace(/レベル\s*(\d{1,2})/g, ' L$1 ')
      // Timed holds: "60秒×3セット", "3セット×60秒", "1分×3", "左右30秒" (each side), "プランク 60秒". A minute is 60 seconds.
      .replace(/(\d{1,2})\s*分(?=\s*(?:[x×*]\s*\d|\d{1,2}\s*(?:组|組|セット)))/g, (m, n) => `${+n * 60}秒`)
      .replace(/(\d{1,3})\s*秒\s*[x×*]?\s*(\d{1,2})\s*(?:组|組|セット)|(\d{1,3})\s*秒\s*[x×*]\s*(\d{1,2})(?![\d.]|\s*(?:秒|次|回|kg))|(\d{1,2})\s*(?:组|組|セット)\s*[x×*]?\s*(\d{1,3})\s*秒/g,
        (m, a, b, c, d, k2, s2) => { const sec = a || c || s2, k = b || d || k2; return ` BW ${Array(Math.min(12, +k)).fill(sec).join(',')} `; })
      .replace(/左右\s*(\d{1,3})\s*秒/g, ' BW $1,$1 ')
      .replace(/^(?!.*(?:休憩|レスト|インターバル|休息))(\D*\S)\s*(\d{1,3})\s*秒\s*$/, '$1 BW $2')
      // "4组12次", "3组×10次", "4组，每组8次"
      .replace(/(\d{1,2})\s*(?:组|組|セット)\s*[x×*,、]?\s*(?:每组|各)?\s*[x×*]?\s*(\d{1,3})(?:\s*(?:次|回))?(?![\d.,]|\s*(?:kg|秒|s\b|x|×))/gi, ' $2 reps x $1 sets ')
      // "12次3组", "15回×3セット", "10回 3セット"
      .replace(/(\d{1,3})\s*(?:次|回)\s*[x×*,、]?\s*(\d{1,2})\s*(?:组|組|セット)/g, ' $1 reps x $2 sets ')
      // "12次×3", "10回×3"
      .replace(/(\d{1,3})\s*(?:次|回)\s*[x×*]\s*(\d{1,2})(?![\d.,]|\s*(?:kg|次|回))/gi, ' $1 reps x $2 sets ')
      .replace(new RegExp(String.raw`${KGU}\s*[x×*,@]?\s*(\d{1,3}) reps x (\d{1,2}) sets`, 'gi'), '$1 x $2 x $3')
      .replace(new RegExp(String.raw`(\d{1,3}) reps x (\d{1,2}) sets\s*[,@]?\s*${KGU}`, 'gi'), '$3 x $1 x $2')
      .replace(/\bL(\d{1,2})\s*[x×*,@:]?\s*(\d{1,3}) reps x (\d{1,2}) sets/g, 'L$1 x $2 x $3')
      .replace(/\bBW\s*[x×*]?\s*(\d{1,3}) reps x (\d{1,2}) sets/g, (m, r, k) => `BW ${Array(Math.min(12, +k)).fill(r).join(',')}`)
      // "自重 8回 6回 5回": a list of reps
      .replace(/\bBW\s+(\d{1,3}(?:\s*(?:次|回)?\s*[\s,]\s*\d{1,3})+)\s*(?:次|回)?/g, (m, list) => `BW ${list.match(/\d+/g).join(',')}`)
      // "60kg 3组" / "3セット" with no reps left: a set count.
      .replace(/(\d{1,2})\s*(?:组|組|セット)(?!\s*[x×*,、]?\s*(?:每组|各)?\s*[x×*]?\s*\d)/g, ' $1 sets ')
      .replace(/\s+/g, ' ').trim();
    // Every rewrite below needs a number: a line of chat or a remark without one skips them all.
    if (/\d/.test(l)) l = l
      // "60kg - 3 sets x 8 reps", "60kg 3 set x 8 ulangan"
      .replace(new RegExp(String.raw`${KGU}\s*[-–,:]?\s*(\d{1,2})\s*${SETW}\s*(?:x|of|×)\s*(\d{1,3})\s*(?:${REPW})?`, 'gi'), '$1 x $3 x $2')
      // "60kg 3 set 5 ulangan", "60kg 3 sets, 8 reps"
      .replace(new RegExp(String.raw`${KGU}\s*[-–,:]?\s*(\d{1,2})\s*${SETW}\s*,?\s*(\d{1,3})\s*${REPW}`, 'gi'), '$1 x $3 x $2')
      // "3 sets 8 reps 60kg", "3 sets of 8 reps with 60kg", "3 set, 5 ulangan, 60kg"
      .replace(new RegExp(String.raw`\b(\d{1,2})\s*${SETW}\s*,?\s*(?:of\s*|x\s*)?(\d{1,3})\s*${REPW}\s*,?\s*(?:@|at|with|x)?\s*${KGU}`, 'gi'), '$3 x $2 x $1')
      // "3 set, 5 ulangan" with no load: the load is unknown.
      .replace(new RegExp(String.raw`\b(\d{1,2})\s*${SETW}\s*,?\s*(?:of\s*|x\s*)?(\d{1,3})\s*${REPW}(?![\p{L}\d])`, 'giu'), (m, k, r) => (new RegExp(KGU, 'i').test(l) ? m : `${r} reps x ${k} sets`))
      // "Plank 3x60s", "3 x 60 seconds": seconds count as reps
      .replace(/\b(\d{1,2})\s*x\s*(\d{1,3})\s*(?:s|secs?|seconds?|saat)\b/gi, (m, k, sec) => (new RegExp(KGU, 'i').test(l) ? m : `BW ${Array(Math.min(12, +k)).fill(sec).join(',')}`))
      // "3 x 8 with 60 kilos"
      .replace(new RegExp(String.raw`\b(\d{1,2})\s*x\s*(\d{1,3})\s*(?:with|at)\s*${KGU}`, 'gi'), '$3 x $2 x $1')
      // "8 reps @ 60kg"
      .replace(new RegExp(String.raw`\b(\d{1,3})\s*${REPW}\s*(?:@|at|with|x)\s*${KGU}`, 'gi'), '$2 x $1')
      // "60kg for 8 reps"
      .replace(new RegExp(String.raw`${KGU}\s*for\s*(\d{1,3})\s*(?:${REPW})?`, 'gi'), '$1 x $2')
      // "Deadlift 100 kg: 5" (a single set after a colon)
      .replace(new RegExp(String.raw`${KGU}\s*:\s*(\d{1,3})\s*$`, 'i'), '$1 x $2')
      // "Plank 60s x 3": seconds count as reps
      .replace(/\b(\d{1,3})\s*(?:s|secs?|seconds)\s*x\s*(\d{1,2})\b/gi, (m, sec, k) => `BW ${Array(Math.min(12, +k)).fill(sec).join(',')}`)
      // "Pull-up BW x 8 x 3"
      .replace(/\b(bw|body ?weight)\s*x\s*(\d{1,3})\s*x\s*(\d{1,2})\b/gi, (m, b, r, k) => `${b} ${Array(Math.min(12, +k)).fill(r).join(',')}`)
      // Chinese, Japanese and Malay: "60kg×10回×3セット", "60kg 10次 3组", "80kg x 5 ulangan x 3 set"
      .replace(new RegExp(String.raw`${KGU}\s*[x×*]?\s*(\d{1,3})\s*${REPU}\s*[x×*,]?\s*(\d{1,2})\s*${SETU}`, 'gi'), '$1 x $2 x $3')
      // "3组×10次 60kg", "3セット 10回 60kg"
      .replace(new RegExp(String.raw`\b(\d{1,2})\s*(?:组|組|セット|set\b)\s*[x×*]?\s*(\d{1,3})\s*(?:次|回|ulangan\b)?\s*[,@]?\s*${KGU}`, 'gi'), '$3 x $2 x $1')
      // "60kg x 10 x 3セット": the set word is not needed
      .replace(new RegExp(String.raw`([x×*]\s*\d{1,3}\s*[x×*]\s*\d{1,2})\s*${SETU}`, 'gi'), '$1')
      // "60kg×10回", "60kg x 10 ulangan": the rep word is not needed
      .replace(/(\d)\s*(?:次|回|ulangan\b)/gi, '$1');
    // "Bench press 60 8 8 8": a known lift, a load and reps with no units at all.
    const bare = l.match(/^(\p{L}[\p{L} '()-]*?)\s+(\d{2,3}(?:[.,]\d+)?)\s+((?:\d{1,2}\s+)*\d{1,2})\s*$/u);
    if (bare && known(bare[1]) && bare[3].trim().split(/\s+/).every(r => +r > 0 && +r <= 30)) l = `${bare[1]} ${bare[2]}kg ${bare[3]}`;
    // "Squat 100kg" or "100kg" on its own line, then "5x5": the load belongs to those sets
    // (read apart, "5x5" alone would be taken as a bodyweight squat).
    const prev = out.length - 1;
    if (/^\s*\d{1,2}\s*x\s*\d{1,3}\s*$/i.test(l) && prev >= 0 && new RegExp(String.raw`(?:^|\s)${KGU}\s*$`, 'i').test(out[prev]) && !parseSetLine(out[prev])?.sets.length) {
      out[prev] = `${out[prev].trim()} ${l.trim()}`;
      continue;
    }
    out.push(l);
  }
  return out;
}

/**
 * Turn free text (pasted notes or PDF text) into sessions.
 * - A line with a date starts a session; other words on it become a session note
 *   (or the session name when no file name gives one).
 * - A line with sets adds them to the current exercise. Text before the sets can name the exercise;
 *   text after them is a remark: kept as a note, never an exercise.
 * - A line without sets names an exercise only when sets follow it and it doesn't read like a remark.
 *   Everything else ("Lazy", a remark wrapped onto its own line) is a note.
 */
export function parseLogText(text, exercises, { year = new Date().getFullYear(), sessionName = 'Imported', dateOrder = 'auto', lb = false, today = null } = {}) {
  loadForeignNames();
  const sessions = [];
  // impossible: set lines whose load or reps no real lift has (they are dropped below, and counted).
  let sess = null, ent = null, skipped = 0, impossible = 0;
  const tooBig = x => +x.w > MAX_KG || +x.r > MAX_REPS;
  const rows = [];
  let blank = true;
  const lines = normalizeLog(text, exercises);
  const order = dateOrder === 'auto' ? detectDateOrder(lines, { monthFirst: isCJK(lines.join('\n')) }) : dateOrder;
  for (const raw of lines) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (!l) { blank = true; continue; }
    // "Calves raises on 30 mar 2023" mentions a date; it doesn't start a session.
    const fd = findDateAt(l, year, order);
    // Nor is "50 kg: 10/10/10" a date: numbers right after a load are reps.
    const date = fd && !/\b(on|at|from|since|until|till|by|before|after|of|in|than|like)\s*$/i.test(l.slice(0, fd.index)) && !/\d\s*(kgs?|lbs?|kilos?)\s*[:\-–]?\s*$/i.test(l.slice(0, fd.index)) ? fd.iso : null;
    const si = parseSetLine(date ? l.replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/, '').replace(/^\s*\d{1,2}[/.]\d{1,2}\b(?![/.]\d)/, '') : l, { lb }); // a date is never a set: \"12/9\"
    rows.push({ l, date, si, kind: date && !si?.sets.length ? 'date' : si?.sets.length ? 'sets' : 'text', blank });
    blank = false;
  }
  const matchMemo = new Map();
  const exOf = n => { if (!matchMemo.has(n)) matchMemo.set(n, matchExercise(n, exercises)?.ex || null); return matchMemo.get(n); };
  const isKnown = n => !!exOf(n);
  // Exercise names start with a capital ("Bench press"); remarks usually don't ("next week", "pumping").
  const isRemarkish = (l, known) => PAIN_RE.test(l) || COMMENT_RE.test(l) || /\b(won'?t|cos|because|unable|should|will|maybe|tomorrow|yesterday)\b/i.test(l)
    || l.split(' ').length > 8 || !/^[A-Z]/.test(l) || (/^[A-Z]{2,4}$/.test(l) && !known);
  const nameLike = l => { const k = isKnown(splitName(l)[0]); return k || !isRemarkish(l, k); };
  const addNote = (e, t) => { e.note = (e.note ? e.note + ' · ' : '') + t; };
  // For a text row i: the first row after it that isn't a plain text line (or is a name-like line after a
  // blank one). Worked out once from the end, so a long run of chat or note lines isn't rescanned per line.
  let stops = null;
  const stopAfter = i => {
    if (!stops) {
      stops = new Int32Array(rows.length + 1);
      stops[rows.length] = rows.length;
      for (let k = rows.length - 1; k >= 0; k--) stops[k] = rows[k].kind === 'text' && !(rows[k].blank && nameLike(rows[k].l)) ? stops[k + 1] : k;
    }
    return stops[i + 1];
  };
  // Pain and set remarks go with the exercise; sleep, energy and general comments on their own line go with the session.
  // A remark that wrapped onto the next line ("... maybe 3" / "rir") is joined back to the one before it.
  let last = null; // {e} or {s}, plus the remark text so far
  // A remark can run on for thousands of lines (a pasted chat): only the new part, with a little of what came
  // before it for context ("no" / "pain"), is checked, so the work stays linear.
  const remark = (t, onSet = false, cont = false) => {
    let win = t;
    if (cont && last) {
      win = last.text.slice(-60) + ' ' + t;
      // Only the end of the remark is kept here (reading back a long joined string would copy it every line).
      last.text = (last.text + ' ' + t).slice(-200);
      if (last.e) last.e.note += ' ' + t; else sess.notes[sess.notes.length - 1] += ' ' + t;
    } else {
      if (ent && (onSet || hasPain(t) || !SESSION_RE.test(t))) { addNote(ent, t); last = { e: ent, text: t }; }
      else if (sess) { sess.notes.push(t); last = { s: sess, text: t }; }
      else return;
    }
    const tgt = last.e || last.s;
    if (!tgt.pain && hasPain(win)) tgt.pain = true;
    // As when the whole remark was read at once: the first "N rir" counts, else the first "failure"-like word.
    if (last.e && !last.rirNum) {
      const r = rirFrom(win);
      if (r != null && RIR_NUM_RE.test(win)) { last.e.rir = r; last.rirNum = true; }
      else if (r != null && !last.rir) { last.e.rir = r; last.rir = true; }
    }
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (sess && row.kind !== 'date') sess.lines++;
    if (row.kind === 'date') {
      sess = { date: row.date, name: sessionName, entries: [], notes: [], lines: 1 };
      let label = row.l.replace(CJK_HEAD_RE, (m, p) => ` ${CJK_PART[p]} day `).replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*|isnin|selasa|rabu|khamis|jumaat|sabtu|ahad)\b/gi, '').replace(/\b\d+(st|nd|rd|th)?\b/gi, '').replace(MONTH_RE, '').replace(/\s+/g, ' ').trim();
      // "push 1" under a file called "Monday Push 1" says nothing new.
      const known = new Set(sessionName.toLowerCase().split(/\W+/).concat('day', 'session', 'workout'));
      if (label.split(' ').every(w => known.has(w.toLowerCase()))) label = '';
      // "24 sept 2026 legs" written in the Push 2 note: the date line names the workout that was done.
      const lw = label.toLowerCase().split(' ').filter(w => !/^(day|and|n|deload)$/.test(w));
      if (label && sessionName !== 'Imported' && lw.length && lw.length <= 3 && lw.every(w => WORKOUT_WORDS.has(w)) && lw.some(w => !known.has(w))) {
        const words = lw.map(w => ({ leg: 'legs', arm: 'arms', shoulder: 'shoulders' })[w] || w);
        sess.name = words.map(w => w[0].toUpperCase() + w.slice(1)).join(words.length === 2 ? ' & ' : ' ').replace(/ & (\w)/, (m, c) => ' & ' + c.toLowerCase());
        if (/deload/i.test(label)) sess.notes.push('deload');
        label = '';
      }
      if (label) {
        if (sessionName === 'Imported' && label.length <= 30) sess.name = label.replace(/\b\w/g, c => c.toUpperCase());
        else sess.notes.push(label);
      }
      sessions.push(sess); ent = null; last = null;
      continue;
    }
    if (!sess) { skipped++; continue; }
    if (row.kind === 'sets') {
      const si = row.si;
      // An inline name must read like one ("Incline DB press 25 kg 8,8,8"), not a unit note ("80lbs or 36kg x8").
      const lead = si.before.replace(/\d+(?:[.,]\d+)?\s*(lbs?|pounds?|kgs?)\b/gi, '').replace(/\b(kg|kgs|lbs?|or|and|reps?|sets?|each|ea|x|@|bw|level|lvl)\b/gi, '').replace(/[^\p{L} '-]/gu, ' ').replace(/(^|\s)[-']+|[-']+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
      // Lowercase names count too ("lunges 10kg 10,10,8") when short and not a remark.
      const nameLike = /^\p{Lu}|^\p{Lo}/u.test(lead) || matchExercise(lead, exercises) || (lead.split(' ').length <= 4 && !PAIN_RE.test(lead) && !COMMENT_RE.test(lead) && !/\b(then|and|also|again|same|next|last|up to|drop)\b/i.test(lead));
      // Chinese and Japanese names are short: "デッド", "卧推".
      // Three-letter names ("Dip", "Row", "Fly") count when the library knows them.
      if ((lead.length >= 4 && /\p{L}{3}/u.test(lead) || /^\p{L}{3}$/u.test(lead) && isKnown(lead) || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]{2}/u.test(lead)) && nameLike) {
        const [n, extra] = splitName(lead);
        ent = newEnt(sess, n);
        if (extra) addNote(ent, extra);
      }
      if (!ent) ent = newEnt(sess, 'Unknown exercise');
      const before = ent.sets.length;
      // "Pull up bodyweight" / "65kg x8": the 65 is the lifter's body weight; "+3kg x6" is added load.
      const bwName = /\b(bw|body ?weight)\b/i.test(ent.exName) && si.unit !== 'L' && !/\+\s*\d/.test(row.l);
      // A bodyweight lift (or one the library doesn't know) logged "3x6" with no unit: 3 sets of 6, not 3 kg.
      // Sets with no load given ("3组×10次") on a bodyweight lift are at bodyweight.
      const lib = ent.exName === 'Unknown exercise' ? undefined : exOf(ent.exName);
      const bwLift = bwName || lib?.unit === 'bw';
      let got = si.sets;
      // "Assisted pull up -20kg x 8": the machine's help, kept negative (on other lifts the minus sign is dropped).
      const assist = ASSISTED_RE.test(ent.exName) && /(?:^|[\s(:])[-−]\s*\d/.test(row.l);
      if (si.bare && (bwLift || (lib === null && exercises.length && guessNewExercise(ent.exName, { loaded: false }).equip === 'bw'))) got = Array.from({ length: si.bare.k }, () => ({ w: 0, r: si.bare.r }));
      if (got.some(tooBig)) impossible++;
      const bwSets = got !== si.sets || (bwLift && got.every(s => s.w == null || s.w === 0));
      ent.sets.push(...got.map(s => ({ ...s, ...(bwName || bwSets ? { w: 0 } : assist && +s.w > 0 ? { w: -s.w } : {}), done: true })));
      if (bwName || bwSets) ent.unit = 'bw';
      if (si.unit && !ent.unit) ent.unit = si.unit;
      const after = si.after.replace(/^[,.;:\-–\s]+/, '');
      if (/[a-z]{2}|[^\x00-\x7f]{2}/i.test(after)) remark(ent.sets.length - before > 1 ? after : `set ${ent.sets.length}: ${after}`, true);
      else last = null;
      continue;
    }
    // "Chest day" / "胸の日" under the date, before any lift: the session's name (unless a file name gives one).
    const head = !sess.entries.length && headingOf(row.l);
    if (head) {
      if (sess.name === 'Imported') sess.name = head; else sess.notes.push(row.l);
      last = null;
      continue;
    }
    // A text line. Look past any further text lines: do sets follow before the next date?
    // A name-like line after a blank line starts a new block ("Pull up / No bar" then "Lat pulldown / L12 x6").
    const j = stopAfter(i);
    const setsFollow = j < rows.length && rows[j].kind === 'sets';
    const [n, extra] = splitName(row.l);
    const known = isKnown(n);
    const remarkish = isRemarkish(row.l, known);
    // A remark wrapped onto its own line has no blank line before it and follows a set that already had a remark.
    const prev = rows[i - 1];
    const wrapped = !row.blank && prev?.kind === 'sets' && (remarkish || /[a-z]{2}/i.test(prev.si.after));
    if (setsFollow && !wrapped && (known || !remarkish)) {
      ent = newEnt(sess, n); last = null;
      if (extra) addNote(ent, extra);
      // Lines between the name and its sets describe the set-up ("... L dip on" / "bench instead").
      for (let k = i + 1; k < j; k++) addNote(ent, rows[k].l);
      sess.lines += j - 1 - i;
      i = j - 1;
      continue;
    }
    // A lift named on its own with no sets ("Pull up" / "No bar"): skipped that day. A session note, not a set remark.
    if (row.blank && !wrapped && (known || !remarkish) && row.l.split(' ').length <= 6) {
      ent = null;
      sess.notes.push(row.l); last = { s: sess, text: row.l };
      continue;
    }
    // Continues the remark above: no blank line between, starts in lower case, and the one above didn't end a sentence.
    remark(row.l, false, !row.blank && !!last && /^[a-z0-9(]/.test(row.l) && !/[.!?]/.test(last.text.slice(-1)));
  }
  // Loads or reps past any real lift are typos or junk: those sets are dropped.
  for (const s of sessions) for (const e of s.entries) { e.exName = cleanText(e.exName); e.sets = e.sets.filter(x => !tooBig(x)); }
  let out = sessions.filter(s => s.entries.some(e => e.sets.length));
  for (const s of out) {
    s.entries = s.entries.filter(e => e.sets.length);
    for (const e of s.entries) {
      let m = matchExercise(e.exName, exercises);
      // "スクワット 80kg" / "Squat 80kg": a load with no equipment named is the barbell lift, not the bodyweight one.
      if (m?.ex.unit === 'bw' && e.unit !== 'bw' && e.sets.some(x => +x.w > 0)) {
        const loaded = matchExercise(e.exName + ' barbell', exercises.filter(x => x.unit !== 'bw'));
        if (loaded) m = loaded;
      }
      e.match = m?.ex.id || null;
    }
  }
  fixDateTypos(out);
  // As with CSV files: sessions dated after tomorrow can't have happened. Left out, and their lines counted.
  let future = 0;
  const tomorrow = today && validIso(today) ? isoOf(t(today) + DAY) : null;
  if (tomorrow) out = out.filter(s => (s.date > tomorrow ? (future += s.lines, false) : true));
  for (const s of sessions) delete s.lines;
  return { sessions: out, skipped, future, impossible, badYears: badYearsIn(text) };
}

// Day headings: "Chest day", "Push & pull day", and in Chinese and Japanese "胸の日", "脚の日", "背中トレ", "腿日".
const CJK_PART = { 胸: 'chest', 背中: 'back', 背: 'back', 脚: 'legs', 腿: 'legs', 足: 'legs', 肩: 'shoulders', 腕: 'arms', 手臂: 'arms', 腹: 'abs', 尻: 'glutes', 臀: 'glutes' };
const CJK_HEAD_RE = /(背中|手臂|[胸背脚腿足肩腕腹尻臀])(?:の日|の?トレ(?:ーニング)?|日|天|训练日?|訓練日?)/g;
const EN_HEAD_RE = /^(?:(?:push|pull|legs?|chest|back|shoulders?|arms?|upper(?: body)?|lower(?: body)?|full body|glutes?|core|abs|biceps|triceps)\s*(?:&|and|\+|n)?\s*)+(?:day|session|workout)$/i;
const titleCase = t => t.replace(/\b\w/g, c => c.toUpperCase());
/** A line that only names the day's workout ("Chest day", "胸の日") as a title, or null. */
function headingOf(l) {
  const t = l.replace(/[:：。.!！]+$/, '').trim();
  if (new RegExp(String.raw`^(?:${CJK_HEAD_RE.source})$`).test(t)) return titleCase(`${CJK_PART[t.match(CJK_HEAD_RE.source)[1]]} day`);
  return EN_HEAD_RE.test(t) ? titleCase(t.toLowerCase()) : null;
}

const DAY = 864e5;
const t = iso => Date.parse(iso + 'T00:00:00Z');
const isoOf = ms => new Date(ms).toISOString().slice(0, 10);
/**
 * A log kept in order sometimes has a mistyped date: "5 may 2022" between April and May 2023, or
 * "30 jan 2024" between 23 Dec 2024 and 6 Jan 2025. Such a date is moved when changing only its year
 * (by one) or only its month puts it between its neighbours, preferring the weekday the log is usually
 * kept on. The original is kept in `dateWas`. Sessions are in log order.
 */
export function fixDateTypos(list) {
  const n = list.length;
  if (n < 4 || n > 2000) return list; // ponytail: O(n²) run search; a log this long would freeze the phone (patience sort if it's ever needed)
  // Longest run of dates in order (not necessarily adjacent): everything else is out of place.
  const len = Array(n).fill(1), prev = Array(n).fill(-1);
  for (let i = 0; i < n; i++) for (let j = 0; j < i; j++) if (list[j].date <= list[i].date && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
  let end = len.lastIndexOf(Math.max(...len)); // on a tie, the run that reaches the end of the log
  const inOrder = new Set();
  for (; end >= 0; end = prev[end]) inOrder.add(end);
  if (inOrder.size < n * 0.7) return list; // not a log kept in date order
  const wd = Array(7).fill(0);
  for (const s of list) wd[new Date(t(s.date)).getUTCDay()]++;
  const top = wd.indexOf(Math.max(...wd));
  const usualDay = wd[top] >= n * 0.6 ? top : -1;
  const gaps = list.slice(1).map((s, i) => (t(s.date) - t(list[i].date)) / DAY).filter(g => g > 0).sort((a, b) => a - b);
  const typical = gaps[Math.floor(gaps.length / 2)] || 7;
  for (let i = 0; i < n; i++) {
    const s = list[i], d = t(s.date);
    const lo = i > 0 ? t(list[i - 1].date) : -Infinity;
    let hi = Infinity;
    for (let k = i + 1; k < n; k++) if (inOrder.has(k)) { hi = t(list[k].date); break; }
    // Suspicious: out of order, or far before the next entry and off the usual weekday.
    const odd = !inOrder.has(i) || d < lo || (hi - d > Math.max(typical * 6, 60) * DAY && usualDay >= 0 && new Date(d).getUTCDay() !== usualDay && i === 0);
    if (!odd) continue;
    const [y, m, dd] = s.date.split('-').map(Number);
    const cands = [];
    for (const yy of [y - 1, y + 1]) cands.push({ iso: mk(yy, m, dd), year: true });
    for (let mm = 1; mm <= 12; mm++) if (mm !== m) cands.push({ iso: mk(y, mm, dd), year: false });
    // At either end of the log only a nearby date is believable.
    const near = 60 * DAY, lo2 = lo === -Infinity ? hi - near : lo, hi2 = hi === Infinity ? lo + near : hi;
    const fit = cands.filter(c => c.iso && t(c.iso) > lo2 && t(c.iso) < hi2 && c.iso !== s.date)
      .map(c => ({ ...c, wd: usualDay >= 0 && new Date(t(c.iso)).getUTCDay() === usualDay }))
      .sort((a, b) => b.wd - a.wd || b.year - a.year || Math.abs(t(a.iso) - lo) - Math.abs(t(b.iso) - lo));
    if (!fit.length || (usualDay >= 0 && !fit[0].wd && fit.length > 1)) continue;
    s.dateWas = s.date;
    s.date = fit[0].iso;
  }
  return list;
}

/**
 * The same log exported twice (an older and a newer copy of one PDF) repeats sessions.
 * Keeps one session per date and name: the one with the most logged sets, newer file on a tie.
 */
export function dedupeSessions(list) {
  const best = new Map();
  for (const s of list) {
    const key = s.date + '|' + String(s.name).toLowerCase();
    const n = s.entries.reduce((a, e) => a + e.sets.length, 0);
    const cur = best.get(key);
    if (!cur || n > cur.n || (n === cur.n && (s.fileTime || 0) > (cur.s.fileTime || 0))) best.set(key, { s, n });
  }
  const kept = [...best.values()].map(x => x.s).sort((a, b) => a.date.localeCompare(b.date));
  return { sessions: kept, dropped: list.length - kept.length };
}
/** Pain mentioned, and not denied ("no pain", "no shoulder pain", "pain free"). */
export const hasPain = t => {
  const re = new RegExp(PAIN_RE.source, 'gi');
  let m;
  while ((m = re.exec(t))) {
    const before = t.slice(0, m.index).toLowerCase().split(/\s+/).filter(Boolean).slice(-3);
    const neg = before.some(w => /^(no|not|without|zero|never|didn'?t|doesn'?t|don'?t|dont|didnt|less|nothing|tak|tidak|tiada|takde|bukan)$/.test(w.replace(/[^a-z']/g, '')));
    // Chinese and Japanese denials: "不痛", "没有痛", "痛くない", "痛みなし".
    const cjkNeg = /(不|没有?|沒有?|无|無|毫无)\s*$/.test(t.slice(0, m.index)) || /^(く(な|ありません)|みな[しい]|み無|みはな|みがな|\s*(?:なし|無し|は?な[いし]|がな[いし]|ありません))/.test(t.slice(m.index + m[0].length));
    if (!neg && !cjkNeg && !/^\s*[- ]?(free|less|gone)\b/i.test(t.slice(m.index + m[0].length))) return true;
  }
  return false;
};
// English words, Chinese 痛/疼 (but 酸痛 is ordinary muscle soreness), Japanese 痛い/痛み/痛めた, Malay "sakit" (not "sakit otot").
// Japanese 違和感 (something feels off), 張り (tightness, as "tight"), しびれ/痺れ (numbness).
const PAIN_RE = /\b(?:pain|painful|hurt|hurts|hurting|ache|aching|achy|ping|pinged|pinging|twinge|tweak|tweaked|niggle|strain|strained|sore|tight|flared?|injur\w*|numb|clicking|popped)\b|(?<!酸)(?:疼痛|拉伤|拉傷|扭伤|扭傷|不舒服|[痛疼])|違和感|張り(?!切)|しびれ|痺れ|\bsakit\b(?!\s+otot)/i;
const COMMENT_RE = /\b(felt|feel|feels|feeling|tired|lazy|sleep|slept|heavy|easy|hard|strong|weak|good|bad|great|awful|hr|bpm|rpe|rir|pump|form|failure|failed|energy|sick|fever|dizzy|skipped|missed|didn'?t|couldn'?t|was|were|a bit|very|really)\b/i;
const SESSION_RE = /\b(slept|sleep|felt|feel|tired|energy|rpe|session|today|workout|gym|sick|fever)\b/i;

/** Guess target muscles from an exercise name, so imported exercises count toward the right muscles. First match wins. */
const MUSCLE_GUESS = [
  [/nordic|leg curl|ham(string)? curl|glute.?ham/, ['Hamstrings']],
  [/wrist|forearm|grip|farmer|gripper|dead ?hang/, ['Forearms']],
  // Neck work ("neck curl", "neck extension"), but a behind-the-neck press is a shoulder press.
  [n => /\bneck\b/.test(n) && !/press/.test(n), ['Neck']],
  [/behind the neck|btn press/, ['Front delts', 'Triceps']],
  [/snatch|clean|\bjerk/, ['Quads', 'Glutes', 'Hamstrings']],
  [/push press|thruster/, ['Front delts', 'Triceps', 'Quads']],
  [/trap.?bar|hex.?bar/, ['Quads', 'Glutes', 'Hamstrings']],
  // Glute work, but a triceps kickback stays triceps.
  [n => !/tricep/.test(n) && /hip thrust|bridge|frog|donkey|hip ext|(glute|cable|leg|hip|standing|machine) kick.?back/.test(n), ['Glutes', 'Hamstrings']],
  [n => !/tricep/.test(n) && /glute|abduct|clam|fire hydrant/.test(n), ['Glutes']],
  [/lateral|side raise|upright/, ['Side delts']],
  [/rear|reverse (?:\w+ )?(pec|fly|flye)|face ?pull/, ['Rear delts']],
  // "Abs curl" and "Cable abs crunch" are core work, not a biceps curl.
  [/\babs?\b|crunch|sit.?up/, ['Abs']],
  [/pushdown|push down|tricep|skull|dip|kickback|(overhead|oh) ext|close.?grip|jm press/, ['Triceps']],
  [/curl/, ['Biceps']],
  // Rows and pull-downs before chest: "Chest-supported row" trains the back.
  [/pull.?up|\bchin|pulldown|pull down|\blat\b/, ['Back', 'Biceps']],
  [/\brows?\b|rowing|shrug|back ext|hyperext/, ['Back']],
  [/shoulder|overhead press|ohp|military|arnold/, ['Front delts', 'Triceps']],
  [/fly|flye|pec deck|crossover/, ['Chest']],
  [/bench|chest|pec|push.?up|incline|decline/, ['Chest', 'Front delts', 'Triceps']],
  [/swing|kettlebell|kb /, ['Glutes', 'Hamstrings']],
  [/rdl|romanian|stiff|good ?morning|deadlift|hamstring/, ['Hamstrings', 'Glutes', 'Back']],
  [/squat|leg press|lunge|split|step.?up|hack|leg ext|quad|sissy/, ['Quads', 'Glutes']],
  [/calf|calves/, ['Calves']],
  [/crunch|plank|\babs?\b|sit.?up|leg raise|knee raise|core|oblique|dead ?bug|hollow|pallof|rollout/, ['Abs']],
];
export function guessMuscles(name) {
  loadForeignNames();
  // A library name in Chinese, Japanese or Malay: that exercise's own muscles.
  const lib = foreignExercise(String(name));
  if (lib?.muscles?.length) return lib.muscles.slice();
  const n = toEnglish(String(name));
  return (MUSCLE_GUESS.find(([t]) => (typeof t === 'function' ? t(n) : t.test(n))) || [0, []])[1].slice();
}

/** Units and equipment in the order the review sheets offer them. */
export const EQUIP_UNIT = { db: 'kg/DB', barbell: 'kg', smith: 'kg', machine: 'kg', cable: 'L', bw: 'bw' };
/**
 * A new exercise's set-up guessed from its name and how it was logged.
 * loaded: sets carried a weight (or, for a written plan, the lift is normally loaded).
 * unit: the unit the log used ('kg', 'kg/DB', 'L', 'bw'), when known.
 * Unknown lifts default to a barbell when loaded and to bodyweight when not, never to a machine.
 */
export function guessNewExercise(name, { loaded = true, unit = null } = {}) {
  const n = ' ' + String(name).toLowerCase() + ' ';
  let equip =
    /smith/.test(n) ? 'smith'
    : /\b(db|dbs|dumb+el+s?|dumbbells?|kettlebells?|kb)\b/.test(n) ? 'db'
    : /\b(cable|rope|pulley|crossover)\b|face ?pull|pushdown|push down/.test(n) ? 'cable'
    : /machine|pec deck|leg press|hack squat|pulldown|pull down|leg ext|leg curl|seated row|abduct|adduct|pendulum|belt squat|hammer strength|\bplate loaded/.test(n) ? 'machine'
    : /\b(bw|body ?weight|push.?ups?|pull.?ups?|chin.?ups?|dips?|plank|nordic|frog|hanging|sit.?ups?|burpees?|hollow|bridge|pistol|muscle.?ups?|inverted)\b/.test(n) ? 'bw'
    : /\b(barbell|bb|bar|ez|olympic|snatch|clean|jerk|deadlift|squat|bench|press|row|thrust)\b/.test(n) || loaded ? 'barbell'
    : 'bw';
  // How it was logged beats the name: levels are a cable or machine stack, "each" is dumbbells, no load is bodyweight.
  if (unit === 'L') equip = equip === 'machine' ? 'machine' : 'cable';
  else if (unit === 'kg/DB') equip = 'db';
  else if (unit === 'bw' || (!loaded && equip !== 'machine' && equip !== 'cable')) equip = 'bw';
  else if (loaded && equip === 'bw' && unit !== 'bw') equip = /\b(dips?|pull.?ups?|chin.?ups?|push.?ups?)\b/.test(n) ? 'bw' : 'barbell';
  const u = unit === 'L' ? 'L' : equip === 'machine' && unit !== 'kg' && /abduct|adduct|pec deck/.test(n) ? 'kg' : EQUIP_UNIT[equip] === 'L' && unit === 'kg' ? 'kg' : EQUIP_UNIT[equip];
  const big = equip === 'barbell' && /deadlift|squat|bench|press|row|clean|snatch|jerk|thrust/.test(n);
  return {
    unit: u, equip, inc: u === 'L' ? 1 : equip === 'machine' ? 5 : equip === 'db' ? 2 : 2.5, rest: big ? 150 : 90,
    muscles: guessMuscles(name), perGym: equip === 'machine' || equip === 'cable',
  };
}

function newEnt(sess, name) {
  const e = { exName: name.trim(), unit: null, sets: [], rir: null, pain: false, note: '' };
  sess.entries.push(e);
  return e;
}

// ---- PDF text via pdf.js (loaded on demand from cdnjs, cached by the service worker) ---------
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
// Subresource integrity (the values cdnjs publishes for 3.11.174): a changed file on the CDN is refused.
const PDFJS_SRI = 'sha512-q+4liFwdPC/bNdhUpZx6aXDx/h77yEQtn4I1slHydcbZK34nLaR3cAeYSJshoxIOq3mjEf7xJE8YWIUHMn+oCQ==';
const PDFJS_WORKER_SRI = 'sha512-BbrZ76UNZq5BhH7LL7pn9A4TKQpQeNCHOo65/akfelcIBbcVvYWOFQKPXIrykE3qZxYjmDX573oa4Ywsc7rpTw==';
const PDF_FAIL = 'Could not load the PDF reader. Check your connection and try again.';
function loadScript(src, integrity) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.integrity = integrity; s.crossOrigin = 'anonymous';
    s.onload = res; s.onerror = () => rej(new Error(PDF_FAIL));
    document.head.appendChild(s);
  });
}
/** The worker can't carry an integrity attribute, so it is fetched, checked against its hash, and run from a blob. */
let workerUrl = null;
async function verifiedWorker() {
  if (workerUrl) return workerUrl;
  const res = await fetch(PDFJS_WORKER, { mode: 'cors' }).catch(() => null);
  if (!res?.ok) throw new Error(PDF_FAIL);
  const buf = await res.arrayBuffer();
  const hash = 'sha512-' + btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-512', buf))));
  if (hash !== PDFJS_WORKER_SRI) throw new Error('The PDF reader failed its safety check, so it was not used. Try again later.');
  return (workerUrl = URL.createObjectURL(new Blob([buf], { type: 'text/javascript' })));
}
/**
 * Rebuild text lines from one PDF page's text items ({str, transform:[a,b,c,d,x,y]}).
 * - Notes apps often draw the same text twice at the same spot; the copy is dropped, otherwise
 *   "30kg x6" would read as "30kg x6 30kg x6" (two sets).
 * - A gap between lines clearly wider than the usual line spacing becomes a blank line, as in the
 *   original note, so the parser can tell a new exercise from a remark that wrapped.
 */
export function linesFromItems(items) {
  const rows = [], seen = new Set();
  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4], y = it.transform[5];
    const k = it.str + '@' + Math.round(x) + ',' + Math.round(y);
    if (seen.has(k)) continue;
    seen.add(k);
    let row = rows.find(r => Math.abs(r.y - y) <= 2);
    if (!row) rows.push(row = { y, h: Math.abs(it.transform[3]) || it.height || 0, parts: [] });
    row.parts.push({ x, s: it.str });
  }
  rows.sort((a, b) => b.y - a.y);
  const gaps = rows.slice(1).map((r, i) => rows[i].y - r.y).filter(g => g > 0).sort((a, b) => a - b);
  const step = gaps.length ? gaps[Math.floor(gaps.length / 4)] : 0; // a typical single-line step
  const out = [];
  rows.forEach((r, i) => {
    if (i && step && rows[i - 1].y - r.y > step * 1.6) out.push('');
    out.push(r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join(' ').replace(/\s+/g, ' ').trim());
  });
  return out;
}

/** Text of a PDF, page by page. onPage(done, total) reports progress; the event loop gets a turn between pages. */
export async function pdfToText(file, onPage) {
  await loadScript(PDFJS, PDFJS_SRI);
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = await verifiedWorker();
  const doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), disableFontFace: true, isEvalSupported: false }).promise;
  const out = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      out.push(...linesFromItems((await page.getTextContent()).items), '');
      page.cleanup();
      onPage?.(p, doc.numPages);
      await new Promise(r => setTimeout(r, 0));
    }
  } finally { await doc.destroy(); }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ---- files ----------------------------------------------------------------------------------
export async function download(name, text, type = 'text/plain') {
  if (globalThis.gimNative) return globalThis.gimNative.save(name, new Blob([text], { type }));
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
/** Share a file through Android's share sheet (Drive, WhatsApp, email…). Returns false if unsupported. */
export async function shareFile(name, text, type = 'application/json') {
  if (globalThis.gimNative) return globalThis.gimNative.share(name, new Blob([text], { type }));
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  return false;
}
export const readFile = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); });

/** One key per lift however it's spelled, so "Pull up", "Pullups" and "pull-up" import as one exercise. */
export const nameKey = name => [...new Set(norm(name).split(' ').filter(w => w && !/\d/.test(w)))].sort().join(' ');
