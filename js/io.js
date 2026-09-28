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

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') inQ = false;
      else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

/** CSV (in our export format) -> parsed sessions [{date, name, entries:[{exName, unit, sets, rir, pain, note}]}] */
export function sessionsFromCSV(text) {
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('The file is empty.');
  // Accept common header spellings from other apps and hand-made sheets.
  const ALIAS = { day: 'date', when: 'date', 'exercise name': 'exercise', lift: 'exercise', movement: 'exercise', kg: 'weight', load: 'weight', 'weight kg': 'weight', rep: 'reps', repetitions: 'reps', notes: 'note', comment: 'note', comments: 'note', workout: 'session', 'workout name': 'session' };
  const head = rows[0].map(h => { const k = h.trim().toLowerCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim(); return ALIAS[k] || k; });
  const need = ['date', 'exercise', 'weight', 'reps'];
  const miss = need.filter(n => !head.includes(n));
  if (miss.length) throw new Error(`Missing column${miss.length > 1 ? 's' : ''}: ${miss.join(', ')}. Expected at least date, exercise, weight, reps.`);
  const ix = n => head.indexOf(n);
  const map = new Map();
  for (const r of rows.slice(1)) {
    const date = normDate(r[ix('date')]);
    if (!date) continue;
    const name = (ix('session') >= 0 && r[ix('session')]) || 'Imported';
    const key = date + '|' + name;
    if (!map.has(key)) map.set(key, { date, name, entries: [] });
    const sess = map.get(key);
    const exName = (r[ix('exercise')] || '').trim();
    if (!exName) continue;
    let ent = sess.entries.find(e => e.exName === exName);
    const cell = n => (ix(n) >= 0 ? String(r[ix(n)] ?? '').trim() : '');
    if (!ent) { ent = { exName, unit: ['kg', 'kg/DB', 'L', 'bw'].includes(cell('unit')) ? cell('unit') : '', sets: [], rir: null, pain: false, note: '' }; sess.entries.push(ent); }
    const num = v => { const x = String(v ?? '').replace(',', '.').replace(/\s*(kgs?|reps?)$/i, '').trim(); return x === '' || !isFinite(+x) ? null : +x; };
    const set = { w: num(cell('weight')), r: num(cell('reps')), done: cell('done') !== '0', ...(cell('warmup') === '1' ? { warm: true } : {}) };
    const k = Math.min(12, Math.max(1, Math.round(num(cell('sets')) || 1)));
    for (let i = 0; i < k; i++) ent.sets.push({ ...set });
    if (cell('rir')) ent.rir = cell('rir');
    const note = cell('note');
    if (cell('pain') === '1' || (note && PAIN_RE.test(note))) ent.pain = true;
    if (note && !ent.note.includes(note)) ent.note = ent.note ? ent.note + ' ' + note : note;
  }
  return [...map.values()];
}

// ---- dates ------------------------------------------------------------------------------
const MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const pad = n => String(n).padStart(2, '0');
function mk(y, m, d) {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 1990 && y < 2100)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCMonth() === m - 1 ? `${y}-${pad(m)}-${pad(d)}` : null;
}

/** Find a date in a line. Day-first for numeric dates (Malaysian/UK style). */
export function findDate(line, fallbackYear) {
  let m;
  if ((m = line.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) return mk(+m[1], +m[2], +m[3]);
  if ((m = line.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/))) return mk(+m[3], +m[2], +m[1]);
  if ((m = line.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?,?\s*(\d{4}|\d{2})?\b/i)))
    return mk(m[3] ? +m[3] : fallbackYear, MON[m[2].toLowerCase()], +m[1]);
  if ((m = line.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/i)))
    return mk(m[3] ? +m[3] : fallbackYear, MON[m[1].toLowerCase()], +m[2]);
  if ((m = line.match(/^\s*(\d{1,2})[/.](\d{1,2})\b(?![/.]\d)/))) return mk(fallbackYear, +m[2], +m[1]);
  return null;
}
export function normDate(v) { return v ? findDate(String(v), new Date().getFullYear()) : null; }

// ---- free-text log parser ------------------------------------------------------------------
const NUM = String.raw`(\d+(?:[.,]\d+)?)`;
/** Parse one line into sets, or null if it holds none. Returns {sets:[{w,r}], unit?, rest} */
export function parseSetLine(line) {
  let s = line.replace(/[×✕]/g, 'x').replace(/,(?=\d{3}\b)/g, '');
  const sets = [];
  let unit = null, m;
  const num = v => +String(v).replace(',', '.');
  if (/\b(bw|bodyweight)\b/i.test(s)) unit = 'bw';
  if (/\b(level|lvl|l)\s?\d/i.test(s)) unit = 'L';
  if (/\b(each|per (side|hand|db)|ea)\b|\bdbs?\b/i.test(s)) unit = unit || 'kg/DB';

  // "3x8 @ 25" / "4 x 6 @25kg" / "3 sets of 8 at 60kg"
  if ((m = s.match(new RegExp(String.raw`\b(\d{1,2})\s*(?:x|sets?\s*(?:of|x)?)\s*(\d{1,3})\s*(?:reps?)?\s*(?:@|at|with)\s*${NUM}`, 'i')))) {
    for (let i = 0; i < +m[1]; i++) sets.push({ w: num(m[3]), r: +m[2] });
    return { sets, unit, rest: s.replace(m[0], '') };
  }
  // "L9 x 12 x 3", "25kg x 8 x 4", "25 x 8"
  const re = new RegExp(String.raw`(?:\b(?:level|lvl|l)\s?)?${NUM}\s*(?:kgs?|kilos?)?\s*(?:each|ea)?\s*x\s*(\d{1,3})(?:\s*x\s*(\d{1,2}))?`, 'gi');
  let any = false;
  while ((m = re.exec(s))) {
    any = true;
    const w = num(m[1]), r = +m[2], k = m[3] ? +m[3] : 1;
    for (let i = 0; i < Math.min(k, 12); i++) sets.push({ w, r });
  }
  if (any) return { sets, unit, rest: s.replace(re, '') };
  // "25kg 8,8,6,6" / "25 kg: 8/8/8" / "L6: 15, 15"
  if ((m = s.match(new RegExp(String.raw`(?:\b(?:level|lvl|l)\s?)?${NUM}\s*(?:kgs?)?\s*(?:each|ea)?\s*[:\-–]?\s*((?:\d{1,3}\s*[,/;]\s*)+\d{1,3})`, 'i')))) {
    const w = num(m[1]);
    for (const r of m[2].split(/[,/;]/)) sets.push({ w, r: +r.trim() });
    return { sets, unit, rest: s.replace(m[0], '') };
  }
  // "15kg 8 8 7" / "45 kg 12" (needs the kg so plain numbers aren't mistaken for sets)
  if ((m = s.match(new RegExp(String.raw`${NUM}\s*kgs?\s*(?:each|ea)?\s*[:\-–]?\s*((?:\d{1,3}\s+)*\d{1,3})(?![\d.,]|\s*kg)`, 'i')))) {
    const w = num(m[1]);
    for (const r of m[2].trim().split(/\s+/)) sets.push({ w, r: +r });
    return { sets, unit, rest: s.replace(m[0], '') };
  }
  // "BW 6,6,6" / "bodyweight x 8"
  if (unit === 'bw' && (m = s.match(/((?:\d{1,3}\s*[,/;]\s*)*\d{1,3})\s*(?:reps?)?/))) {
    for (const r of m[1].split(/[,/;]/)) sets.push({ w: 0, r: +r.trim() });
    return { sets, unit, rest: s.replace(m[0], '') };
  }
  return null;
}

const MODIFIERS = ['reverse', 'incline', 'decline', 'close', 'wide', 'front', 'rear', 'single', 'hack', 'smith', 'romanian', 'overhead'];
// Plurals and spacing are ignored: "Pull ups" = "Pull-up", "Hammer curls" = "Hammer curl".
const norm = s => s.toLowerCase().replace(/\b(db|dumbbell)s?\b/g, 'db').replace(/[^a-z0-9 ]/g, ' ').replace(/\b([a-z]{2,}?)(es|s)\b/g, (w, st, suf) => (w.endsWith('ss') ? w : suf === 'es' && !/(ch|sh|x)$/.test(st) ? st + 'e' : st)).replace(/\s+/g, ' ').trim();
const squash = s => norm(s).replace(/ /g, '');
/** Best library match for an exercise name (token overlap). Returns {ex, score} or null. */
export function matchExercise(name, exercises) {
  const a = new Set(norm(name).split(' ').filter(w => w.length > 1));
  if (!a.size) return null;
  const sq = squash(name);
  let best = null;
  for (const ex of exercises) {
    if (squash(ex.name) === sq) return { ex, score: 1 };
    const b = new Set(norm(ex.name).split(' ').filter(w => w.length > 1));
    let hit = 0;
    for (const w of a) if (b.has(w)) hit++;
    let sc = hit / Math.max(a.size, b.size);
    // "Pec deck" is not "Reverse pec deck": a modifier on only one side halves the score.
    if (MODIFIERS.some(w => a.has(w) !== b.has(w))) sc *= 0.5;
    // On a tie, prefer the name that starts the same way ("Pull ups" -> Pull-up, not Face pull).
    if (!best || sc > best.score || (sc === best.score && sc > 0 && norm(ex.name).split(' ')[0] === norm(name).split(' ')[0])) best = { ex, score: sc };
  }
  return best && best.score >= 0.5 ? best : null;
}

/**
 * Turn free text (pasted notes or PDF text) into sessions.
 * Lines with a date start a new session; a line without sets that looks like a name starts an exercise;
 * lines with sets add to the current exercise; other text becomes a note.
 */
export function parseLogText(text, exercises, { year = new Date().getFullYear(), sessionName = 'Imported' } = {}) {
  const sessions = [];
  let sess = null, ent = null, skipped = 0;
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (const line of lines) {
    const date = findDate(line, year);
    const setInfo = parseSetLine(date ? line.replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/, '') : line);
    if (date && !(setInfo && setInfo.sets.length)) {
      sess = { date, name: sessionName, entries: [], notes: [] };
      const label = line.replace(/\b\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}\b/, '').replace(/[^A-Za-z0-9 ]/g, ' ').replace(/\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b/gi, '').replace(/\b\d+(st|nd|rd|th)?\b/gi, '').replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\b/gi, '').replace(/\s+/g, ' ').trim();
      if (label && label.length <= 30) sess.name = label.replace(/\b\w/g, c => c.toUpperCase());
      sessions.push(sess); ent = null;
      continue;
    }
    if (!sess) { skipped++; continue; }
    if (setInfo && setInfo.sets.length) {
      const namePart = setInfo.rest.replace(/\b(kg|kgs|reps?|sets?|each|ea|x|@|bw|level|lvl)\b/gi, '').replace(/[^A-Za-z ]/g, ' ').trim();
      if (namePart.length >= 4 && /[a-z]{3}/i.test(namePart)) ent = newEnt(sess, namePart);
      if (!ent) ent = newEnt(sess, 'Unknown exercise');
      ent.sets.push(...setInfo.sets.map(s => ({ ...s, done: true })));
      if (setInfo.unit && !ent.unit) ent.unit = setInfo.unit;
      continue;
    }
    const isPain = PAIN_RE.test(line), isComment = isPain || COMMENT_RE.test(line) || line.split(' ').length > 6;
    if (!isComment && /^[A-Za-z][A-Za-z0-9 ()'&/+-]{2,50}$/.test(line)) { ent = newEnt(sess, line); continue; }
    // Pain goes with the exercise it follows; sleep, effort and general comments go with the session.
    if (ent && (isPain || !SESSION_RE.test(line))) {
      ent.note = (ent.note ? ent.note + ' ' : '') + line;
      if (isPain) ent.pain = true;
    } else {
      sess.notes.push(line);
      if (isPain) sess.pain = true;
    }
  }
  const out = sessions.filter(s => s.entries.some(e => e.sets.length));
  for (const s of out) {
    s.entries = s.entries.filter(e => e.sets.length);
    for (const e of s.entries) { const m = matchExercise(e.exName, exercises); e.match = m?.ex.id || null; }
  }
  return { sessions: out, skipped };
}
const PAIN_RE = /\b(pain|painful|hurt|hurts|hurting|ache|aching|achy|ping|pinged|pinging|twinge|tweak|tweaked|niggle|strain|strained|sore|tight|flared?|injur\w*|numb|clicking|popped)\b/i;
const COMMENT_RE = /\b(felt|feel|feels|feeling|tired|lazy|sleep|slept|heavy|easy|hard|strong|weak|good|bad|great|awful|hr|bpm|rpe|rir|pump|form|failure|failed|energy|sick|fever|dizzy|skipped|missed|didn'?t|couldn'?t|was|were|a bit|very|really)\b/i;
const SESSION_RE = /\b(slept|sleep|felt|feel|tired|energy|rpe|session|today|workout|gym|sick|fever)\b/i;

/** Guess target muscles from an exercise name, so imported exercises count toward the right muscles. */
const MUSCLE_GUESS = [
  [/leg curl|ham(string)? curl|nordic/, ['Hamstrings']],
  [/lateral|side raise|upright/, ['Side delts']],
  [/rear|reverse (pec|fly)|face ?pull/, ['Rear delts']],
  [/pushdown|push down|tricep|skull|dip|kickback|(overhead|oh) ext|close.?grip/, ['Triceps']],
  [/curl/, ['Biceps']],
  [/shoulder|overhead press|ohp|military|arnold/, ['Front delts', 'Triceps']],
  [/fly|flye|pec deck|crossover/, ['Chest']],
  [/bench|chest|pec|push.?up|incline|decline/, ['Chest', 'Front delts', 'Triceps']],
  [/swing|kettlebell|kb /, ['Glutes', 'Hamstrings']],
  [/pull.?up|chin|pulldown|pull down|\blat\b/, ['Back', 'Biceps']],
  [/row|shrug|back ext/, ['Back']],
  [/rdl|romanian|stiff|good ?morning|deadlift|hamstring/, ['Hamstrings', 'Glutes', 'Back']],
  [/hip thrust|glute|bridge|abduct/, ['Glutes']],
  [/squat|leg press|lunge|split|step.?up|hack|leg ext|quad/, ['Quads', 'Glutes']],
  [/calf|calves/, ['Calves']],
  [/crunch|plank|\babs?\b|sit.?up|leg raise|core|oblique/, ['Abs']],
];
export function guessMuscles(name) {
  const n = String(name).toLowerCase();
  return (MUSCLE_GUESS.find(([re]) => re.test(n)) || [0, []])[1].slice();
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
export async function pdfToText(file) {
  await loadScript(PDFJS);
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    // rebuild lines from y positions
    const rows = new Map();
    for (const it of tc.items) {
      const y = Math.round(it.transform[5]);
      const key = [...rows.keys()].find(k => Math.abs(k - y) <= 2) ?? y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key).push({ x: it.transform[4], s: it.str });
    }
    for (const y of [...rows.keys()].sort((a, b) => b - a)) out.push(rows.get(y).sort((a, b) => a.x - b.x).map(i => i.s).join(' ').trim());
  }
  return out.filter(Boolean).join('\n');
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
