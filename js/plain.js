// Plain English on screen: in plain wording (the default for new lifters), shorthand and abbreviations are
// written out as words wherever they appear — screens, pop-ups, toasts, the rest timer. Only what's shown
// changes; stored data never does. Gym-terms mode keeps the compact notation.
// Every rule is safe to run twice (its output never matches again), so repeated passes change nothing.

// Everyday names first, the proper term in brackets so it's learned along the way.
const MUSCLE = [
  ['Front delts', 'Front shoulders (delts)'], ['Side delts', 'Side shoulders (delts)'], ['Rear delts', 'Rear shoulders (delts)'],
  ['Hamstrings', 'Back thighs (hamstrings)'], ['Quads', 'Front thighs (quads)'], ['Glutes', 'Bum (glutes)'],
  ['Triceps', 'Back of arms (triceps)'], ['Biceps', 'Front of arms (biceps)'], ['Abs', 'Belly (abs)'],
];

const RULES = [
  // "3×6–8" / "3 × 8–12": sets of a rep range; "5×5" in a plan name: sets of reps
  [/\b(\d{1,2})\s?×\s?(\d{1,3})–(\d{1,3})\b/g, '$1 sets of $2–$3 reps'],
  [/\b(\d)×(\d{1,2})\b/g, '$1 sets of $2'],
  // "× 8·8·6" after a load: reps per set
  [/\s?×\s?([\d?]{1,4}(?:·[\d?]{1,4})+)/g, (m, r) => `: ${r.split('·').join(', ')} reps`],
  [/\s?×\s?([\d?]{1,4})\b(?!\s?(?:sets?|reps?|,))/g, ': $1 reps'],
  [/\b(\d{1,4})·(?=\d)/g, '$1, '],
  // numbers with short units
  [/~\s?(\d)/g, 'about $1'],
  [/\b(\d+(?:\.\d+)?)(\+?)\s?min\b/g, '$1$2 minutes'],
  [/\b(\d+(?:\.\d+)?)(\+?)\s?h\b/g, '$1$2 hours'],
  [/\b(\d+) ex\b/g, '$1 exercises'],
  [/\s?\(kcal\)/g, ''], [/\bkcal\b/g, 'calories'],
  [/^\s*min\s*$/, 'minutes'], [/^\s*h\s*$/, 'hours'],
  [/(\d)\s?g\b/g, '$1 grams'], [/(\d)\s?L\b/g, '$1 litres'],
  [/\bea\b/g, 'each'],
  [/\bL(\d{1,2})\b/g, 'level $1'],
  [/\+(\d+) lvl\b/g, '+$1 levels'], [/\blvl\b/g, 'level'],
  // abbreviations in names and labels
  [/\bDBs?\b/g, 'Dumbbell'], [/\bBW\b/g, 'Bodyweight'], [/\bOHP\b/g, 'Overhead press'], [/\bRDL\b/g, 'Romanian deadlift'],
  [/★ PR\b/g, '★ Personal best'], [/\bPRs?\b/g, 'personal best'], [/\bLVL\b/g, 'Level'], [/\bLv(\d+)/g, 'level $1'],
  [/\bvs\b\.?/g, 'compared with'], [/\bapprox\b\.?/g, 'about'], [/\best\. /g, 'estimated '], [/\bEst\. /g, 'Estimated '],
  [/(?<!spreadsheet )\bCSV\b(?! \(|\))/g, 'spreadsheet (CSV)'], [/\bspreadsheet CSV\b/g, 'spreadsheet (CSV)'],
  [/\bSmith (?!machine)/g, 'Smith machine '],
  [/\bwork sets\b/g, 'sets'], [/\bworking sets?\b/g, m => (m.endsWith('s') ? 'sets' : 'set')],
  [/\b([Ss])essions\b/g, (m, s) => (s === 'S' ? 'Workouts' : 'workouts')], [/\b([Ss])ession\b/g, (m, s) => (s === 'S' ? 'Workout' : 'workout')],
  [/\b(\d)×(\d{1,2})\b/g, '$1 sets of $2'],
  [/\(cm\)/g, '(centimetres)'], [/\(in\)/g, '(inches)'],
  [/\bEZ-bar\b(?! \()/g, 'EZ-bar (curved bar)'],
];

/** One piece of text in plain English. */
export function plainText(s) {
  if (!s || !/[×·~\dA-Za-z]/.test(s)) return s;
  let t = s;
  for (const [re, to] of RULES) t = t.replace(re, to);
  for (const [a, b] of MUSCLE) t = t.replace(new RegExp(`\\b${a}\\b`, 'g'), b);
  return t;
}

const SKIP = 'input, textarea, select, script, style, .mono, pre, code, [data-raw], .bodysvg text';
const ATTRS = ['placeholder', 'aria-label', 'title'];
let plainOn = false, tr = null, obs = null;
// Text this pass already produced is left alone, so the English rules never run on a translation.
const done = new Set();
const conv = s => {
  if (done.has(s)) return s;
  let t = plainOn ? plainText(s) : s;
  if (tr) t = tr(t);
  if (t !== s) { if (done.size > 5000) done.clear(); done.add(t); }
  return t;
};

function walk(root) {
  if (root.nodeType === 3) { fix(root); return; }
  if (root.nodeType !== 1) return;
  if (root.matches(ATTRS.map(a => `[${a}]`).join())) fixAttrs(root);
  for (const el of root.querySelectorAll(ATTRS.map(a => `[${a}]`).join())) fixAttrs(el);
  if (root.closest?.(SKIP) && !root.closest('.bodysvg')) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) fix(n);
}
function fix(n) {
  const p = n.parentElement;
  if (!p || p.closest('noscript')) return;
  // Labels on the body map keep their gym shorthand in English, but are still translated.
  if (p.closest(SKIP)) { if (tr && p.closest('.bodysvg text')) { const t = tr(n.data); if (t !== n.data) n.data = t; } return; }
  const t = conv(n.data);
  if (t !== n.data) n.data = t;
}
// Placeholders, screen-reader labels and tooltips are words on screen too.
function fixAttrs(el) {
  if (el.closest('[data-raw]')) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const t = conv(v);
    if (t !== v) el.setAttribute(a, t);
  }
}

/** Turn the text pass on or off: plain English (plain wording) and/or a translation function (another language). */
export function setPlain(want, translate = null) {
  if (typeof document === 'undefined' || (want === plainOn && translate === tr)) return;
  plainOn = want; tr = translate;
  obs?.disconnect(); obs = null;
  if (!plainOn && !tr) return;
  walk(document.body);
  obs = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') fix(m.target);
      else if (m.type === 'attributes') fixAttrs(m.target);
      else for (const a of m.addedNodes) walk(a);
    }
  });
  obs.observe(document.body, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ATTRS });
}
