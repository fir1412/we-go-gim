// Import / export: CSV, JSON backup, and a forgiving parser for free-text workout logs (pasted or from PDF).

// ---- CSV ------------------------------------------------------------------------------
const CSV_COLS = ['date', 'session', 'exercise', 'unit', 'set', 'warmup', 'weight', 'reps', 'done', 'rir', 'pain', 'gym', 'note'];
const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export function toCSV(sessions, exById, gyms = []) {
  const gname = id => gyms.find(g => g.id === id)?.name || '';
  const rows = [CSV_COLS.join(',')];
  for (const s of [...sessions].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const e of s.entries || []) {
      const ex = exById[e.exId];
      let n = 0;
      for (const set of e.sets || []) {
        rows.push([s.date, s.name, ex?.name || e.exId, ex?.unit || '', set.warm ? 'W' : ++n, set.warm ? 1 : 0, set.w ?? '', set.r ?? '', set.done ? 1 : 0, e.rir ?? '', e.pain ? 1 : 0, gname(s.gymId), e.note || ''].map(q).join(','));
      }
    }
  }
  return rows.join('\n');
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
export function sessionsFromCSV(text, { lb = false, dateOrder = 'auto' } = {}) {
  const rows = parseCSV(String(text).replace(/^\uFEFF/, ''), csvDelimiter(text));
  if (!rows.length) throw new Error('The file is empty.');
  // Accept common header spellings from other apps and hand-made sheets.
  const ALIAS = {
    day: 'date', when: 'date', 'start time': 'date', 'exercise name': 'exercise', 'exercise title': 'exercise', lift: 'exercise', movement: 'exercise',
    kg: 'weight', load: 'weight', 'weight kg': 'weight', 'weight kgs': 'weight', 'weight lbs': 'weightlb', 'weight lb': 'weightlb', lbs: 'weightlb', lb: 'weightlb', pounds: 'weightlb',
    rep: 'reps', repetitions: 'reps', notes: 'note', comment: 'note', comments: 'note', 'exercise notes': 'note',
    workout: 'session', 'workout name': 'session', title: 'session', 'workout title': 'session', description: 'wnote', 'workout notes': 'wnote',
    'set type': 'settype', 'set order': 'setorder', 'set index': 'setindex', 'duration seconds': 'seconds', seconds: 'seconds', 'weight unit': 'wunit',
  };
  const head = rows[0].map(h => { const k = h.trim().toLowerCase().replace(/[()_]/g, ' ').replace(/\s+/g, ' ').trim(); return ALIAS[k] || k; });
  const has = n => head.includes(n);
  const miss = [['date', has('date')], ['exercise', has('exercise')], ['weight', has('weight') || has('weightlb')], ['reps', has('reps') || has('seconds')]].filter(x => !x[1]).map(x => x[0]);
  if (miss.length) throw new Error(`Missing column${miss.length > 1 ? 's' : ''}: ${miss.join(', ')}. Expected at least date, exercise, weight, reps.`);
  const ix = n => head.indexOf(n);
  const order = dateOrder === 'auto' ? detectDateOrder(rows.slice(1).map(r => r[ix('date')])) : dateOrder;
  const kgHeader = /kg/i.test(rows[0][ix('weight')] || '');
  const map = new Map();
  const num = v => { const x = String(v ?? '').replace(',', '.').replace(/\s*(kgs?|lbs?|reps?|s)$/i, '').trim(); return x === '' || !isFinite(+x) ? null : +x; };
  for (const r of rows.slice(1)) {
    const date = normDate(r[ix('date')], order);
    if (!date) continue;
    const cell = n => (ix(n) >= 0 ? String(r[ix(n)] ?? '').trim() : '');
    const name = cell('session') || 'Imported';
    const key = date + '|' + name;
    if (!map.has(key)) map.set(key, { date, name, entries: [], notes: [] });
    const sess = map.get(key);
    const wn = cell('wnote');
    if (wn && !sess.notes.includes(wn)) sess.notes.push(wn);
    const exName = cell('exercise');
    if (!exName) continue;
    // Pounds: its own column, a unit column that says so, or the whole file (opts.lb) when the column doesn't say kg.
    const lbRow = cell('weightlb') !== '' || /^(lbs?|pounds?)$/i.test(cell('wunit')) || (lb && !kgHeader && !/^kgs?$/i.test(cell('wunit')));
    let w = cell('weightlb') !== '' ? num(cell('weightlb')) : num(cell('weight'));
    let reps = num(cell('reps'));
    // Timed sets (a plank in Hevy or Strong): seconds count as reps.
    if (reps == null && num(cell('seconds'))) reps = num(cell('seconds'));
    // Cardio and distance rows have no load and no reps: nothing to log as a set.
    if (reps == null && w == null) continue;
    if (lbRow && w != null) w = lbToKg(w);
    let ent = sess.entries.find(e => e.exName === exName);
    if (!ent) { ent = { exName, unit: ['kg', 'kg/DB', 'L', 'bw'].includes(cell('unit')) ? cell('unit') : '', sets: [], rir: null, pain: false, note: '' }; sess.entries.push(ent); }
    const warm = cell('warmup') === '1' || /^warm/i.test(cell('settype')) || /^w$/i.test(cell('setorder'));
    const set = { w, r: reps, done: cell('done') !== '0', ...(warm ? { warm: true } : {}) };
    const k = Math.min(12, Math.max(1, Math.round(num(cell('sets')) || 1)));
    for (let i = 0; i < k; i++) ent.sets.push({ ...set });
    if (cell('rir')) ent.rir = cell('rir');
    // RPE 8 = about 2 reps left.
    else if (num(cell('rpe')) != null && !warm) ent.rir = String(Math.max(0, Math.round(10 - num(cell('rpe')))));
    const note = cell('note');
    if (cell('pain') === '1' || (note && hasPain(note))) ent.pain = true;
    if (note && !ent.note.includes(note)) ent.note = ent.note ? ent.note + ' ' + note : note;
  }
  return [...map.values()].filter(s => s.entries.length);
}

/** Pounds to kg, kept to 3 decimals so it shows back as the same number of pounds. */
export const lbToKg = v => Math.round(+v * 0.45359237 * 1000) / 1000;

// ---- dates ------------------------------------------------------------------------------
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
function mk(y, m, d) {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

// Whole month words only: "maybe 2 rir" is not 2 May, "4 decent reps" is not 4 December.
const MONTH = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
// A number followed by these is a set, not a day: "May 2 rir", "7.5 x8", "12.5 kg".
const NOT_DAY = String.raw`(?!\s*(?:x\s*\d|[x×]\b|reps?\b|sets?\b|rir\b|rpe\b|kgs?\b|lbs?\b|more\b|%|\.\d))`;
const RE_DMY = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)?\s+${MONTH}(?![a-z])(?:,?\s*(\d{4}|\d{2})\b)?`, 'i');
const RE_MDY = new RegExp(String.raw`\b${MONTH}(?![a-z])\s+(\d{1,2})(?:st|nd|rd|th)?\b${NOT_DAY}(?:,?\s*(\d{4})\b)?`, 'i');
const RE_DM = new RegExp(String.raw`^\s*(\d{1,2})[/.](\d{1,2})\b(?![/.]\d)${NOT_DAY}`);
export const MONTH_RE = new RegExp(String.raw`\b${MONTH}(?![a-z])`, 'gi');

/** Find a date in a line. Numeric dates are day first (Malaysian/UK style) unless order is 'mdy' (US). Returns {iso, index}. */
export function findDateAt(line, fallbackYear, order = 'dmy') {
  let m;
  const us = order === 'mdy';
  if ((m = line.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) return { iso: mk(+m[1], +m[2], +m[3]), index: m.index };
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
export function detectDateOrder(lines) {
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
  if (v3.mdy && !v3.dmy) return 'mdy';
  if (!v3.mdy && !v3.dmy && v2.mdy >= 2 && !v2.dmy) return 'mdy';
  return 'dmy';
}

// ---- free-text log parser ------------------------------------------------------------------
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
/**
 * Parse one line into sets, or null if it holds none.
 * Returns {sets:[{w,r}], unit?, before, after, rest}: `before` is text ahead of the first set (an inline
 * exercise name, e.g. "Incline DB press 25 kg 8,8,8"); `after` is text behind the sets (a remark).
 */
export function parseSetLine(line, { lb = false } = {}) {
  let s = line.replace(/[×✕]/g, 'x').replace(/,(?=\d{3}\b)/g, '');
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
  const bwRe = /\b(?:bw|body ?weigh\w*)\s*(\+\s*)?(\d+(?:[.,]\d+)?)?\s*(?:kgs?)?\s*x\s*(\d{1,3})\b/gi;
  let first = -1, last = 0;
  while ((m = bwRe.exec(s))) {
    if (first < 0) first = m.index;
    last = m.index + m[0].length;
    sets.push({ w: m[1] && m[2] ? num(m[2]) : 0, r: +m[3] });
  }
  if (sets.length) { unit = 'bw'; return out(first, last); }
  // "L9 x 12 x 3", "25kg x 8 x 4", "25 x 8", several per line: "50kg x3 55kg x3"
  const re = new RegExp(String.raw`(?:\b(?:level|lvl|l)\s?)?${NUM}\s*(?:kgs?|kilos?)?\s*(?:each|ea)?\s*x\s*(\d{1,3})(?:\s*x\s*(\d{1,2}))?\b`, 'gi');
  while ((m = re.exec(s))) {
    if (first < 0) first = m.index;
    last = m.index + m[0].length;
    const w = bwOnly ? 0 : num(m[1]), r = +m[2], k = m[3] ? +m[3] : 1;
    for (let i = 0; i < Math.min(k, 12); i++) sets.push({ w, r });
  }
  if (sets.length) return out(first, last);
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
function rirFrom(t) {
  let m;
  if ((m = t.match(/(\d)\s*\+?\s*rir|rir\s*(\d)/i))) return String(m[1] ?? m[2]);
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
];
const norm = s => ALIASES.reduce((a, [re, to]) => a.replace(re, to), s.toLowerCase()).replace(/[^a-z0-9 ]/g, ' ').replace(/\b([a-z]{2,}?)(es|s)\b/g, (w, st, suf) => (w.endsWith('ss') ? w : suf === 'es' && !/(ch|sh|x)$/.test(st) ? st + 'e' : st)).replace(/\s+/g, ' ').trim();
const squash = s => norm(s).replace(/ /g, '');
// Words that name the equipment, and words that don't change which lift it is.
// "Competition bench", "Bench press (BB)" and an Olympic bar are barbell lifts: never matched to a dumbbell one, or the other way round.
const EQUIP_WORD = { db: 'db', machine: 'machine', cable: 'machine', rope: 'machine', smith: 'smith', barbell: 'barbell', bb: 'barbell', competition: 'barbell', comp: 'barbell', olympic: 'barbell', bw: 'bw', bodyweight: 'bw' };
// A body part in the logged name must be one the exercise trains: "Hamstring curl" is not "DB curl".
const BODY_WORD = { hamstring: ['Hamstrings'], ham: ['Hamstrings'], leg: ['Quads', 'Hamstrings', 'Glutes', 'Calves'], bicep: ['Biceps'], triceps: ['Triceps'], tricep: ['Triceps'],
  calf: ['Calves'], glute: ['Glutes'], quad: ['Quads'], ab: ['Abs'], core: ['Abs'], lat: ['Back'], delt: ['Front delts', 'Side delts', 'Rear delts'], shoulder: ['Front delts', 'Side delts', 'Rear delts'], wrist: ['Biceps'] };
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
    if (!best || sc > best.score) best = { ex, score: sc };
  }
  return best;
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
export function parseLogText(text, exercises, { year = new Date().getFullYear(), sessionName = 'Imported', dateOrder = 'auto', lb = false } = {}) {
  const sessions = [];
  let sess = null, ent = null, skipped = 0;
  const rows = [];
  let blank = true;
  const lines = text.split(/\r?\n/);
  const order = dateOrder === 'auto' ? detectDateOrder(lines) : dateOrder;
  for (const raw of lines) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (!l) { blank = true; continue; }
    // "Calves raises on 30 mar 2023" mentions a date; it doesn't start a session.
    const fd = findDateAt(l, year, order);
    const date = fd && !/\b(on|at|from|since|until|till|by|before|after|of|in|than|like)\s*$/i.test(l.slice(0, fd.index)) ? fd.iso : null;
    const si = parseSetLine(date ? l.replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/, '').replace(/^\s*\d{1,2}[/.]\d{1,2}\b(?![/.]\d)/, '') : l, { lb }); // a date is never a set: \"12/9\"
    rows.push({ l, date, si, kind: date && !si?.sets.length ? 'date' : si?.sets.length ? 'sets' : 'text', blank });
    blank = false;
  }
  const matchMemo = new Map();
  const isKnown = n => { if (!matchMemo.has(n)) matchMemo.set(n, !!matchExercise(n, exercises)); return matchMemo.get(n); };
  // Exercise names start with a capital ("Bench press"); remarks usually don't ("next week", "pumping").
  const isRemarkish = (l, known) => PAIN_RE.test(l) || COMMENT_RE.test(l) || /\b(won'?t|cos|because|unable|should|will|maybe|tomorrow|yesterday)\b/i.test(l)
    || l.split(' ').length > 8 || !/^[A-Z]/.test(l) || (/^[A-Z]{2,4}$/.test(l) && !known);
  const nameLike = l => { const k = isKnown(splitName(l)[0]); return k || !isRemarkish(l, k); };
  const addNote = (e, t) => { e.note = (e.note ? e.note + ' · ' : '') + t; };
  // Pain and set remarks go with the exercise; sleep, energy and general comments on their own line go with the session.
  // A remark that wrapped onto the next line ("... maybe 3" / "rir") is joined back to the one before it.
  let last = null; // {e} or {s}, plus the remark text so far
  const remark = (t, onSet = false, cont = false) => {
    if (cont && last) {
      last.text += ' ' + t;
      if (last.e) last.e.note += ' ' + t; else sess.notes[sess.notes.length - 1] += ' ' + t;
    } else {
      if (ent && (onSet || hasPain(t) || !SESSION_RE.test(t))) { addNote(ent, t); last = { e: ent, text: t }; }
      else if (sess) { sess.notes.push(t); last = { s: sess, text: t }; }
      else return;
    }
    const tgt = last.e || last.s;
    if (hasPain(last.text)) tgt.pain = true;
    const r = last.e ? rirFrom(last.text) : null;
    if (r != null) last.e.rir = r;
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row.kind === 'date') {
      sess = { date: row.date, name: sessionName, entries: [], notes: [] };
      let label = row.l.replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi, '').replace(/\b\d+(st|nd|rd|th)?\b/gi, '').replace(MONTH_RE, '').replace(/\s+/g, ' ').trim();
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
      const lead = si.before.replace(/\d+(?:[.,]\d+)?\s*(lbs?|pounds?|kgs?)\b/gi, '').replace(/\b(kg|kgs|lbs?|or|and|reps?|sets?|each|ea|x|@|bw|level|lvl)\b/gi, '').replace(/[^A-Za-z ]/g, ' ').replace(/\s+/g, ' ').trim();
      // Lowercase names count too ("lunges 10kg 10,10,8") when short and not a remark.
      const nameLike = /^[A-Z]/.test(lead) || matchExercise(lead, exercises) || (lead.split(' ').length <= 4 && !PAIN_RE.test(lead) && !COMMENT_RE.test(lead) && !/\b(then|and|also|again|same|next|last|up to|drop)\b/i.test(lead));
      if (lead.length >= 4 && /[a-z]{3}/i.test(lead) && nameLike) {
        const [n, extra] = splitName(lead);
        ent = newEnt(sess, n);
        if (extra) addNote(ent, extra);
      }
      if (!ent) ent = newEnt(sess, 'Unknown exercise');
      const before = ent.sets.length;
      // "Pull up bodyweight" / "65kg x8": the 65 is the lifter's body weight; "+3kg x6" is added load.
      const bwName = /\b(bw|body ?weight)\b/i.test(ent.exName) && si.unit !== 'L' && !/\+\s*\d/.test(row.l);
      ent.sets.push(...si.sets.map(s => ({ ...s, ...(bwName ? { w: 0 } : {}), done: true })));
      if (bwName) ent.unit = 'bw';
      if (si.unit && !ent.unit) ent.unit = si.unit;
      const after = si.after.replace(/^[,.;:\-–\s]+/, '');
      if (/[a-z]{2}/i.test(after)) remark(ent.sets.length - before > 1 ? after : `set ${ent.sets.length}: ${after}`, true);
      else last = null;
      continue;
    }
    // A text line. Look past any further text lines: do sets follow before the next date?
    // A name-like line after a blank line starts a new block ("Pull up / No bar" then "Lat pulldown / L12 x6").
    let j = i + 1;
    while (j < rows.length && rows[j].kind === 'text' && !(rows[j].blank && nameLike(rows[j].l))) j++;
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
    remark(row.l, false, !row.blank && !!last && /^[a-z0-9(]/.test(row.l) && !/[.!?]$/.test(last.text));
  }
  const out = sessions.filter(s => s.entries.some(e => e.sets.length));
  for (const s of out) {
    s.entries = s.entries.filter(e => e.sets.length);
    for (const e of s.entries) { const m = matchExercise(e.exName, exercises); e.match = m?.ex.id || null; }
  }
  fixDateTypos(out);
  return { sessions: out, skipped };
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
  if (n < 4) return list;
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
    const neg = before.some(w => /^(no|not|without|zero|never|didn'?t|doesn'?t|don'?t|dont|didnt|less|nothing)$/.test(w.replace(/[^a-z']/g, '')));
    if (!neg && !/^\s*[- ]?(free|less|gone)\b/i.test(t.slice(m.index + m[0].length))) return true;
  }
  return false;
};
const PAIN_RE = /\b(pain|painful|hurt|hurts|hurting|ache|aching|achy|ping|pinged|pinging|twinge|tweak|tweaked|niggle|strain|strained|sore|tight|flared?|injur\w*|numb|clicking|popped)\b/i;
const COMMENT_RE = /\b(felt|feel|feels|feeling|tired|lazy|sleep|slept|heavy|easy|hard|strong|weak|good|bad|great|awful|hr|bpm|rpe|rir|pump|form|failure|failed|energy|sick|fever|dizzy|skipped|missed|didn'?t|couldn'?t|was|were|a bit|very|really)\b/i;
const SESSION_RE = /\b(slept|sleep|felt|feel|tired|energy|rpe|session|today|workout|gym|sick|fever)\b/i;

/** Guess target muscles from an exercise name, so imported exercises count toward the right muscles. First match wins. */
const MUSCLE_GUESS = [
  [/nordic|leg curl|ham(string)? curl|glute.?ham/, ['Hamstrings']],
  [/snatch|clean|\bjerk/, ['Quads', 'Glutes', 'Hamstrings']],
  [/push press|thruster/, ['Front delts', 'Triceps', 'Quads']],
  [/trap.?bar|hex.?bar/, ['Quads', 'Glutes', 'Hamstrings']],
  // Glute work, but a triceps kickback stays triceps.
  [n => !/tricep/.test(n) && /hip thrust|bridge|frog|donkey|hip ext|(glute|cable|leg|hip|standing|machine) kick.?back/.test(n), ['Glutes', 'Hamstrings']],
  [n => !/tricep/.test(n) && /glute|abduct|clam|fire hydrant/.test(n), ['Glutes']],
  [/lateral|side raise|upright/, ['Side delts']],
  [/rear|reverse (pec|fly)|face ?pull/, ['Rear delts']],
  [/pushdown|push down|tricep|skull|dip|kickback|(overhead|oh) ext|close.?grip|jm press/, ['Triceps']],
  [/curl/, ['Biceps']],
  [/shoulder|overhead press|ohp|military|arnold/, ['Front delts', 'Triceps']],
  [/fly|flye|pec deck|crossover/, ['Chest']],
  [/bench|chest|pec|push.?up|incline|decline/, ['Chest', 'Front delts', 'Triceps']],
  [/swing|kettlebell|kb /, ['Glutes', 'Hamstrings']],
  [/pull.?up|chin|pulldown|pull down|\blat\b/, ['Back', 'Biceps']],
  [/row|shrug|back ext|hyperext/, ['Back']],
  [/rdl|romanian|stiff|good ?morning|deadlift|hamstring/, ['Hamstrings', 'Glutes', 'Back']],
  [/squat|leg press|lunge|split|step.?up|hack|leg ext|quad|sissy/, ['Quads', 'Glutes']],
  [/calf|calves/, ['Calves']],
  [/crunch|plank|\babs?\b|sit.?up|leg raise|knee raise|core|oblique|dead ?bug|hollow|pallof|rollout/, ['Abs']],
];
export function guessMuscles(name) {
  const n = String(name).toLowerCase();
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
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load the PDF reader. Check your connection and try again.'));
    document.head.appendChild(s);
  });
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
  await loadScript(PDFJS);
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
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
export function download(name, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
/** Share a file through Android's share sheet (Drive, WhatsApp, email…). Returns false if unsupported. */
export async function shareFile(name, text, type = 'application/json') {
  const file = new File([text], name, { type });
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: name }); return true; }
  return false;
}
export const readFile = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(file); });

/** One key per lift however it's spelled, so "Pull up", "Pullups" and "pull-up" import as one exercise. */
export const nameKey = name => [...new Set(norm(name).split(' ').filter(w => w && !/\d/.test(w)))].sort().join(' ');
