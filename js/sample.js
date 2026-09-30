// Sample data for people who want to look around before logging their own: eight weeks of the example split
// (made up, not anyone's log). Most lifts climb a rep a session and then add weight, one stops moving and
// bodyweight drifts down, so Today's targets, Progress, History and Levels read like a real person's.
// Sessions and weigh-ins carry `seed`, so streaks, badges and missions ignore them, and "Start for real"
// removes them. Pure: today, programme and exercises in, {sessions, body} out.
import { addDays, dowOf } from './engine.js';

// Starting loads: kg (per dumbbell for DB lifts), cable pin level for 'L', added kg for pull-ups.
const START = { bench: 20, incline: 17.5, mshp: 35, shp: 14, fly: 5, lat: 3, ohext: 5, pushdown: 6, cgb: 40, pullup: 0, pulldown: 45, csrow: 40, cablerow: 7, rdelt: 5, inccurl: 8, hammer: 10, preacher: 20, ezcurl: 20, squat: 50, legpress: 100, bss: 10, legcurl: 35, legext: 40, calf: 60, crunch: 6, rdl: 50 };
const STALL = 'shp';   // flat for the last four weeks, so Progress has a plateau to point out
const WEEKS = 8;

export function sampleData(today, program, exById, gymId = 'g1') {
  const sessions = [], body = [], at = {};   // at[exId] = [load, reps] for its next session
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
    sessions.push({ id: `sample-${date}`, seed: true, date, name: day.name, color: day.color, gymId, start, end: start + 65 * 60e3, readiness: null, deload: false, hr: null, feel: 3 + (d % 3 ? 1 : 0), note: '', entries });
  }
  for (let w = WEEKS; w >= 0; w--) body.push({ id: `sample-b${w}`, seed: true, date: addDays(today, -w * 7), kg: +(78 + w * 0.3).toFixed(1) });
  return { sessions, body };
}
