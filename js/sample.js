// Sample data for people who want to look around before logging their own: eight weeks of the example split
// (made up, not anyone's log). Most lifts climb a rep a session and then add weight, one stops moving and
// bodyweight drifts down, so Today's targets, Progress, History and Levels read like a real person's.
// Every screen gets something to show: sleep before each workout, peak heart rate on leg days, one squat
// flagged for pain with a note, and two weeks of the daily log (protein, calories, water, steps, sleep).
// Sessions, weigh-ins and daily days carry `seed`, so streaks, badges and missions ignore them, and
// "Start for real" removes them. Pure: today, programme and exercises in, {sessions, body, daily} out.
import { addDays, dowOf } from './engine.js';

// Starting loads: kg (per dumbbell for DB lifts), cable pin level for 'L', added kg for pull-ups.
const START = { bench: 20, incline: 17.5, mshp: 35, shp: 14, fly: 5, lat: 3, ohext: 5, pushdown: 6, cgb: 40, pullup: 0, pulldown: 45, csrow: 40, cablerow: 7, rdelt: 5, inccurl: 8, hammer: 10, preacher: 20, ezcurl: 20, squat: 50, legpress: 100, bss: 10, legcurl: 35, legext: 40, calf: 60, crunch: 6, rdl: 50 };
const STALL = 'shp';   // flat for the last four weeks, so Progress has a plateau to point out
const WEEKS = 8;

export function sampleData(today, program, exById, gymId = 'g1') {
  const sessions = [], body = [], daily = {}, at = {};   // at[exId] = [load, reps] for its next session
  for (let d = WEEKS * 7; d >= 1; d--) {
    const date = addDays(today, -d), day = program.days.find(x => x.dow === dowOf(date));
    if (!day?.slots.length || d % 11 === 5) continue;   // rest days, and the odd missed one
    const entries = day.slots.filter(s => exById[s.exId]).map(s => {
      const [w, r] = at[s.exId] ||= [START[s.exId] ?? 20, s.lo];
      // The last set comes up a rep short, as it does.
      const sets = Array.from({ length: s.sets }, (_, i) => ({ w, r: i === s.sets - 1 ? Math.max(s.lo, r - 1) : r, done: true }));
      // A rep a session; at the top of the range, more weight and a rep back, so the estimated max keeps rising.
      if (s.exId !== STALL || d > 28) at[s.exId] = r + 1 > s.hi ? [w + exById[s.exId].inc, s.hi - 1] : [w, r + 1];
      return { exId: s.exId, slot: { ...s }, sug: null, sets, rir: '2', pain: false, note: '' };
    });
    const start = Date.parse(`${date}T18:30:00`);
    const readiness = { date, sleep: d % 5 === 0 ? '<6' : d % 3 === 0 ? '6–7' : '7+', pain: false };
    sessions.push({ id: `sample-${date}`, seed: true, date, name: day.name, color: day.color, gymId, start, end: start + 65 * 60e3, readiness, deload: false, hr: /leg/i.test(day.name) ? 148 + d % 12 : null, feel: 3 + (d % 3 ? 1 : 0), note: '', entries });
  }
  // One squat, three sessions back, flagged for pain: History and Progress show the flag, and Today's
  // targets stay as they are (only pain two workouts running goes lighter).
  const sq = sessions.filter(s => s.entries.some(e => e.exId === 'squat')).at(-3);
  if (sq) {
    Object.assign(sq.entries.find(e => e.exId === 'squat'), { pain: true, note: 'Knee twinged on the last set' });
    sq.note = 'Short on sleep, kept it light after squats';
    sq.readiness.sleep = '<6';
  }
  for (let w = WEEKS; w >= 0; w--) body.push({ id: `sample-b${w}`, seed: true, date: addDays(today, -w * 7), kg: +(78 + w * 0.3).toFixed(1) });
  // Two weeks of the daily log up to yesterday, so today stays empty for the visitor's own taps.
  for (let d = 14; d >= 1; d--) {
    daily[addDays(today, -d)] = { seed: true, protein: 120 + (d * 37) % 50, kcal: 2100 + (d * 53) % 500, ...(d % 6 ? { water: 2 + (d % 4) * 0.5 } : {}), steps: 5000 + Math.round(((d * 1337) % 6000) / 10) * 10, sleep: 6 + (d % 5) * 0.5 };
  }
  return { sessions, body, daily };
}
