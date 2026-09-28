// Run: node --test tests/
// 1.4.0: barbell library, equipment conflicts, new-exercise guesses, Hevy/Strong CSV, US dates, pounds.
// Every log line and file here is made up for the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as io from '../js/io.js';
import { EXERCISES } from '../js/seed.js';

const parse = (text, opts = {}) => io.parseLogText(text, EXERCISES, { year: 2026, ...opts }).sessions;
const match = n => io.matchExercise(n, EXERCISES)?.ex.id || null;

test('library ids are unique and every exercise is complete', () => {
  assert.equal(new Set(EXERCISES.map(e => e.id)).size, EXERCISES.length);
  for (const e of EXERCISES) {
    assert.ok(['kg', 'kg/DB', 'L', 'bw'].includes(e.unit), e.id);
    assert.ok(['db', 'barbell', 'smith', 'machine', 'cable', 'bw'].includes(e.equip), e.id);
    assert.ok(e.muscles.length && e.inc > 0 && e.rest > 0, e.id);
  }
});

test('barbell, competition and dumbbell names never cross over', () => {
  assert.equal(match('Barbell bench press'), 'bbbench');
  assert.equal(match('Competition bench press'), 'bbbench');
  assert.equal(match('Bench Press (Barbell)'), 'bbbench');
  assert.equal(match('DB bench press'), 'bench');
  assert.equal(match('Dumbbell bench press'), 'bench');
  assert.notEqual(match('Smith bench press'), 'bench');
  assert.notEqual(match('Machine curl'), 'dbcurl');
  assert.notEqual(match('Barbell curl'), 'dbcurl');
  assert.notEqual(match('Barbell row'), 'dbrow');
  assert.notEqual(match('DB row'), 'bbrow');
  assert.notEqual(match('DB bent over row'), 'bbrow');
});

test('a plain name prefers the barbell lift unless the programme holds the dumbbell one', () => {
  assert.equal(match('Bench press'), 'bbbench');
  assert.equal(io.matchExercise('Bench press', EXERCISES, { prefer: new Set(['bench']) }).ex.id, 'bench');
  // "20kg each" reads as dumbbells
  assert.equal(io.matchExercise('Bench press', EXERCISES, { unit: 'kg/DB' }).ex.id, 'bench');
});

test('staples and synonyms find the new library lifts', () => {
  assert.equal(match('Deadlift'), 'deadlift');
  assert.equal(match('DL'), 'deadlift');
  assert.equal(match('Trap bar deadlift'), 'trapdl');
  assert.equal(match('Hex bar deadlift'), 'trapdl');
  assert.equal(match('OHP'), 'ohp');
  assert.equal(match('Military press'), 'ohp');
  assert.equal(match('Front squat'), 'frontsquat');
  assert.equal(match('Bent over row'), 'bbrow');
  assert.equal(match('Bicep curl'), 'dbcurl');
  assert.equal(match('Biceps curls'), 'dbcurl');
  assert.equal(match('Clean and jerk'), 'cleanjerk');
  assert.equal(match('Power clean'), 'powerclean');
  assert.equal(match('Push press'), 'pushpress');
  assert.equal(match('Snatch'), 'snatch');
  assert.equal(match('Nordic hamstring curl'), 'nordic');
  assert.equal(match('Hip abduction'), 'hipabd');
  assert.equal(match('Frog pumps'), 'frogpump');
  assert.equal(match('Cable glute kickbacks'), 'glutekick');
  assert.equal(match('Plank'), 'plank');
  assert.notEqual(match('Hamstring curl'), 'dbcurl'); // a body part the exercise doesn't train
  assert.equal(match('Hanging leg raises'), 'hanglegraise');
});

test('guessed muscles for brand-new lifts', () => {
  assert.deepEqual(io.guessMuscles('Hang snatch'), ['Quads', 'Glutes', 'Hamstrings']);
  assert.deepEqual(io.guessMuscles('Squat clean'), ['Quads', 'Glutes', 'Hamstrings']);
  assert.deepEqual(io.guessMuscles('Split jerk'), ['Quads', 'Glutes', 'Hamstrings']);
  assert.deepEqual(io.guessMuscles('Glute ham raise'), ['Hamstrings']);
  assert.deepEqual(io.guessMuscles('Seated hip abduction'), ['Glutes']);
  assert.deepEqual(io.guessMuscles('Kas glute bridge'), ['Glutes', 'Hamstrings']);
  assert.equal(io.guessMuscles('Cable kickback')[0], 'Glutes');
  assert.equal(io.guessMuscles('Tricep kickback')[0], 'Triceps');
  assert.equal(io.guessMuscles('DB kickback')[0], 'Triceps');
  assert.equal(io.guessMuscles('Frog pumps')[0], 'Glutes');
  assert.equal(io.guessMuscles('Behind the neck push press')[0], 'Front delts');
  assert.deepEqual(io.guessMuscles('Totally unknown'), []);
});

test('guessed equipment and unit: barbell when loaded, bodyweight when not, never a machine by default', () => {
  const g = (n, o) => io.guessNewExercise(n, o);
  assert.deepEqual([g('Zercher squat', { loaded: true }).equip, g('Zercher squat', { loaded: true }).unit], ['barbell', 'kg']);
  assert.equal(g('Mystery lift', { loaded: true }).equip, 'barbell');
  assert.deepEqual([g('Mystery lift', { loaded: false }).equip, g('Mystery lift', { loaded: false }).unit], ['bw', 'bw']);
  assert.equal(g('Pendulum squat', { loaded: true }).equip, 'machine');
  assert.equal(g('Cable Y raise').unit, 'L');
  assert.equal(g('Seal row', { unit: 'kg/DB' }).equip, 'db');
  assert.equal(g('Weighted dips', { loaded: true }).equip, 'bw');
  assert.equal(g('Chest press', { unit: 'L' }).unit, 'L');
  assert.ok(g('Machine abduction').perGym);
});

test('Hevy CSV: titles, warm-ups, pounds, timed sets; distance-only rows are left out', () => {
  const csv = [
    '"title","start_time","end_time","description","exercise_title","superset_id","exercise_notes","set_index","set_type","weight_lbs","reps","distance_km","duration_seconds","rpe"',
    '"Push A","21 Sep 2026, 18:02","21 Sep 2026, 19:10","","Bench Press (Barbell)","","","0","warmup","135","10","","",""',
    '"Push A","21 Sep 2026, 18:02","21 Sep 2026, 19:10","","Bench Press (Barbell)","","","1","normal","225","5","","","8"',
    '"Push A","21 Sep 2026, 18:02","21 Sep 2026, 19:10","","Plank","","","0","normal","","","","60",""',
    '"Push A","21 Sep 2026, 18:02","21 Sep 2026, 19:10","","Running","","","0","normal","","","2.1","",""',
  ].join('\n');
  const [s] = io.sessionsFromCSV(csv);
  assert.equal(s.date, '2026-09-21');
  assert.equal(s.name, 'Push A');
  const bench = s.entries.find(e => e.exName === 'Bench Press (Barbell)');
  assert.equal(bench.sets.length, 2);
  assert.ok(bench.sets[0].warm);
  assert.ok(Math.abs(bench.sets[1].w - 102.058) < 0.01, String(bench.sets[1].w));
  assert.equal(bench.rir, '2');
  assert.equal(s.entries.find(e => e.exName === 'Plank').sets[0].r, 60);
  assert.equal(s.entries.some(e => e.exName === 'Running'), false);
});

test('Strong CSV with semicolons, comma decimals and W warm-ups', () => {
  const csv = 'Date;Workout Name;Duration;Exercise Name;Set Order;Weight;Reps;Distance;Seconds;Notes;Workout Notes;RPE\n'
    + '2026-09-22 07:10:00;Legs;1h;Squat (Barbell);W;60;5;0;0;;;\n'
    + '2026-09-22 07:10:00;Legs;1h;Squat (Barbell);1;102,5;5;0;0;felt good;;\n';
  const [s] = io.sessionsFromCSV(csv);
  assert.equal(s.date, '2026-09-22');
  assert.equal(s.name, 'Legs');
  const sq = s.entries[0];
  assert.equal(sq.sets.length, 2);
  assert.ok(sq.sets[0].warm);
  assert.equal(sq.sets[1].w, 102.5);
  assert.equal(sq.note, 'felt good');
  assert.equal(io.csvDelimiter('a;b;c\n1;2;3'), ';');
  assert.equal(io.csvDelimiter('"a;x",b,c'), ',');
});

test('our own CSV export still round-trips', () => {
  const exById = { bench: EXERCISES.find(e => e.id === 'bench') };
  const csv = io.toCSV([{ date: '2026-09-21', name: 'Push', entries: [{ exId: 'bench', sets: [{ w: 25, r: 8, done: true }, { w: 25, r: 7, done: true }], rir: '1', pain: false, note: '' }] }], exById);
  const [s] = io.sessionsFromCSV(csv);
  assert.equal(s.entries[0].exName, 'Flat DB bench press');
  assert.equal(s.entries[0].unit, 'kg/DB');
  assert.deepEqual(s.entries[0].sets.map(x => [x.w, x.r]), [[25, 8], [25, 7]]);
});

test('US dates are detected; day first stays the default', () => {
  assert.equal(io.detectDateOrder(['9/21/2026', '9/23/2026']), 'mdy');
  assert.equal(io.detectDateOrder(['21/9/2026', '3/4/2026']), 'dmy');
  assert.equal(io.detectDateOrder(['3/4/2026']), 'dmy');
  assert.equal(io.detectDateOrder(['9/21/2026', '21/9/2026']), 'dmy'); // mixed: don't guess
  const csv = 'date,exercise,weight,reps\n9/21/2026,Squat,100,5\n10/2/2026,Squat,100,5\n';
  assert.deepEqual(io.sessionsFromCSV(csv).map(s => s.date), ['2026-09-21', '2026-10-02']);
  const s = parse('9/21/2026 legs\nSquat\n100kg x5\n\n10/2/2026 legs\nSquat\n100kg x5');
  assert.deepEqual(s.map(x => x.date), ['2026-09-21', '2026-10-02']);
  assert.deepEqual(parse('2/10/2026 legs\nSquat\n100kg x5').map(x => x.date), ['2026-10-02']);
  assert.deepEqual(parse('2/10/2026 legs\nSquat\n100kg x5', { dateOrder: 'mdy' }).map(x => x.date), ['2026-02-10']);
});

test('pounds become kg on import; kg and cable levels are left alone', () => {
  const r = io.parseSetLine('Bench 135 lbs x 5');
  assert.ok(Math.abs(r.sets[0].w - 61.235) < 0.001);
  assert.equal(io.parseSetLine('80lbs or 36kg x8').sets[0].w, 36);
  const s = parse('21 Sep 2026 push\nBench press\n225 x5\n225 x5', { lb: true })[0];
  assert.ok(Math.abs(s.entries[0].sets[0].w - 102.058) < 0.01);
  assert.equal(parse('21 Sep 2026 push\nCable fly\nL9 x12', { lb: true })[0].entries[0].sets[0].w, 9);
  assert.equal(parse('21 Sep 2026 push\nSquat\n100kg x5', { lb: true })[0].entries[0].sets[0].w, 100);
  const csv = 'date,exercise,weight,reps\n2026-09-21,Squat,225,5\n';
  assert.ok(Math.abs(io.sessionsFromCSV(csv, { lb: true })[0].entries[0].sets[0].w - 102.058) < 0.01);
  assert.equal(io.sessionsFromCSV('date,exercise,weight (kg),reps\n2026-09-21,Squat,100,5\n', { lb: true })[0].entries[0].sets[0].w, 100);
  assert.ok(Math.abs(io.sessionsFromCSV('Date,Exercise Name,Weight,Weight Unit,Reps\n2026-09-21,Squat,225,lbs,5\n')[0].entries[0].sets[0].w - 102.058) < 0.01);
});
