// Run: node --test tests/engine-qa.test.mjs
// Regression tests for the 2026-09-28 core-logic QA report (agent-1-engine.md): one block per finding.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.location ??= { search: '' };
const E = await import('../js/engine.js');
const { S, sanitizeBackup, validateBackup, mergeSessions, dayForDate, withUniqueDays } = await import('../js/state.js');
const G = await import('../js/gamify.js');
const Sp = await import('../js/split.js');
const C = await import('../js/calendar.js');
const { EXERCISES } = await import('../js/seed.js');
const exById = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

// ---- 1. duplicate weekdays ---------------------------------------------------------------------
const DUP_TEXT = 'Monday - Push AM\nBench press 3x8\n\nMonday - Pull PM\nRow 3x10\n\nWednesday - Legs AM\nSquat 3x5\n\nWednesday - Arms PM\nCurl 3x10\n\nFriday - Upper\nOHP 3x8';

test('1a streak: a plan with two workouts on one weekday counts distinct training weekdays', () => {
  // The programme exactly as the paste-split save builds it, before any de-duplication.
  const days = [{ dow: 1, name: 'Push AM' }, { dow: 1, name: 'Pull PM' }, { dow: 3, name: 'Legs AM' }, { dow: 3, name: 'Arms PM' }, { dow: 5, name: 'Upper' }]
    .map(d => ({ ...d, slots: [{ exId: 'bench', sets: 3, lo: 8, hi: 12 }] }));
  for (let dow = 0; dow < 7; dow++) if (!days.some(x => x.dow === dow)) days.push({ dow, name: 'Rest', slots: [] });
  S.program = { days }; S.settings = { missedReminders: true }; S.exById = {};
  const sessions = []; let i = 0;
  for (let d = '2026-08-17'; d <= '2026-09-27'; d = E.addDays(d, 1)) {
    const w = E.dowOf(d), n = w === 1 || w === 3 ? 2 : w === 5 ? 1 : 0;
    for (let k = 0; k < n; k++) sessions.push({ id: 's' + (i++), date: d, name: 'x', entries: [] });
  }
  S.sessions = sessions;
  const st = G.streakInfo('2026-09-28');
  assert.equal(st.streak, 18, 'one streak day per workout day (3 a week for 6 weeks)');
  assert.ok(st.perfectWeeks >= 5);
});

test('1b pasted split: a second workout on a taken weekday moves to the next free weekday', () => {
  const r = Sp.spreadSameWeekday(Sp.parseSplitText(DUP_TEXT).days);
  assert.deepEqual(r.map(d => [d.name, d.dow]), [['Push AM', 1], ['Pull PM', 2], ['Legs AM', 3], ['Arms PM', 4], ['Upper', 5]]);
});

test('1b the programme saved from a pasted split (more.js split-use) gets one day per weekday', () => {
  // split-use builds days from the parse, adds Rest for missing weekdays, sorts Monday first, then saveProgram.
  const days = Sp.parseSplitText(DUP_TEXT).days.map(d => ({ dow: d.dow, name: d.name, sub: d.sub, color: d.color, slots: d.items.map(() => ({ exId: 'bench', sets: 3, lo: 8, hi: 12 })) }));
  for (let dow = 0; dow < 7; dow++) if (!days.some(x => x.dow === dow)) days.push({ dow, name: 'Rest', slots: [] });
  days.sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7));
  const p = withUniqueDays({ id: 'main', days });
  assert.equal(p.days.length, 7);
  assert.equal(new Set(p.days.map(d => d.dow)).size, 7);
  S.program = p;
  assert.equal(dayForDate('2026-09-28').name, 'Push AM');
  assert.equal(dayForDate('2026-09-29').name, 'Pull PM');
  assert.equal(dayForDate('2026-10-01').name, 'Arms PM');
  const same = { days: [{ dow: 1, name: 'A', slots: [] }] };
  assert.equal(withUniqueDays(same), same, 'a clean programme is returned untouched');
});

test('1b pasted split: with all seven weekdays taken, an extra workout merges into its weekday', () => {
  const names = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const text = names.map((n, i) => `${n} - W${i}\nBench press 3x8`).join('\n\n') + '\n\nMonday - Extra\nCurl 3x10';
  const r = { days: Sp.spreadSameWeekday(Sp.parseSplitText(text).days) };
  assert.equal(r.days.length, 7);
  assert.equal(new Set(r.days.map(d => d.dow)).size, 7);
  assert.deepEqual(r.days.find(d => d.dow === 1).items.map(x => x.name), ['Bench press', 'Curl']);
});

test('1c sanitizeBackup: duplicate or invalid programme weekdays are spread out', () => {
  const sl = [{ exId: 'bench', sets: 3, lo: 8, hi: 12 }];
  const d = sanitizeBackup({ app: 'setlist', sessions: [], program: { days: [{ dow: 1, name: 'A', slots: sl }, { dow: 1, name: 'B', slots: sl }, { dow: 9, name: 'C', slots: sl }, { dow: 2.5, name: 'D', slots: sl }] } });
  const dows = d.program.days.map(x => x.dow);
  assert.equal(new Set(dows).size, dows.length);
  for (const w of dows) assert.ok(Number.isInteger(w) && w >= 0 && w <= 6);
  assert.deepEqual(d.program.days.map(x => x.name), ['A', 'B', 'C', 'D']);
  assert.equal(d.program.days[0].dow, 1);
});

test('1c dedupeDays: rest placeholders never push a training day away', () => {
  const out = E.dedupeDays([{ dow: 1, name: 'Rest', slots: [] }, { dow: 1, name: 'Push', slots: [{ exId: 'a' }] }]);
  assert.deepEqual(out.map(d => [d.name, d.dow]), [['Push', 1]]);
});

// ---- 2. lb users --------------------------------------------------------------------------------
const bench = { id: 'bench', name: 'Bench press', unit: 'kg', equip: 'barbell', inc: 2.5, muscles: ['Chest'] };
const logAt = (exId, w, r = 12) => [{ id: 'a', date: '2026-09-20', entries: [{ exId, sets: [0, 1, 2].map(() => ({ w, r, done: true })) }] }];

test('2 lb: barbell suggestions land on 5 lb steps and the text states the real step', () => {
  E.setUnits('lb');
  try {
    for (let lb = 45; lb <= 405; lb += 5) {
      const g = E.suggest({ sets: 3, lo: 8, hi: 12 }, bench, { sessions: logAt('bench', E.fromDisp(lb)), date: '2026-09-28' });
      const nd = E.toDisp(g.w);
      assert.equal(nd % 5, 0, `${lb} -> ${nd}`);
      const said = +g.why.match(/Add ([\d.]+) lb/)[1];
      assert.equal(nd - lb, said, `${lb} -> ${nd} says ${said}`);
      assert.equal(E.toDisp(E.fromDisp(nd)), nd);
    }
  } finally { E.setUnits('kg'); }
});

test('2 lb: stored 45.359 kg shows as exactly 100 lb, and the next step is 105 lb', () => {
  E.setUnits('lb');
  try {
    assert.equal(E.toDisp(45.359), 100);
    const g = E.suggest({ sets: 3, lo: 8, hi: 12 }, bench, { sessions: logAt('bench', 45.359), date: '2026-09-28' });
    assert.equal(E.toDisp(g.w), 105);
    assert.match(g.why, /Add 5 lb/);
  } finally { E.setUnits('kg'); }
});

test('2 lb: dumbbells step 5 lb without a list, or to the list, and say so', () => {
  const db = { id: 'dbp', name: 'DB press', unit: 'kg/DB', equip: 'db', inc: 1, muscles: ['Chest'] };
  E.setUnits('lb');
  try {
    let g = E.suggest({ sets: 3, lo: 8, hi: 12 }, db, { sessions: logAt('dbp', E.fromDisp(25)), date: '2026-09-28' });
    assert.equal(E.toDisp(g.w), 30);
    assert.match(g.why, /Add 5 lb per dumbbell/);
    const equip = { dumbbells: [20, 25, 27.5, 30, 35].map(E.fromDisp) };
    g = E.suggest({ sets: 3, lo: 8, hi: 12 }, db, { sessions: logAt('dbp', E.fromDisp(25)), date: '2026-09-28', equip });
    assert.equal(E.toDisp(g.w), 27.5);
    assert.match(g.why, /Add 2\.5 lb per dumbbell/);
  } finally { E.setUnits('kg'); }
});

test('2 lb: the rep-progression text and incLabel promise the step that will be applied', () => {
  E.setUnits('lb');
  try {
    const g = E.suggest({ sets: 3, lo: 8, hi: 12 }, bench, { sessions: logAt('bench', E.fromDisp(135), 9), date: '2026-09-28' });
    assert.match(g.why, /then add 5 lb/);
    assert.equal(E.incLabel({ ...bench, inc: 5 }), '+10 lb');
  } finally { E.setUnits('kg'); }
});

test('2 lb: plate helper works in lb with lb plates and reports its unit', () => {
  const kgPlates = [25, 20, 15, 10, 5, 2.5, 1.25];
  E.setUnits('lb');
  try {
    for (let lb = 45; lb <= 405; lb += 5) {
      const p = E.platesPerSide(E.fromDisp(lb), 20, kgPlates);
      assert.equal(p.ok, true, `${lb} lb`);
      assert.equal(p.unit, 'lb');
    }
    assert.deepEqual(E.platesPerSide(E.fromDisp(135), 20, kgPlates).plates, [45]);
    assert.deepEqual(E.platesPerSide(E.fromDisp(185), E.fromDisp(45), [45, 25, 10, 5, 2.5].map(E.fromDisp)).plates, [45, 25]);
  } finally { E.setUnits('kg'); }
  assert.equal(E.platesPerSide(60, 20, kgPlates).unit, 'kg');
});

test('2 lb: warm-ups round to 5 lb', () => {
  E.setUnits('lb');
  try {
    const ws = E.warmup(E.fromDisp(135), bench, { barKg: 20 });
    for (const s of ws.slice(1)) assert.equal(E.toDisp(s.w) % 5, 0, String(E.toDisp(s.w)));
  } finally { E.setUnits('kg'); }
});

// ---- 3. impossible dates ------------------------------------------------------------------------
const BAD_DATES = ['2026-00-10', '2026-09-00', '2026-02-30', '0000-00-00', '2025-13-45', '1969-12-31', '2101-01-01', '9999-99-99'];

test('3 validIso: calendar check and 1970–2100', () => {
  for (const d of BAD_DATES) assert.equal(E.validIso(d), false, d);
  for (const d of ['1970-01-01', '2024-02-29', '2026-09-28', '2100-12-31']) assert.equal(E.validIso(d), true, d);
});

test('3 validateBackup rejects impossible dates; sanitizeBackup drops them', () => {
  for (const d of BAD_DATES) {
    assert.throws(() => validateBackup({ app: 'setlist', sessions: [{ id: 'a', date: d, entries: [] }] }), /malformed/, d);
    assert.throws(() => validateBackup({ app: 'setlist', sessions: [], body: [{ id: 'b', date: d, kg: 80 }] }), /malformed/, d);
    assert.throws(() => validateBackup({ app: 'setlist', sessions: [], cardio: [{ id: 'c', date: d }] }), /malformed/, d);
  }
  const out = sanitizeBackup({ app: 'setlist', sessions: [{ id: 'a', date: '2026-02-30', entries: [] }, { id: 'b', date: '2026-09-01', entries: [] }],
    body: [{ id: 'b1', date: '0000-00-00', kg: 80 }], cardio: [{ id: 'c1', date: '2026-00-10' }], measures: [{ id: 'm', date: '2026-09-00', waist: 80 }],
    daily: { '2026-02-30': { protein: 100 } }, settings: { streakPauses: [{ from: '2026-00-01', to: null }, { from: '2026-09-01', to: '2026-13-01' }] } });
  assert.deepEqual(out.sessions.map(s => s.id), ['b']);
  assert.equal(out.body.length, 0); assert.equal(out.cardio.length, 0); assert.equal(out.measures.length, 0);
  assert.deepEqual(out.daily, {});
  assert.deepEqual(out.settings.streakPauses, []);
});

test('3 streakInfo, todayGame and badges skip bad dates instead of throwing', () => {
  S.program = { days: [1, 3, 5].map(dow => ({ dow, name: 'X', slots: [{ exId: 'bench', sets: 3, lo: 8, hi: 12 }] })) };
  S.settings = { missedReminders: true, streakPauses: [{ from: '2026-00-01', to: null }] }; S.exById = {};
  S.sessions = [{ id: 'a', date: '2026-00-10', entries: [] }, { id: 'z', date: '0000-00-00', entries: [] }, { id: 'b', date: '2026-09-21', entries: [] }];
  const st = G.streakInfo('2026-09-28');
  assert.equal(st.streak, 1);
  assert.equal(st.pausedNow, false);
  assert.doesNotThrow(() => G.todayGame('2026-09-28'));
  assert.doesNotThrow(() => G.badges('2026-09-28'));
  assert.equal(G.badges('2026-09-28').find(b => b.id === 'first').date, '2026-09-21');
});

// ---- 4. equipment ---------------------------------------------------------------------------------
test('4 sanitizeBackup cleans settings.equip', () => {
  const out = sanitizeBackup({ app: 'setlist', sessions: [], settings: { equip: {
    plates: [0, -5, 1e-7, 'x', 20, 20, 25, 150, ...Array.from({ length: 30 }, (_, i) => 1 + i)],
    dumbbells: [0, 0.2, 10, 250, 'abc', ...Array.from({ length: 150 }, (_, i) => 1 + i)],
    barKg: 'abc', smithBarKg: 500,
  } } });
  const q = out.settings.equip;
  assert.ok(q.plates.length <= 20 && q.plates.every(p => p >= 0.25 && p <= 100));
  assert.equal(new Set(q.plates).size, q.plates.length);
  assert.ok(q.plates.includes(20) && q.plates.includes(25));
  assert.ok(q.dumbbells.length <= 100 && q.dumbbells.every(d => d >= 0.5 && d <= 200));
  assert.ok(!('barKg' in q) && !('smithBarKg' in q));
  assert.equal(sanitizeBackup({ app: 'setlist', sessions: [], settings: { equip: { barKg: 15 } } }).settings.equip.barKg, 15);
});

test('4 platesPerSide never loops forever on zero, negative or tiny plates', () => {
  for (const plates of [[0], [-5], [25, 20, 1e-7], [NaN, 'x']]) {
    const t = Date.now();
    const p = E.platesPerSide(100, 20, plates);
    assert.ok(Date.now() - t < 200);
    assert.ok(p.plates.length <= 100);
  }
  assert.deepEqual(E.platesPerSide(60, 20, [0, 20]).plates, [20]);
});

// ---- 5. streak pauses -----------------------------------------------------------------------------
test('5 sanitize keeps up to 200 pauses, merges overlaps and drops zero-length ones', () => {
  const many = Array.from({ length: 250 }, (_, i) => { const f = E.addDays('2020-01-06', i * 7); return { from: f, to: E.addDays(f, 2) }; });
  let out = sanitizeBackup({ app: 'setlist', sessions: [], settings: { streakPauses: many } });
  assert.equal(out.settings.streakPauses.length, 200);
  assert.equal(out.settings.streakPauses.at(-1).from, many.at(-1).from);
  out = sanitizeBackup({ app: 'setlist', sessions: [], settings: { streakPauses: [
    { from: '2025-02-01', to: '2025-02-20' }, { from: '2025-02-10', to: '2025-03-01' }, { from: '2025-05-05', to: '2025-05-05' }, { from: '2025-06-01', to: null },
  ] } });
  assert.deepEqual(out.settings.streakPauses, [{ from: '2025-02-01', to: '2025-03-01' }, { from: '2025-06-01', to: null }]);
});

test('5 streakInfo: a pause switched on and off the same day exempts nothing; a future pause is not active', () => {
  S.program = { days: [1, 3, 5].map(dow => ({ dow, name: 'X', slots: [{ exId: 'bench', sets: 3, lo: 8, hi: 12 }] })) };
  S.exById = {};
  // Weeks 7–13 and 14–20 full; 21–27 has one workout: short by 1 after the forgiven miss, which uses a shield.
  S.sessions = ['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14', '2026-09-16', '2026-09-18', '2026-09-21'].map((date, i) => ({ id: 's' + i, date, entries: [] }));
  S.settings = { missedReminders: true, streakPauses: [] };
  const base = G.streakInfo('2026-09-28');
  S.settings.streakPauses = [{ from: '2026-09-23', to: '2026-09-23' }];
  assert.deepEqual(G.streakInfo('2026-09-28'), base);
  S.settings.streakPauses = [{ from: '2026-10-05', to: null }];
  assert.equal(G.streakInfo('2026-09-28').pausedNow, false);
});

// ---- 6. timed exercises -----------------------------------------------------------------------------
test('6 isTimed / hasEstMax: timed holds and carries get no estimated max', () => {
  for (const id of ['farmer', 'suitcase', 'platepinch', 'deadhang', 'plank', 'sideplank', 'hollow']) {
    assert.equal(E.isTimed(exById[id]), true, id);
    assert.equal(E.hasEstMax(exById[id]), false, id);
  }
  assert.equal(E.isTimed({ id: 'x', name: 'Wall sit', unit: 'bw' }), true);
  assert.equal(E.isTimed(exById.bench), false);
  assert.equal(E.hasEstMax(exById.bench), true);
  const pb = E.personalBests([{ date: '2026-09-20', sessionId: 'a', sets: [{ w: 32, r: 60, done: true }] }], exById.farmer);
  assert.equal(pb.best, null);
  assert.equal(pb.heavy.w, 32);
});

// ---- 7. calendar ---------------------------------------------------------------------------------------
const pick = (ics, k) => ics.split('\r\n').filter(l => l.startsWith(k));

test('7 calendar: out-of-range times fall back to 18:00, bad weekdays are skipped', () => {
  for (const t of ['24:00', '99:99', '12:60']) {
    const ics = C.trainingIcs([{ dow: 1, name: 'X' }], t, '', new Date(2026, 8, 28, 9));
    assert.deepEqual(pick(ics, 'DTSTART'), ['DTSTART:20260928T180000'], t);
    const u = new URL(C.googleCalendarUrl({ dow: 1, name: 'X' }, t, {}, new Date(2026, 8, 28, 9)));
    assert.equal(u.searchParams.get('dates'), '20260928T180000/20260928T184500');
  }
  const ics = C.trainingIcs([{ dow: 7, name: 'X' }, { dow: -1, name: 'Y' }, { dow: 2, name: 'Z' }], '18:00', '', new Date(2026, 8, 28, 9));
  assert.equal(pick(ics, 'BEGIN:VEVENT').length, 1);
  assert.ok(!/undefined/.test(ics));
});

test('7 calendar: two reminders on one weekday get different UIDs', () => {
  const ics = C.trainingIcs([{ dow: 1, name: 'Mon' }, { dow: 1, name: 'Mon PM' }], '18:00', '', new Date(2026, 8, 28, 9));
  const uids = pick(ics, 'UID');
  assert.equal(uids.length, 2);
  assert.notEqual(uids[0], uids[1]);
});

test('7 calendar: DST gap moves the first date, fall-back keeps a real duration', () => {
  const was = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    if (new Date(2027, 2, 14, 2, 30).getHours() === 2) return; // time zone data not available: nothing to test
    let ics = C.trainingIcs([{ dow: 0, name: 'Legs', minutes: 60 }], '02:30', '', new Date(2027, 2, 13, 12));
    assert.deepEqual(pick(ics, 'DTSTART'), ['DTSTART:20270321T023000']);
    assert.deepEqual(pick(ics, 'DTEND'), ['DTEND:20270321T033000']);
    ics = C.trainingIcs([{ dow: 0, name: 'Legs', minutes: 60 }], '01:30', '', new Date(2026, 9, 31, 12));
    assert.deepEqual(pick(ics, 'DTSTART'), ['DTSTART:20261101T013000']);
    assert.deepEqual(pick(ics, 'DTEND'), ['DTEND:20261101T023000']);
    ics = C.trainingIcs([{ dow: 1, name: 'Late', minutes: 90 }], '23:30', '', new Date(2026, 8, 28, 9));
    assert.deepEqual(pick(ics, 'DTEND'), ['DTEND:20260929T010000']);
  } finally { if (was === undefined) delete process.env.TZ; else process.env.TZ = was; }
});

// ---- 8. split builder with 0 or 7 days ----------------------------------------------------------------
test('8 buildSplit/explainSplit agree for 0, 7 and string weekdays', () => {
  const train = p => p.days.filter(d => d.slots.length);
  for (const days of [[], [0, 1, 2, 3, 4, 5, 6], ['1', '3', '5'], [1, 1, 3]]) {
    const p = Sp.buildSplit({ days }, exById);
    const n = train(p).length;
    assert.ok(n >= 1 && n <= 6, `${JSON.stringify(days)}: ${n}`);
    assert.equal(p.days.length, 7);
    assert.equal(new Set(p.days.map(d => d.dow)).size, 7);
    assert.ok(p.days.every(d => Number.isInteger(d.dow)));
    assert.match(Sp.explainSplit({ days }), new RegExp(`^${n} days? a week`), JSON.stringify(days));
  }
  assert.equal(train(Sp.buildSplit({ days: ['1', '3', '5'] }, exById)).length, 3);
});

// ---- 9. merge import ------------------------------------------------------------------------------------
test('9 mergeSessions keeps the local copy unless the backup copy is newer', () => {
  const local = [{ id: 'l1', date: '2026-09-20', end: 2000, entries: [{ exId: 'bench', sets: [] }] }, { id: 'l2', date: '2026-09-21', end: 1000, entries: [] }];
  const incoming = [{ id: 'l1', date: '2026-01-01', end: 1000, entries: [] }, { id: 'l2', date: '2026-09-21', end: 5000, entries: [], note: 'newer' }, { id: 'n', date: '2026-09-22', entries: [] }];
  const r = mergeSessions(local, incoming);
  assert.deepEqual(r.put.map(s => s.id), ['l2', 'n']);
  assert.equal(r.skipped, 1);
  assert.equal(mergeSessions(local, [{ id: 'l2', date: '2026-09-21', end: null, updated: 9000, entries: [] }]).put.length, 1);
});

// ---- 10. negative values, set counts, bodyweight deload ----------------------------------------------------
test('10 sanitize drops negative loads and reps, and clamps slot sets to 1–20', () => {
  const out = sanitizeBackup({ app: 'setlist', sessions: [{ id: 'a', date: '2026-09-01', entries: [{ exId: 'bench', slot: { exId: 'bench', sets: 0, lo: 8, hi: 12 }, sets: [{ w: -100, r: -5, done: true }, { w: 50, r: 5, done: true }] }] }],
    program: { days: [{ dow: 1, name: 'A', slots: [{ exId: 'bench', sets: 99, lo: 8, hi: 12 }, { exId: 'row', sets: -2, lo: 8, hi: 12 }] }] } });
  const e = out.sessions[0].entries[0];
  assert.equal(e.sets[0].w, null); assert.equal(e.sets[0].r, null);
  assert.equal(e.sets[1].w, 50);
  assert.equal(e.slot.sets, 1);
  assert.deepEqual(out.program.days[0].slots.map(s => s.sets), [20, 1]);
  assert.ok(E.volume({ unit: 'kg' }, e.sets) >= 0);
});

test('10 a bodyweight deload drops the added weight', () => {
  const dip = { id: 'dip', name: 'Dip', unit: 'bw', equip: 'bw', inc: 2.5, muscles: ['Chest'] };
  const g = E.suggest({ sets: 3, lo: 8, hi: 12 }, dip, { sessions: logAt('dip', 20, 10), date: '2026-09-28', deload: true });
  assert.equal(g.t, 'deload');
  assert.equal(g.w, 0);
});
