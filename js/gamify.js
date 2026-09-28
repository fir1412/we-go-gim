// Daily habit loop: a day streak that only counts planned training days (rest days never break it), streak
// shields earned by perfect weeks, three small quests on training days, and badges. Everything is worked out
// from the workout history, so it survives backups and can't drift.
import { S, todayIso, dayForDate } from './state.js';
import { addDays, exposures, score, workSets, muscleXP, MUSCLES, validIso } from './engine.js';
import { learnProgress } from './learn.js';

/** Streaks, quests and badges can be switched off in Settings (on by default). */
export const gameOn = () => S.settings.gamify !== false;

// Dates are checked here too, so a bad record (from an old backup or a bug) is skipped instead of crashing Today.
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const trainedDays = () => new Set(S.sessions.filter(s => !s.seed && validIso(s.date)).map(s => s.date));
/** Training days a week in the plan: distinct weekdays with exercises (two workouts on one weekday count once,
 *  just as the streak counts workout days, not sessions). */
const planPerWeek = () => new Set((S.program?.days || []).filter(d => d?.slots?.length).map(d => d.dow)).size;
/** Pause spans that can exempt a week: valid dates, and not switched on and off the same day. */
const realPauses = () => (S.settings.streakPauses || []).filter(p => p && validIso(p.from) && (p.to == null || (validIso(p.to) && p.to > p.from)));
const planned = d => dayForDate(d).slots.length > 0;
// People who train on whatever days suit them (missed-day reminders off) aren't held to fixed weekdays.
const flexible = () => S.settings.missedReminders === false;

/**
 * Walk forward from the first workout to today. Every workout day adds one to the streak.
 * Moving a workout to another day is fine: a week only counts as short when it ends with fewer workouts than
 * the plan has training days. Each missing workout uses a shield, or resets the streak. Rest days never count
 * against it, and the week in progress (and the first, partial week) is never judged.
 */
export function streakInfo(t = todayIso()) {
  const days = trainedDays();
  const first = [...days].sort()[0];
  const out = { streak: 0, best: 0, shields: 1, shieldUsed: null, perfectWeeks: 0, earned: {} };
  out.pausedNow = false;
  if (!first || !validIso(t)) return out;
  const perWeek = planPerWeek();
  // Paused spans (travel, illness, Ramadan): weeks that touch one are never judged.
  const pauses = realPauses();
  const paused = (a, b) => pauses.some(p => p.from <= b && (p.to || '9999-12-31') >= a);
  out.pausedNow = pauses.some(p => !p.to && p.from <= t);
  let weekDone = 0, firstWeek = true;
  for (let d = first; d <= t; d = addDays(d, 1)) {
    if (days.has(d)) { out.streak++; weekDone++; }
    if (out.streak > out.best) {
      out.best = out.streak;
      for (const n of [3, 7, 14, 30, 60, 100, 200, 365]) if (out.streak >= n && !out.earned['streak' + n]) out.earned['streak' + n] = d;
    }
    // Sunday closes the week.
    if (new Date(d + 'T00:00:00Z').getUTCDay() === 0 && d < t) {
      // One missed workout a week is forgiven (life happens); only more than that needs a shield.
      const skip = firstWeek || paused(addDays(d, -6), d);
      const short = skip ? 0 : Math.max(0, perWeek - weekDone - 1);
      const perfect = !skip && perWeek > 0 && weekDone >= perWeek;
      if (perfect) {
        out.perfectWeeks++;
        out.shields = Math.min(2, out.shields + 1);
        for (const n of [1, 4, 12]) if (out.perfectWeeks >= n && !out.earned['perfect' + n]) out.earned['perfect' + n] = d;
      } else if (short > 0) {
        if (out.shields >= short) { out.shields -= short; out.shieldUsed = d; } else { out.streak = 0; out.shields = 0; }
      }
      weekDone = 0; firstWeek = false;
    }
  }
  return out;
}

/** Today's quests on a training day: [{ id, label, done }]. Empty on a rest day. */
export function quests(t = todayIso()) {
  const today = S.sessions.filter(s => s.date === t && !s.seed);
  if (!planned(t) && !flexible() && !today.length) return [];
  const entries = today.flatMap(s => s.entries);
  const beat = entries.some(e => {
    const ex = S.exById[e.exId], ws = workSets(e);
    if (!ex || !ws.length) return false;
    const last = exposures(S.sessions.filter(s => s.date < t), ex)[0];
    if (!last) return false;
    const now = score({ sets: ws }, ex.unit), then = score(last, ex.unit);
    return now != null && then != null && now > then + 1e-6;
  });
  const allSets = entries.length > 0 && entries.every(e => e.sets.filter(x => !x.warm).every(x => x.done));
  const firstEver = !S.sessions.some(s => !s.seed && s.date < t);
  return [
    { id: 'train', label: "Do today's workout", done: today.length > 0 },
    firstEver ? { id: 'beat', label: 'Save your first workout', done: today.length > 0 } : { id: 'beat', label: 'Beat last time on one lift', done: beat },
    { id: 'all', label: 'Tick every planned set', done: allSets },
  ];
}

const BADGES = [
  ['first', '🏁', 'First workout', 'You showed up. That is the hardest part.'],
  ['streak3', '🔥', '3-day streak', 'Three training days in a row.'],
  ['streak7', '🔥', '7-day streak', 'Seven training days in a row.'],
  ['streak14', '🔥', '14-day streak', 'Fourteen training days in a row.'],
  ['streak30', '🔥', '30-day streak', 'Thirty training days in a row.'],
  ['streak60', '🔥', '60-day streak', 'Sixty training days in a row. This is a habit now.'],
  ['streak100', '💯', '100-day streak', 'One hundred training days in a row.'],
  ['streak200', '💎', '200-day streak', 'Two hundred training days in a row.'],
  ['streak365', '👑', '365-day streak', 'Three hundred and sixty-five training days in a row.'],
  ['perfect1', '⭐', 'Perfect week', 'Every planned day in a week done. Earns a streak shield.'],
  ['perfect4', '🌟', '4 perfect weeks', 'Four weeks with nothing missed.'],
  ['perfect12', '🏆', '12 perfect weeks', 'Twelve weeks with nothing missed.'],
  ['w10', '💪', '10 workouts', 'Ten workouts logged.'],
  ['w25', '💪', '25 workouts', 'Twenty-five workouts logged.'],
  ['w50', '🏋️', '50 workouts', 'Fifty workouts logged.'],
  ['w100', '🏋️', '100 workouts', 'One hundred workouts logged.'],
  ['w250', '🦾', '250 workouts', 'Two hundred and fifty workouts logged.'],
  ['lv5', '📈', 'Level 5 muscle', 'One muscle reached level 5.'],
  ['lv10', '🚀', 'Level 10 muscle', 'One muscle reached level 10.'],
  ['allmuscles', '🧩', 'Whole body', 'Every muscle group trained at least once.'],
  ['explorer', '🧭', 'Explorer', 'Every mission in Learn the app done.'],
];

/** Every badge with the date it was earned (null if not yet). */
export function badges(t = todayIso()) {
  const st = streakInfo(t);
  const real = S.sessions.filter(s => !s.seed && validIso(s.date) && s.date <= t).sort((a, b) => (a.date < b.date ? -1 : 1));
  const got = { ...st.earned };
  if (real[0]) got.first = real[0].date;
  for (const n of [10, 25, 50, 100, 250]) if (real[n - 1]) got['w' + n] = real[n - 1].date;
  const xp = muscleXP(S.sessions, S.exById, t);
  for (const u of xp.levelUps) {
    if (u.level >= 5 && !got.lv5) got.lv5 = u.date;
    if (u.level >= 10 && !got.lv10) got.lv10 = u.date;
  }
  if (MUSCLES.every(m => xp.muscles[m]?.xp > 0)) got.allmuscles = MUSCLES.map(m => xp.muscles[m].events?.[0]?.date).filter(Boolean).sort().pop() || t;
  const learned = learnProgress(S.settings || {});
  if (learned.all) got.explorer = learned.last;
  return BADGES.map(([id, icon, name, about]) => ({ id, icon, name, about, date: got[id] || null }));
}

/** Badges earned on date d (for the finish screen). */
export const badgesOn = d => badges(d).filter(b => b.date === d);

// ---- small views ---------------------------------------------------------------------------------------
/** Streak chip, then today's quests (training day) or a calm rest-day card. */
export function todayGame(t = todayIso()) {
  const st = streakInfo(t), q = quests(t);
  const shields = st.shields ? `<span class="shield"><i aria-hidden="true">🛡️</i> Shields: ${st.shields}</span>` : '';
  const pause = st.pausedNow ? `<span class="shield"><i aria-hidden="true">⏸️</i> Streak paused</span>` : '';
  let h = st.best
    ? `<a class="streak day" href="#/levels"><b><i class="flame" aria-hidden="true">🔥</i> Workout streak: ${st.streak}</b>${pause || shields}<span>Best: ${st.best}</span></a>`
    : `<a class="streak day" href="#/levels"><b><i class="flame" aria-hidden="true">🔥</i> Start your streak today: your first workout counts as 1</b>${shields}</a>`;
  const next = nextTraining(t);
  if (!q.length) {
    const wk = weekCount(t);
    h += `<div class="box pad restcard"><b>Rest day: your streak is safe</b><p class="fine">Muscles grow while you recover. A walk or a stretch is a bonus, not a must.</p>${wk.planned ? `<p class="fine">This week: ${wk.done} of ${wk.planned} workouts</p>` : ''}<a class="btn ghost" href="#/cardio">Log a walk or stretch</a></div>`;
  } else {
    const n = q.filter(x => x.done).length;
    h += `<div class="box pad quests${n === q.length ? ' alldone' : ''}"><p class="lbl">Today's quests · ${n} of ${q.length}</p><ul>${q.map(x => `<li class="${x.done ? 'done' : ''}"><i aria-hidden="true">${x.done ? '✓' : ''}</i><span>${x.label}</span></li>`).join('')}</ul>${n === q.length ? `<p class="fine">${next ? `<span>All done.</span> <span>Next: ${esc(next.name)} · ${next.when}</span>` : 'All done. See you next training day.'}</p>` : ''}</div>`;
  }
  if (st.shieldUsed && st.shieldUsed >= addDays(t, -2)) h += `<p class="fine shieldnote">🛡️ A streak shield covered a missed day. Earn more with perfect weeks.</p>`;
  return h;
}

/** Workouts done this week and the plan's weekly count. */
function weekCount(t) {
  const d = new Date(t + 'T00:00:00Z'), back = (d.getUTCDay() + 6) % 7;
  const start = addDays(t, -back);
  // Workout days, like the streak: two sessions on one day count once against the plan's training days.
  return { done: new Set(S.sessions.filter(s => !s.seed && s.date >= start && s.date <= t).map(s => s.date)).size, planned: planPerWeek() };
}
/** The next planned training day after t: { name, when } (when = 'tomorrow' or a weekday name). */
function nextTraining(t) {
  for (let i = 1; i <= 7; i++) {
    const d = addDays(t, i), day = dayForDate(d);
    if (day.slots.length) return { name: day.name, when: i === 1 ? 'tomorrow' : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(d + 'T00:00:00Z').getUTCDay()] };
  }
  return null;
}

export function badgeWall(t = todayIso()) {
  const all = badges(t), got = all.filter(b => b.date).length;
  return `<p class="lbl">Badges · ${got} of ${all.length}</p><ul class="box badges">${all.map(b => `<li class="${b.date ? 'got' : ''}"><span class="bi" aria-hidden="true">${b.date ? b.icon : '🔒'}</span><span class="bt"><b>${b.name}</b><small>${b.date ? b.about : 'Not yet'}</small></span></li>`).join('')}</ul>`;
}
