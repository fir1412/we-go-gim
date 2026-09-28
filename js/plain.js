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
  // "3×6–8" / "3 × 8–12": sets of a rep range
  [/\b(\d{1,2})\s?×\s?(\d{1,3})–(\d{1,3})\b/g, '$1 sets of $2–$3 reps'],
  // "× 8·8·6" after a load: reps per set
  [/\s?×\s?([\d?]{1,4}(?:·[\d?]{1,4})+)/g, (m, r) => `: ${r.split('·').join(', ')} reps`],
  [/\s?×\s?([\d?]{1,4})\b(?!\s?(?:sets?|reps?|,))/g, ': $1 reps'],
  [/\b(\d{1,4})·(?=\d)/g, '$1, '],
  // numbers with short units
  [/~\s?(\d)/g, 'about $1'],
  [/\b(\d+(?:\.\d+)?)\s?min\b/g, '$1 minutes'],
  [/\b(\d+(?:\.\d+)?)\s?h\b/g, '$1 hours'],
  [/\b(\d+) ex\b/g, '$1 exercises'],
  [/\bkcal\b/g, 'calories'],
  [/^\s*min\s*$/, 'minutes'], [/^\s*h\s*$/, 'hours'],
  [/(\d)\s?g\b/g, '$1 grams'], [/(\d)\s?L\b/g, '$1 litres'],
  [/\bea\b/g, 'each'],
  [/\bL(\d{1,2})\b/g, 'level $1'],
  // abbreviations in names and labels
  [/\bDBs?\b/g, 'Dumbbell'], [/\bBW\b/g, 'Bodyweight'], [/\bOHP\b/g, 'Overhead press'], [/\bRDL\b/g, 'Romanian deadlift'],
  [/★ PR\b/g, '★ Personal best'], [/\bPRs?\b/g, 'personal best'], [/\bLVL\b/g, 'Level'], [/\bLv(\d+)/g, 'level $1'],
  [/\bvs\b\.?/g, 'compared with'], [/\bapprox\b\.?/g, 'about'], [/\best\. /g, 'estimated '], [/\bEst\. /g, 'Estimated '],
  [/\bCSV\b(?! \(|\))/g, 'spreadsheet (CSV)'],
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
function walk(root) {
  if (root.nodeType === 3) { fix(root); return; }
  if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) fix(n);
}
function fix(n) {
  if (n.parentElement?.closest(SKIP)) return;
  const t = plainText(n.data);
  if (t !== n.data) n.data = t;
}

let on = false, obs = null;
/** Turn the plain-English pass on or off (plain wording on, gym terms off). */
export function setPlain(want) {
  if (want === on || typeof document === 'undefined') return;
  on = want;
  if (!on) { obs?.disconnect(); obs = null; return; }
  walk(document.body);
  obs = new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'characterData') fix(m.target);
      else for (const a of m.addedNodes) walk(a);
    }
  });
  obs.observe(document.body, { childList: true, characterData: true, subtree: true });
}
