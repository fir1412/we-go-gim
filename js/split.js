// Personalised split builder. Pure: answers in, programme out (same shape as PROGRAM in seed.js).
import { SET_WORK_SEC, TRANSITION_SEC, dedupeDays } from './engine.js';

/** Training patterns and the exercises that fill them, best first, per equipment level. */
const PATTERNS = {
  hpress:   { gym: ['bench', 'mchest', 'incline'], db: ['bench', 'incline'], home: ['pushup', 'declpush'] },
  ipress:   { gym: ['incline', 'mchest', 'bench'], db: ['incline', 'bench'], home: ['declpush', 'pushup'] },
  vpress:   { gym: ['shp', 'mshp'], db: ['shp'], home: ['pikepush'] },
  vpull:    { gym: ['pulldown', 'pullup', 'chinup'], db: ['pullup', 'chinup'], home: ['chinup', 'pullup'] },
  hrow:     { gym: ['csrow', 'cablerow', 'dbrow'], db: ['dbrow'], home: ['invrow'] },
  squat:    { gym: ['squat', 'legpress', 'hacksquat', 'goblet'], db: ['goblet', 'bss'], home: ['bwsquat', 'bwsplit'] },
  legpress: { gym: ['legpress', 'hacksquat', 'goblet'], db: ['bss', 'goblet'], home: ['bwsplit', 'bwsquat'] },
  lunge:    { gym: ['bss', 'lunge'], db: ['bss', 'lunge'], home: ['bwsplit', 'bwlunge'] },
  hinge:    { gym: ['rdl', 'hipthrust', 'dbrdl'], db: ['dbrdl'], home: ['glutebridge'] },
  legcurl:  { gym: ['legcurl', 'lyingcurl'], db: ['slidecurl'], home: ['slidecurl'] },
  legext:   { gym: ['legext'], db: [], home: [] },
  calf:     { gym: ['calf'], db: ['bwcalf'], home: ['bwcalf'] },
  lateral:  { gym: ['lat', 'dblat'], db: ['dblat'], home: [] },
  reardelt: { gym: ['rdelt', 'facepull', 'dbreardelt'], db: ['dbreardelt'], home: ['ytraise'] },
  fly:      { gym: ['fly', 'dbfly'], db: ['dbfly'], home: [] },
  biceps:   { gym: ['inccurl', 'preacher', 'hammer', 'ezcurl'], db: ['inccurl', 'hammer'], home: [] },
  triceps:  { gym: ['pushdown', 'ohext', 'dbskull'], db: ['dbohext', 'dbskull', 'benchdip'], home: ['benchdip'] },
  abs:      { gym: ['crunch', 'hlr', 'revcrunch'], db: ['revcrunch'], home: ['revcrunch'] },
};
// When every option for a pattern is ruled out (usually a protected joint), train the same area another way.
const FALLBACK = { hinge: 'legcurl', vpress: 'ipress', squat: 'legpress', lunge: 'hinge' };

// Exercises to leave out for joints the user wants to protect.
export const AVOID = {
  lowerback: ['rdl', 'smithdl', 'squat', 'hipthrust', 'dbrdl'],
  shoulders: ['shp', 'mshp', 'pikepush', 'benchdip', 'cgb', 'declpush', 'ohext', 'dbohext'],
  knees: ['bss', 'lunge', 'legext', 'squat', 'hacksquat', 'bwsplit', 'bwlunge'],
};

const COMPOUND = new Set(['hpress', 'ipress', 'vpress', 'vpull', 'hrow', 'squat', 'legpress', 'lunge', 'hinge']);
const HIGH_REP = new Set(['lateral', 'calf', 'reardelt', 'abs']);
const LIGHT = new Set(['goblet', 'bss', 'lunge']);
const ORDER = { fly: 1, legcurl: 1, legext: 1, lateral: 2, reardelt: 2, triceps: 3, biceps: 3, calf: 4, abs: 5 };

/** Day templates, patterns in priority order (compounds first). "pat:1" picks the next option so a day doesn't repeat itself;
 *  "a|b" uses a the first time the day comes round in a week and b the second. */
const DAYS = {
  push:  { name: 'Push', sub: 'Chest, shoulders, triceps', color: 'push', p: ['hpress', 'ipress', 'vpress', 'lateral', 'triceps', 'fly', 'triceps:1'] },
  pull:  { name: 'Pull', sub: 'Back, rear delts, biceps', color: 'pull', p: ['vpull', 'hrow', 'reardelt', 'biceps', 'hrow:1', 'biceps:1'] },
  legs:  { name: 'Legs', sub: 'Quads, hamstrings, calves', color: 'legs', p: ['squat', 'hinge', 'legpress', 'legcurl', 'calf', 'legext', 'abs'] },
  upper: { name: 'Upper', sub: 'Chest, back, shoulders, arms', color: 'upper', p: ['hpress', 'hrow', 'vpull', 'vpress|ipress', 'lateral', 'biceps', 'triceps', 'reardelt'] },
  lower: { name: 'Lower', sub: 'Squat, hinge, calves, core', color: 'legsb', p: ['squat', 'hinge', 'lunge', 'legcurl', 'calf', 'abs'] },
  fullA: { name: 'Full body A', sub: 'Squat, push, pull', color: 'arms', p: ['squat', 'hpress', 'vpull', 'legcurl', 'lateral', 'calf', 'abs'] },
  fullB: { name: 'Full body B', sub: 'Hinge, shoulders, row', color: 'upper', p: ['hinge', 'vpress', 'hrow', 'lunge', 'triceps', 'biceps', 'reardelt'] },
  fullC: { name: 'Full body C', sub: 'Legs, incline, row', color: 'legs', p: ['legpress', 'ipress', 'hrow:1', 'hinge:1', 'lateral', 'calf', 'abs'] },
};

// Which muscles each day type may add work for when the week is short of sets.
const TRAINS = {
  push: ['Chest', 'Front delts', 'Side delts', 'Triceps'], pull: ['Back', 'Rear delts', 'Biceps', 'Side delts'],
  // Small shoulder muscles recover fast, so they can finish a leg day too.
  legs: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Side delts', 'Rear delts'], lower: ['Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs', 'Side delts', 'Rear delts'],
  upper: ['Chest', 'Back', 'Front delts', 'Side delts', 'Rear delts', 'Biceps', 'Triceps'],
};
const dayTrains = (type, m) => type.startsWith('full') || (TRAINS[type] || []).includes(m);
// Patterns that add direct work for a muscle, best first.
const FOR_MUSCLE = {
  Chest: ['fly', 'hpress', 'ipress'], Back: ['hrow', 'vpull'], Quads: ['legext', 'legpress', 'squat'], Hamstrings: ['legcurl', 'hinge'],
  Glutes: ['hinge', 'lunge'], 'Side delts': ['lateral'], 'Rear delts': ['reardelt'], Biceps: ['biceps'], Triceps: ['triceps'], Calves: ['calf'], Abs: ['abs'],
};

/** Which day types, in order, for a number of training days. Home plans stay full-body or upper/lower: bodyweight alone can't fill a push, pull or legs day. */
export function templateFor(n, experience, equipment = 'gym') {
  if (n <= 1) return ['fullA'];
  if (n === 2) return ['fullA', 'fullB'];
  if (n === 3) return experience === 'experienced' && equipment !== 'home' ? ['push', 'pull', 'legs'] : ['fullA', 'fullB', 'fullC'];
  if (n === 4) return ['upper', 'lower', 'upper', 'lower'];
  if (equipment === 'home') return n === 5 ? ['upper', 'lower', 'fullC', 'upper', 'lower'] : ['upper', 'lower', 'upper', 'lower', 'upper', 'lower'];
  if (n === 5) return ['push', 'pull', 'legs', 'upper', 'lower'];
  return ['push', 'pull', 'legs', 'push', 'pull', 'legs'];
}

/** Rep ranges for bodyweight moves, where load isn't the lever. */
const BW_REPS = {
  pullup: [5, 10], chinup: [5, 10], pushup: [8, 20], declpush: [8, 15], pikepush: [6, 12], invrow: [8, 15], bwsquat: [15, 25],
  bwsplit: [10, 15], bwlunge: [10, 15], glutebridge: [12, 20], slidecurl: [8, 12], bwcalf: [10, 20], benchdip: [8, 15],
  ytraise: [10, 15], revcrunch: [10, 20], hlr: [8, 15],
};

function repsFor(goal, experience, role, pat, ex) {
  if (ex.unit === 'bw') {
    const r = BW_REPS[ex.id] || [8, 15];
    return goal === 'strength' && (ex.id === 'pullup' || ex.id === 'chinup') ? [4, 8] : r;
  }
  if (role === 'main') {
    if (goal === 'strength') return experience === 'new' ? [5, 8] : [4, 6];
    return goal === 'general' ? [8, 12] : [6, 10];
  }
  if (role === 'compound') return goal === 'strength' && !LIGHT.has(ex.id) ? [6, 8] : [8, 12];
  if (HIGH_REP.has(pat)) return [12, 20];
  return goal === 'strength' ? [8, 12] : [10, 15];
}

const setSec = ex => (ex.rest || 90) + SET_WORK_SEC;
/** Planned minutes for a day, the same way Today estimates it before you have history: rest + work per set, plus changeovers. */
export function dayMinutes(day, exById) {
  let sec = 0;
  day.slots.forEach((s, i) => { const ex = exById[s.exId]; if (ex) sec += s.sets * setSec(ex) + (i ? TRANSITION_SEC : 0); });
  return Math.round(sec / 60);
}

/** Weekly hard sets per muscle. The first listed muscle counts fully; helper muscles count half. */
export function weeklyVolume(program, exById) {
  const t = {};
  for (const d of program.days) for (const s of d.slots) {
    (exById[s.exId]?.muscles || []).forEach((m, i) => { t[m] = (t[m] || 0) + (i ? s.sets / 2 : s.sets); });
  }
  return t;
}

/** The usual weekly minimum for a muscle at this experience level. */
export const baseSets = experience => (experience === 'new' ? 6 : experience === 'experienced' ? 10 : 8);

/** Weekly set targets [min, max] per muscle for these answers. */
export function targetsFor(answers) {
  const a = { experience: 'some', focus: [], ...answers };
  const base = baseSets(a.experience);
  const out = {};
  for (const m of Object.keys(FOR_MUSCLE)) {
    let lo = m === 'Abs' ? Math.min(base, 4) : m === 'Calves' || m === 'Rear delts' ? Math.min(base, 6) : base;
    let hi = 20;
    if (a.focus.includes(m)) { lo += 4; hi += 4; }
    out[m] = [lo, hi];
  }
  return out;
}

/** The training weekdays the plan really uses: whole numbers 0–6 (strings accepted), no repeats, Monday first,
 *  1 to 6 of them (no days picked means Monday; a seventh day is left for rest). */
const trainingDows = days => {
  const d = [...new Set((Array.isArray(days) ? days : []).map(Number))].filter(x => Number.isInteger(x) && x >= 0 && x <= 6)
    .sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)).slice(0, 6);
  return d.length ? d : [1];
};

const norm = answers => {
  const a = { goal: 'muscle', days: [1, 3, 5], experience: 'some', minutes: 60, equipment: 'gym', focus: [], protect: [], ...answers };
  a.equipment = ['gym', 'db', 'home'].includes(a.equipment) ? a.equipment : 'gym';
  a.focus = a.focus || []; a.protect = a.protect || [];
  return a;
};

/**
 * answers: {goal, days:[dow…], experience:'new'|'some'|'experienced', minutes, equipment:'gym'|'db'|'home',
 *           focus:[muscle…], protect:['lowerback'|'shoulders'|'knees']}
 * exById: exercise library by id. Returns {id, days:[{dow,name,sub,color,slots}]}.
 * Each session is kept inside the chosen time; then sets are added where the week is short, while there's time.
 */
export function buildSplit(answers, exById) {
  const a = norm(answers);
  const dows = trainingDows(a.days);
  const types = templateFor(dows.length, a.experience, a.equipment);
  const avoid = new Set(a.protect.flatMap(p => AVOID[p] || []));
  const eq = a.equipment;
  const budget = (+a.minutes >= 75 ? 80 : +a.minutes || 60) * 60;
  const isNew = a.experience === 'new', short = +a.minutes <= 30;
  const ok = id => exById[id] && !avoid.has(id);
  const seenType = {};
  const secOf = slots => slots.reduce((t, s, i) => t + s.sets * setSec(exById[s.exId]) + (i ? TRANSITION_SEC : 0), 0);

  const days = types.map((type, i) => {
    const t = DAYS[type];
    const round = (seenType[type] = (seenType[type] || 0) + 1) - 1;
    const used = new Set(), slots = [];
    let compounds = 0;
    for (const spec of t.p) {
      const alts = spec.split('|');
      let [pat, altStr] = alts[Math.min(round, alts.length - 1)].split(':');
      let pool = (PATTERNS[pat]?.[eq] || []).filter(id => ok(id) && !used.has(id));
      if (!pool.length && FALLBACK[pat]) { pat = FALLBACK[pat]; pool = (PATTERNS[pat]?.[eq] || []).filter(id => ok(id) && !used.has(id)); }
      if (!pool.length) continue;
      const id = pool[((+altStr || 0) + (alts.length > 1 ? 0 : round)) % pool.length];
      const ex = exById[id];
      const comp = COMPOUND.has(pat);
      // Heavy low-rep work suits lifts you can load and set up safely; a goblet squat or split squat runs out of dumbbell first.
      const role = comp && compounds < 2 && !LIGHT.has(id) && ex.unit !== 'bw' ? 'main' : comp ? 'compound' : 'acc';
      // Short sessions: two sets beyond the first two big lifts, so there's room for more than three exercises.
      // Full-body days cover everything, so small muscles start at 2 sets and the week's gaps decide where extra sets go.
      let sets = comp && (compounds < 2 || !short) ? 3 : isNew || short || (!comp && type.startsWith('full')) ? 2 : 3;
      if (role === 'main' && compounds === 0 && a.experience === 'experienced') sets = 4;
      const [lo, hi] = repsFor(a.goal, a.experience, role, pat, ex);
      const slot = { exId: id, sets, lo, hi, group: '' };
      // Fit the time: try as planned, then with 2 sets; otherwise skip (a later, shorter exercise may still fit).
      while (secOf([...slots, slot]) > budget && slot.sets > 2) slot.sets--;
      if (secOf([...slots, slot]) > budget) continue;
      used.add(id);
      if (comp) compounds++;
      slots.push(slot);
      slot._pat = pat;
    }
    const name = t.name + (types.filter(x => x === type).length > 1 ? ` ${'ABC'[round]}` : '');
    return { dow: dows[i], name, sub: t.sub, color: t.color, slots, _type: type, _used: used };
  });

  // Fill the week's gaps: +1 set on an existing exercise for that muscle, or a new exercise, where time allows.
  const targets = targetsFor(a);
  const plan = { days };
  const slotCap = m => (a.focus.includes(m) ? 5 : 4);
  for (let guard = 0; guard < 200; guard++) {
    const vol = weeklyVolume(plan, exById);
    const short = Object.keys(targets).filter(m => (vol[m] || 0) < targets[m][0])
      .sort((x, y) => (vol[x] || 0) - targets[x][0] - ((vol[y] || 0) - targets[y][0]));
    let done = false;
    for (const m of short) {
      if (addSetFor(m, vol)) { done = true; break; }
    }
    if (!done) break;
  }

  function addSetFor(m, vol) {
    const max = targets[m][1];
    const primary = s => exById[s.exId].muscles?.[0] === m;
    // Would this push another muscle past its weekly ceiling?
    const overflows = ex => ex.muscles.some((x, i) => targets[x] && (vol[x] || 0) + (i ? 0.5 : 1) > targets[x][1]);
    // 1. One more set on an exercise already there, on the day with the most spare time.
    const cands = [];
    for (const d of days) {
      const spare = budget - secOf(d.slots);
      for (const s of d.slots) if (primary(s) && s.sets < slotCap(m) && spare >= setSec(exById[s.exId]) && !overflows(exById[s.exId])) cands.push([spare, s]);
    }
    if (cands.length && (vol[m] || 0) < max) { cands.sort((x, y) => y[0] - x[0]); cands[0][1].sets++; return true; }
    // 2. A new exercise for it, on a day that trains that area and has room for two sets.
    const opts = [];
    for (const d of days) {
      if (!dayTrains(d._type, m) && !a.focus.includes(m)) continue; // priority muscles can go on any day
      const spare = budget - secOf(d.slots);
      for (const pat of FOR_MUSCLE[m] || []) {
        const pool = (PATTERNS[pat]?.[eq] || []).filter(id => ok(id) && !d._used.has(id) && exById[id].muscles?.includes(m));
        const usedWeek = new Set(days.flatMap(x => x.slots.map(s => s.exId)));
        const id = pool.find(x => !usedWeek.has(x)) || pool[0];
        if (!id) continue;
        const need = 2 * setSec(exById[id]) + (d.slots.length ? TRANSITION_SEC : 0);
        if (spare >= need && !overflows(exById[id])) { opts.push([spare, d, id, pat]); break; }
      }
    }
    if (!opts.length) return false;
    opts.sort((x, y) => y[0] - x[0]);
    const [, d, id, pat] = opts[0];
    const comp = COMPOUND.has(pat);
    const [lo, hi] = repsFor(a.goal, a.experience, comp ? 'compound' : 'acc', pat, exById[id]);
    d.slots.push({ exId: id, sets: 2, lo, hi, group: '', _pat: pat });
    d._used.add(id);
    return true;
  }

  // Big lifts first, then isolation work, arms, and calves and abs to finish (sort is stable).
  const rank = pat => (COMPOUND.has(pat) ? 0 : ORDER[pat] ?? 3);
  const out = days.map(({ dow, name, sub, color, slots }) => ({ dow, name, sub, color,
    slots: slots.sort((x, y) => rank(x._pat) - rank(y._pat)).map(({ _pat, ...s }) => s) }));
  for (let d = 0; d < 7; d++) if (!out.some(x => x.dow === d)) out.push({ dow: d, name: 'Rest', sub: 'Rest or easy cardio', color: 'rest', slots: [] });
  out.sort((x, y) => ((x.dow + 6) % 7) - ((y.dow + 6) % 7));
  return { id: 'main', days: out };
}

const LOW_WHY = {
  'Side delts': { home: 'Bodyweight has no good side-delt exercise; light dumbbells or a band would cover it.' },
  Biceps: { home: 'Chin-ups are the main biceps work without equipment.' },
};

/** Muscles under their weekly target, with a short honest reason. [{m, sets, min, why}] */
export function planGaps(plan, answers, exById) {
  const a = norm(answers);
  const vol = weeklyVolume(plan, exById), tg = targetsFor(a);
  return Object.keys(tg).filter(m => (vol[m] || 0) < tg[m][0] - 1).map(m => {
    const own = LOW_WHY[m]?.[a.equipment];
    return { m, sets: Math.round(vol[m] || 0), min: tg[m][0], generic: !own, why: own || 'Not enough time left once the bigger lifts are in.' };
  });
}

/** Short explanation of why this split was chosen. */
export function explainSplit(answers) {
  const a = norm(answers);
  const n = trainingDows(a.days).length; // the same days buildSplit uses, so text and plan agree
  const t = templateFor(n, a.experience, a.equipment);
  const kind = n <= 1 ? 'one full-body session trains everything once. A second day would roughly double your weekly work'
    : n === 2 ? 'two full-body sessions, so every muscle gets trained twice a week'
    : n === 3 && t[0] === 'fullA' ? 'full-body sessions, so every muscle is trained two or three times a week'
    : n === 3 ? 'push, pull and legs, one day each'
    : n === 4 ? 'upper and lower days twice each, so every muscle is trained twice a week'
    : t.includes('push') && n === 5 ? 'push, pull and legs plus an upper and a lower day, so most muscles get two sessions'
    : t.includes('push') ? 'push, pull and legs twice through, with different exercises the second time'
    : 'alternating upper and lower days, so every muscle is trained two or three times a week';
  const goal = a.goal === 'strength' ? ' The first lifts each day use heavier, lower-rep sets.'
    : a.goal === 'fatloss' ? ' Keep lifting hard: it holds on to muscle while your diet takes care of the fat loss.'
    : '';
  return `${n} day${n === 1 ? '' : 's'} a week: ${kind}.${goal}`;
}

// ---- a split written out as text ("Monday – Chest", "1. Bench Press – 4 × 6–8") ----------------
const DAY_NAMES = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 };
// Day names in English, Malay, Spanish and Japanese → weekday (0 = Sunday)
const DAY_WORDS = [
  [/^(mon(day)?|isnin|lunes|月(曜日?)?)(?=[\s.,:–—-]|$)/i, 1], [/^(tue(s(day)?)?|selasa|martes|火(曜日?)?)(?=[\s.,:–—-]|$)/i, 2],
  [/^(wed(nesday)?|rabu|mi[ée]rcoles|水(曜日?)?)(?=[\s.,:–—-]|$)/i, 3], [/^(thu(r(s(day)?)?)?|khamis|jueves|木(曜日?)?)(?=[\s.,:–—-]|$)/i, 4],
  [/^(fri(day)?|jumaat|viernes|金(曜日?)?)(?=[\s.,:–—-]|$)/i, 5], [/^(sat(urday)?|sabtu|s[áa]bado|土(曜日?)?)(?=[\s.,:–—-]|$)/i, 6],
  [/^(sun(day)?|ahad|minggu|domingo|日(曜日?)?)(?=[\s.,:–—-]|$)/i, 0],
];
const SETS_RE = /(\d+)\s*(?:[x×*]\s*\d+|sets?\b|组|組|セット)/i;
// Chinese "星期一"/"周一" (日/天 = Sunday) and Japanese "(月)": weekday characters → weekday.
const ZH_DAY = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
const JA_DAY = { 月: 1, 火: 2, 水: 3, 木: 4, 金: 5, 土: 6, 日: 0 };
const headerName = rest => { const n = rest.replace(/^[\s.,:;、–—-]+/, '').trim(); return n.charAt(0).toUpperCase() + n.slice(1); };
/** "Monday – Chest", "Mon upper", "Isnin: Dada", "月曜日 胸", "星期一 – 胸", "周一：胸", "(月) 胸", "Day 1 – Push" → {dow|null, name} or null. */
function dayHeader(line) {
  if (SETS_RE.test(line)) return null;
  const clean = line.replace(/^[#*\s]+|[*]+$/g, '');
  let c;
  if ((c = clean.match(/^(?:星期|周|週|礼拜|禮拜)([一二三四五六日天])/))) return { dow: ZH_DAY[c[1]], name: headerName(clean.slice(c[0].length)) };
  if ((c = clean.match(/^\(([月火水木金土日])(?:曜日?)?\)/))) return { dow: JA_DAY[c[1]], name: headerName(clean.slice(c[0].length)) };
  for (const [re, dow] of DAY_WORDS) {
    const m = clean.match(re);
    if (m) { const n = clean.slice(m[0].length).replace(/^[\s.,:–—-]+/, '').trim(); return { dow, name: n.charAt(0).toUpperCase() + n.slice(1) }; }
  }
  // Numbered days in Chinese and Japanese: "第4天", "第4日", "4日目".
  if ((c = clean.match(/^(?:第\s*(\d{1,2})\s*[天日]|(\d{1,2})\s*日目)/))) return { dow: null, name: headerName(clean.slice(c[0].length)) || `Day ${c[1] || c[2]}` };
  // "Day 2", "D2 – Legs"
  const d = clean.match(/^(?:day|hari|d[íi]a|workout|d(?=\d))\s*(\d{1,2}|[a-f])\b[\s.,:–—-]*(.*)$/i);
  return d ? { dow: null, name: d[2].trim() || `Day ${d[1].toUpperCase()}` } : null;
}
const COLOR_FOR = [[/chest|push/i, 'push'], [/back|pull/i, 'pull'], [/leg|lower|squat/i, 'legs'], [/arm|bicep|tricep/i, 'arms'], [/shoulder|upper|delt/i, 'upper'], [/full/i, 'legsb']];
// "Push A", "Upper B", "Legs", "Full body 2", "Lower (hinge)": a workout named on its own line.
const WORKOUT_RE = /^(push|pull|legs?|lower|upper|full(?: ?body)?|chest(?: (?:and|&) \w+)?|back(?: (?:and|&) \w+)?|arms?|shoulders?|glutes?|posterior(?: chain)?|anterior|torso|limbs|hinge|squat|bench|deadlift|conditioning|strength|hypertrophy|power|heavy|light|volume)(?: (?:day|session|workout))?(?: ?(?:[a-f]|\d))?(?: ?\([^)]{1,30}\))?$/i;
// Lines that can't be a set × rep slot: timed rounds and distances.
const TIMED_RE = /\b(e\d?mom|tabata|for time|every \d+ ?(?:min|minutes|sec)|amrap \d+ ?(?:min|minutes)|\d+ ?(?:min|minutes) amrap|intervals?|rounds? for)\b/i;
const DIST_AFTER = /^\s*(m|km|k|meters?|metres?|yd|yards?|cal|kcal|calories|mins?|minutes|miles?|mi|ft|feet|steps)\b/i;
const capFirst = t => t.charAt(0).toUpperCase() + t.slice(1);
// Section words in Chinese, Japanese and Malay ("可选：", "最后加练：", "仕上げ：", "Pilihan:", "Akhiri dengan:").
const OPTIONAL_RE = /optional|可选|選做|选做|任意|オプション|pilihan/i;
const FINISH_RE = /finish|最后|最後|收尾|加练|仕上げ|フィニッシャー|akhiri|penutup/i;
const SECTION_WORD = /^(可选|选做|選做|最后加练|最後加練|最后|最後に|最後|收尾|加练|任意|オプション|仕上げ|フィニッシャー|pilihan|akhiri dengan|akhiri)\s*:\s*(.*)$/i;

/**
 * Read a written split. Returns {days:[{dow, name, sub, color, items:[{name, sets, lo, hi, note, group}]}], skipped:[lines], notAdded:[lines]}.
 * Understands "4 × 6–8", "3 x 10", "4 sets", "5 sets of 5", "2 sets to near failure", "3 × 12 each leg", "3 x AMRAP",
 * "Squat 65% x5, 75% x5, 85% x5+"; intensity ("@ 90%", "RPE 8", "5+", "AMRAP") is kept as the slot's note.
 * Day lines: weekdays, "Day 1", "Day A", or a workout name on its own line ("Push A", "Upper B") after a blank line.
 * "A1."/"A2." superset labels become the slot's group; "B. Trap bar deadlift" loses its letter.
 * Section words ("Biceps", "Finish with:", "Optional:") become notes, cardio lines become the day's subtitle.
 * notAdded: lines inside a day that can't become a slot (distances, timed rounds like EMOM), shown on the review.
 */
export function parseSplitText(text) {
  const days = [], skipped = [], notAdded = [];
  let day = null, section = '', blank = true, explicit = false;
  // Old Mac files end lines with a bare CR.
  for (const raw of String(text).split(/\r\n|\r|\n/)) {
    // Full-width digits, colons and brackets ("５セット", "水曜日：背中", "（月）") become their plain forms.
    // A real plan line is short; a pasted blob is cut so the patterns below stay quick.
    const line = raw.slice(0, 500).normalize('NFKC').replace(/\s+/g, ' ').trim();
    if (!line) { blank = true; continue; }
    const wasBlank = blank;
    blank = false;
    const dh = dayHeader(line);
    // A workout name alone on a line starts a day, unless the plan already names its days by weekday or number
    // (then "Arms" after a gap is a section of that day).
    const bare = line.replace(/^[#*\s]+|[*:]+$/g, '').trim();
    const wh = !dh && !explicit && (wasBlank || !day) && (!day || day.items.length) && WORKOUT_RE.test(bare);
    if (dh || wh) {
      if (dh) explicit = true;
      // A day's name is kept to the programme's 40 characters.
      const name = (dh ? dh.name || 'Workout' : capFirst(bare)).slice(0, 40).trim();
      day = { dow: dh ? dh.dow : null, name, sub: '', color: (COLOR_FOR.find(([re]) => re.test(name)) || [0, 'upper'])[1], items: [] };
      days.push(day); section = '';
      continue;
    }
    if (!day) { skipped.push(line); continue; }
    if (TIMED_RE.test(line)) { skipped.push(line); notAdded.push(line); continue; }
    // Cardio and other non-lifting lines describe the day.
    if (/\b(walk|cardio|treadmill|bike|cycling|swim|run|km\/h|incline|speed|min|minutes)\b/i.test(line) && !/[x×]\s*\d/.test(line)) {
      const c = day.cardio ||= {};
      const t = line.replace(/^(?:\d+[.)]|[-•*])\s+/, '');
      let mm;
      if ((mm = t.match(/(\d+)\s*(?:min|minutes)\b/i))) c.min = +mm[1];
      if ((mm = t.match(/incline:?\s*(\d+)\s*%/i))) c.incline = mm[1];
      if ((mm = t.match(/(\d+(?:\.\d+)?)\s*km\/h/i))) c.speed = mm[1];
      if ((mm = t.match(/\b(incline walk|walk|treadmill|bike|cycling|swim|run)\b/i))) c.kind = mm[1].toLowerCase();
      continue;
    }
    let body = line.replace(/^(?:\d+[.)]|[-•*])\s*/, '');
    // "A1. Bench press" / "A2) Row": a superset pair. "B. Trap bar deadlift": just a label.
    let group = '', lm;
    if ((lm = body.match(/^([A-H])\s?([1-9])\s*[.):–—-]?\s+(?=\S)/i))) { group = lm[1].toUpperCase(); body = body.slice(lm[0].length); }
    else if ((lm = body.match(/^([A-H])[.)]\s+(?=\S)/))) body = body.slice(lm[0].length);
    // A section word on its own line ("可选：", "最后加练：", "仕上げ：", "Pilihan:") labels what follows;
    // in front of an exercise ("仕上げ：プランク 3セット×60秒") it labels just that one.
    let own = '';
    const sw = body.match(SECTION_WORD);
    if (sw) {
      if (!sw[2]) { section = sw[1]; continue; }
      own = sw[1]; body = sw[2];
    }
    // Seconds ("60秒") are reps, noted as seconds; "力竭" / "限界まで" is to failure.
    const secs = /\d\s*秒/.test(body);
    // "60秒×3": the number with 秒 is the hold, the bare one the sets.
    body = body.replace(/(\d+)\s*秒\s*[x×]\s*(\d+)(?!\s*(?:秒|次|回|\d|组|組|セット))/, '$2×$1秒');
    body = body.replace(/(\d)\s*秒/g, '$1次').replace(/\s*(?:至|到)?力竭|\s*[x×]?\s*限界(?:まで)?|\s*オールアウト/g, ' to failure')
      .replace(/(\d+)\s*(?:组|組|セット)\s*[x×]?\s*(?=to failure)/, '$1 sets ');
    // Ranges written "8~10" / "8〜10", and "3*10" / "3＊10" for ×.
    body = body.replace(/(\d)\s*[~〜]\s*(?=\d)/g, '$1–').replace(/(\d)\s*[*✕]\s*(?=\d)/g, '$1 × ')
      // Chinese, Japanese and Malay: "4 组，每组 6–8 次", "4 セット × 6–8 回", "4 set, 6–8 ulangan", "3 set 10 rep" -> "4 × 6–8"
      .replace(/(\d+)\s*(?:组|組|セット|sets?\b)\s*[,、]?\s*(?:每组|各)?\s*(?:[x×]\s*)?(\d+(?:\s*[–—-]\s*\d+)?)\s*(?:次|回|reps?\b|ulangan\b)/i, '$1 × $2')
      // "4组×8", "3セット×10" (no rep word)
      .replace(/(\d+)\s*(?:组|組|セット|set\b)\s*[,、]?\s*(?:每组|各)?\s*[x×]\s*(\d+)/i, '$1 × $2')
      // "8次×4组", "10回 3セット": reps first
      .replace(/(\d+(?:\s*[–—-]\s*\d+)?)\s*(?:次|回)\s*[x×]?\s*(\d+)\s*(?:组|組|セット)/, '$2 × $1')
      // "3×10回": the rep word isn't needed
      .replace(/([x×]\s*\d+(?:\s*[–—-]\s*\d+)?)\s*(?:次|回|ulangan\b)/i, '$1');
    // "5 sets of 5" / "3 sets of 8-12 reps" -> "5 × 5"; "3 x AMRAP" -> 3 sets, as many reps as you can.
    body = body.replace(/(\d+)\s*sets?\s*(?:of|x|×)\s*(\d+)(\s*[–—-]\s*\d+)?(?:\s*reps?\b)?/i, '$1 × $2$3')
      .replace(/(\d+)\s*[x×]\s*(amrap|max(?: reps)?|failure)\b/i, '$1 sets $2');
    // "Squat 65% x5, 75% x5, 85% x5+": one set per percentage, the scheme kept as the note.
    const pct = body.match(/^(.+?)\s*[–—:-]?\s*((?:\d+(?:\.\d+)?\s*%\s*[x×]\s*\d+\+?(?:\s*[,/;]\s*|\s+|$))+)(.*)$/i);
    let m;
    if (pct) {
      const reps = [...pct[2].matchAll(/[x×]\s*(\d+)/gi)].map(x => +x[1]);
      m = [null, pct[1], String(reps.length), String(reps.reduce((a, b) => Math.min(a, b))), String(reps.reduce((a, b) => Math.max(a, b))), [pct[2].trim().replace(/[,;/]$/, ''), pct[3].trim()].filter(Boolean).join(' ')];
    } else {
      // "Bench Press – 4 × 6–8", "Bench press 3x8", "Squat: 5 sets"
      m = body.match(/^(.+?)\s*(?:[–—:-]\s*)?(\d+)\s*(?:[x×]\s*(\d+)(?:\s*[–—-]\s*(\d+))?|sets?)(?:\b|(?=[a-z]))(.*)$/i);
    }
    if (!m) {
      // A heading inside a day ("Biceps", "Finish with:", "Optional:") labels what follows.
      if (/^[A-Za-z][A-Za-z /&]{1,24}:?$/.test(body)) { section = body.replace(/:$/, ''); continue; }
      skipped.push(line); if (day.items.length || /\d/.test(line)) notAdded.push(line); continue;
    }
    let rest = (m[5] || '').trim();
    if (secs) rest = ['seconds', rest].filter(Boolean).join(' ');
    // "Row 5 × 500m", "Bike 3 × 10 min": distance or time, not reps.
    if (!pct && m[3] && DIST_AFTER.test(rest)) { skipped.push(line); notAdded.push(line); continue; }
    const sets = Math.max(1, Math.min(10, +m[2]));
    let lo = m[3] ? +m[3] : null, hi = m[4] ? +m[4] : lo;
    // "Curl 3 x 0", "3 x 10000": reps a set can't have. Said on the review instead of saved. Holds in seconds
    // ("Plank 3 x 120 seconds") may run longer.
    const maxReps = secs || /^(?:s|secs?|seconds?)\b/i.test(rest) ? 600 : 100;
    if (lo != null && (Math.min(lo, hi) < 1 || Math.max(lo, hi) > maxReps)) { skipped.push(line); notAdded.push(`${line} · reps must be between 1 and ${maxReps}`); continue; }
    // "5+" means the last set goes for as many reps as you can.
    if (/^\+/.test(rest)) rest = `${hi}+ ${rest.slice(1).trim()}`.trim();
    const open = /failure|amrap|\bmax\b/i.test(rest);
    if (lo == null) { lo = open ? 8 : 6; hi = open ? 20 : 10; } // "4 sets" / "to near failure" / "AMRAP"
    // Intensity written into the name ("Squat @ 80%", "Bench RPE 8") moves to the note.
    let name = m[1].replace(/\s*\(.*?\)\s*$/, '').trim();
    const inten = name.match(/\s*(@\s*\S.*|\bRPE\s*\d.*|\d+(?:\.\d+)?\s*%.*)$/i);
    if (inten && inten.index > 1) { rest = [inten[1].trim(), rest].filter(Boolean).join(' '); name = name.slice(0, inten.index).replace(/[\s–—:-]+$/, ''); }
    rest = rest.replace(/^[,;·-]\s*/, '').replace(/^amrap$/i, 'AMRAP').replace(/^max(?: reps)?$/i, 'AMRAP');
    const sec = own || section;
    const note = [OPTIONAL_RE.test(sec) ? 'Optional' : FINISH_RE.test(sec) ? 'Finisher' : '', rest].filter(Boolean).join(' · ');
    // Names and notes kept to the lengths the programme stores (exercise names 80, slot notes 120).
    day.items.push({ name: name.slice(0, 80).trim(), sets, lo: Math.min(lo, hi), hi: Math.max(lo, hi), note: note.slice(0, 120).trim(), group });
  }
  // A superset label on its own ("A1" with no A2) is just numbering.
  for (const d of days) for (const it of d.items) if (it.group && d.items.filter(x => x.group === it.group).length < 2) it.group = '';
  // "+ 15 min incline walk (10%, 5.5 km/h)"
  for (const d of days) if (d.cardio) {
    const c = d.cardio, extra = [c.incline && `${c.incline}%`, c.speed && `${c.speed} km/h`].filter(Boolean).join(', ');
    d.sub = `+ ${c.min ? c.min + ' min ' : ''}${c.kind || (c.incline ? 'incline walk' : 'cardio')}${extra ? ` (${extra})` : ''}`;
    delete d.cardio;
  }
  // "Day 1 / Day 2 …" or "Push A / Pull A …" without weekdays: spread them over the week like the split builder does.
  const kept = days.filter(d => d.items.length);
  const free = kept.filter(d => d.dow == null);
  if (free.length) {
    const used = new Set(kept.filter(d => d.dow != null).map(d => d.dow));
    const spread = { 1: [1], 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6], 6: [1, 2, 3, 4, 5, 6] }[Math.min(6, kept.length)] || [1, 2, 3, 4, 5, 6, 0];
    const order = [...spread, 1, 2, 3, 4, 5, 6, 0].filter((d, i, a) => a.indexOf(d) === i && !used.has(d));
    free.forEach((d, i) => { d.dow = order[i] ?? null; });
  }
  // More than seven workouts can't all get a weekday: say so rather than drop them silently.
  for (const d of kept) if (d.dow == null) notAdded.push(`${d.name} (no free weekday left)`);
  // Weekdays are returned as written; two workouts on one weekday are spread out by spreadSameWeekday (for the
  // review) and by saveProgram, which de-duplicates every programme it stores.
  return { days: kept.filter(d => d.dow != null), skipped, notAdded };
}

/**
 * Parsed split days with one workout per weekday: the later of two on a weekday ("Monday – Push AM",
 * "Monday – Pull PM") moves to the next free weekday, so both can be reached from Today and the streak can be
 * met; with all seven taken it joins that weekday's list. Order is kept. Use on parseSplitText(...).days.
 */
export const spreadSameWeekday = days => dedupeDays(days, 'items');
