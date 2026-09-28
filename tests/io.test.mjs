// Run: node --test tests/
// Log-import parser tests. Every log line here is made up for the test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as io from '../js/io.js';
import { EXERCISES } from '../js/seed.js';

const parse = (text, opts = {}) => io.parseLogText(text, EXERCISES, { year: 2026, ...opts }).sessions;
const names = s => s.entries.map(e => e.exName);
const match = n => io.matchExercise(n, EXERCISES)?.ex.id || null;

test('"maybe 2 rir" and set numbers are not dates', () => {
  assert.equal(io.findDate('Maybe 2 rir', 2026), null);
  assert.equal(io.findDate('12.5 x10', 2026), null);
  assert.equal(io.findDate('4 decent reps', 2026), null);
  assert.equal(io.findDate('3 jan 2025 push', 2026), '2025-01-03');
  assert.equal(io.findDate('9 sept 2026 legs', 2026), '2026-09-09');
  const s = parse('2 mar 2026 push\n\nFlat DB bench press\n20kg x8 maybe 2 rir\nMaybe 1 rir\n20kg x8');
  assert.equal(s.length, 1);
  assert.equal(s[0].entries[0].sets.length, 2);
});

test('remarks never become exercises', () => {
  const s = parse(['5 mar 2026 push', '', 'Cable chest fly', 'Level 4 x10 bit heavy after a long', 'night', 'Level 4 x9', '', 'Lazy', '', 'Incline DB press', '20kg x8', 'felt my elbow twinge'].join('\n'))[0];
  assert.deepEqual(names(s), ['Cable chest fly', 'Incline DB press']);
  assert.match(s.entries[0].note, /long night/);
  assert.ok(s.entries[1].pain);
  assert.ok(s.notes.includes('Lazy') || s.entries[0].note.includes('Lazy'));
});

test('a remark wrapped onto the next line is joined and its RIR read', () => {
  const s = parse('6 mar 2026 pull\n\nLat pulldown\n40kg x10 close to failure, maybe 2\nrir\n40kg x9')[0];
  assert.equal(s.entries.length, 1);
  assert.equal(s.entries[0].rir, '2');
  assert.match(s.entries[0].note, /maybe 2 rir/);
});

test('set remarks about tiredness stay with the exercise; standalone ones go to the session', () => {
  const s = parse('7 mar 2026 legs\n\nLeg press\n80kg x10 feeling tired\n\nSlept badly')[0];
  assert.match(s.entries[0].note, /feeling tired/);
  assert.deepEqual(s.notes, ['Slept badly']);
});

test('"no pain" is not pain', () => {
  assert.equal(io.hasPain('no shoulder pain today'), false);
  assert.equal(io.hasPain('pain free'), false);
  assert.equal(io.hasPain('left knee pain'), true);
});

test('a lift named without sets is a session note, and the next block keeps its own name', () => {
  const s = parse('8 mar 2026 pull\n\nPull up\nNo bar free\n\nLat pulldown\nL12 x8\nL12 x8')[0];
  assert.deepEqual(names(s), ['Lat pulldown']);
  assert.ok(s.notes.some(n => /Pull up/.test(n)));
});

test('a date mentioned mid-sentence does not start a session', () => {
  const s = parse('9 mar 2026 legs\n\nCalf raises on 10 mar 2026\nmachine was taken\n30kg x12');
  assert.equal(s.length, 1);
  assert.equal(s[0].date, '2026-03-09');
});

test('the date line names the workout when it differs from the file', () => {
  const s = parse('10 mar 2026 legs\n\nLeg press\n80kg x10\n\n12 mar 2026 push 2\n\nIncline DB press\n20kg x8', { sessionName: 'Push 2' });
  assert.equal(s[0].name, 'Legs');
  assert.equal(s[1].name, 'Push 2');
  assert.deepEqual(s[1].notes, []);
});

test('equipment after "w" stays in the name; bodyweight in the name zeroes body-weight numbers', () => {
  const s = parse('11 mar 2026 push\n\nBench press w dumbbells no machine\n20kg each x8\n\nDips bodyweight\n70kg x10\n+5kg x8')[0];
  assert.equal(s.entries[0].exName, 'Bench press dumbbells');
  assert.equal(match(s.entries[0].exName), 'bench');
  assert.deepEqual(s.entries[1].sets.map(x => x.w), [0, 5]);
});

test('mistyped dates in an ordered log are moved to fit', () => {
  const mk = d => ({ date: d, entries: [], notes: [] });
  const list = ['2025-03-03', '2025-03-10', '2025-03-17', '2024-03-24', '2025-03-31', '2025-04-07', '2025-05-14', '2025-04-21'].map(mk);
  io.fixDateTypos(list);
  assert.equal(list[3].date, '2025-03-24');
  assert.equal(list[3].dateWas, '2024-03-24');
  assert.equal(list[6].date, '2025-04-14');
  assert.equal(list[0].dateWas, undefined);
});

test('PDF text items: copies drawn twice are dropped, wide gaps become blank lines', () => {
  const it = (str, y) => ({ str, transform: [12, 0, 0, 12, 20, y] });
  const lines = io.linesFromItems([it('Leg press', 700), it('Leg press', 700), it('80kg x10', 685), it('80kg x10', 670), it('Leg curl', 640), it('40kg x12', 625)]);
  assert.deepEqual(lines, ['Leg press', '80kg x10', '80kg x10', '', 'Leg curl', '40kg x12']);
});

test('older and newer copies of a log collapse to one session each', () => {
  const s = (date, n, t) => ({ date, name: 'Push 1', fileTime: t, entries: [{ exName: 'x', sets: Array(n).fill({ w: 1, r: 1 }) }] });
  const r = io.dedupeSessions([s('2026-01-01', 3, 1), s('2026-01-08', 3, 1), s('2026-01-01', 3, 2), s('2026-01-08', 4, 2), s('2026-01-15', 2, 2)]);
  assert.equal(r.sessions.length, 3);
  assert.equal(r.dropped, 2);
});

test('library matching: the right lift or none', () => {
  assert.equal(match('Db bench press'), 'bench');
  // A plain name goes to the barbell lift, unless the programme holds the dumbbell one.
  assert.equal(match('Bench press'), 'bbbench');
  assert.equal(io.matchExercise('Bench press', EXERCISES, { prefer: new Set(['bench']) }).ex.id, 'bench');
  assert.equal(match('Chest press machine'), 'mchest');
  assert.equal(match('Incline db bench press'), 'incline');
  assert.equal(match('Cable chest fly'), 'fly');
  assert.equal(match('Pullups'), 'pullup');
  assert.equal(match('Squat smith machine'), 'squat');
  assert.equal(match('Overhead cable extension'), 'ohext');
  assert.equal(match('Smith DL'), 'smithdl');
  assert.notEqual(match('Barbell squat'), 'squat');
  assert.notEqual(match('Abs curl'), 'hammer');
  assert.notEqual(match('Bench dip machine'), 'bench');
  assert.notEqual(match('Single leg hip thrust'), 'bwcalf');
  assert.notEqual(match('Dumbbell shrugs'), 'dbrdl');
});

test('spellings and word order of one lift share a key', () => {
  assert.equal(io.nameKey('Reverse cable wrist curl'), io.nameKey('Cable reverse wrist curls'));
  assert.equal(io.nameKey('Pull ups'), io.nameKey('pull-up'));
  assert.notEqual(io.nameKey('Leg curl'), io.nameKey('Leg press'));
});

test('file names become routine names', () => {
  assert.equal(io.sessionNameFromFile('Monday Push 1_260928_054205.pdf'), 'Push 1');
  assert.equal(io.sessionNameFromFile('Wednesday Legs_260902_110842 (1).pdf'), 'Legs');
  assert.equal(io.sessionNameFromFile('Sunset session.txt'), 'Sunset session');
});

// ---- found by the 100-user simulation ----------------------------------------------------
import { parseSplitText as _pst } from '../js/split.js';
test('load then sets x reps: "Deadlift 100kg 5x3" keeps the 100 kg', () => {
  const r = io.parseSetLine('Deadlift 100kg 5x3');
  assert.equal(r.sets.length, 5);
  assert.ok(r.sets.every(s => s.w === 100 && s.r === 3));
});
test('a short date line like "12/9" is never read as sets', () => {
  assert.equal(io.parseSetLine('12/9'), null);
});
test('pasted split: no dash, short and localised day names, Day N', () => {
  const names = t => _pst(t).days.map(d => `${d.dow}:${d.name}:${d.items.length}`);
  assert.deepEqual(names('Monday\nBench press 3x8'), ['1:Workout:1']);
  assert.deepEqual(names('Mon upper\nRow 3x10'), ['1:Upper:1']);
  assert.deepEqual(names('Isnin – Dada\nBench press – 3 × 8'), ['1:Dada:1']);
  assert.deepEqual(names('lunes – pecho\nPress banca – 3 × 10'), ['1:Pecho:1']);
  assert.deepEqual(names('月曜日 胸\nBench press – 3 × 8'), ['1:胸:1']);
  assert.deepEqual(names('Day 1 – Push\nBench 3x8\nDay 2 – Pull\nRow 3x10\nDay 3 – Legs\nSquat 3x5'), ['1:Push:1', '3:Pull:1', '5:Legs:1']);
});
