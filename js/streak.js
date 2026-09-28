// Weekly streak: weeks in a row with at least one workout. Rest days never break it, so a 3-day plan can keep
// a streak going. Shown on Today and after a workout, where it helps most.
import { S, todayIso } from './state.js';
import { weekStart, addDays } from './engine.js';

/** { thisWeek, planned, past (full weeks in a row before this one), streak (past + this week if trained) } */
export function weekStats(t = todayIso(), extra = 0) {
  const ws = weekStart(t);
  const real = S.sessions.filter(s => !s.seed);
  const thisWeek = real.filter(s => s.date >= ws && s.date <= t).length + extra;
  const planned = S.program.days.filter(d => d.slots.length).length;
  let past = 0;
  for (let w = 0; w < 520; w++) {
    const a = addDays(ws, -7 * (w + 1)), b = addDays(a, 6);
    if (real.some(s => s.date >= a && s.date <= b)) past++; else break;
  }
  return { thisWeek, planned, past, streak: past + (thisWeek > 0 ? 1 : 0) };
}

/** One line: the streak and this week's count, or a nudge to keep or start it. */
export function streakLine(st) {
  const week = st.planned ? `<span>This week: ${st.thisWeek} of ${st.planned}</span>` : '';
  const lead = st.thisWeek > 0 ? `<b><i class="flame" aria-hidden="true">🔥</i> Week streak: ${st.streak}</b>`
    : st.past > 0 ? `<b><i class="flame" aria-hidden="true">🔥</i> Train once this week to keep your streak (${st.past} weeks)</b>`
      : '<b>Train this week to start a streak</b>';
  return `<a class="streak" href="#/history">${lead}${week}</a>`;
}
