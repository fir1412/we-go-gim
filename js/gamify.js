// Daily habit loop: a day streak that only counts planned training days (rest days never break it), streak
// shields earned by perfect weeks, three small quests on training days, and badges. Everything is worked out
// from the workout history, so it survives backups and can't drift.
import { S, todayIso, dayForDate } from './state.js';
import { addDays, exposures, score, workSets, muscleXP, MUSCLES } from './engine.js';

const trainedDays = () => new Set(S.sessions.filter(s => !s.seed).map(s => s.date));
const planned = d => dayForDate(d).slots.length > 0;
// People who train on whatever days suit them (missed-day reminders off) aren't held to fixed weekdays.
const flexible = () => S.settings.missedReminders === false;

/**
 * Walk forward from the first workout to today.
 * A workout day: streak +1. A planned day missed: a shield covers it, or the streak resets.
 * Rest days pass without effect. Today, not yet done, is still open.
 */
export function streakInfo(t = todayIso()) {
  const days = trainedDays();
  const first = [...days].sort()[0];
  const out = { streak: 0, best: 0, shields: 0, shieldUsed: null, perfectWeeks: 0, earned: {} };
  if (!first) return out;
  let weekOk = true, weekPlanned = 0;
  for (let d = first; d <= t; d = addDays(d, 1)) {
    const did = days.has(d), plan = flexible() ? false : planned(d);
    if (plan) weekPlanned++;
    if (did) out.streak++;
    else if (plan && d < t) {
      weekOk = false;
      if (out.shields > 0) { out.shields--; out.shieldUsed = d; } else out.streak = 0;
    }
    if (out.streak > out.best) {
      out.best = out.streak;
      for (const n of [3, 7, 14, 30, 60, 100, 200, 365]) if (out.streak >= n && !out.earned['streak' + n]) out.earned['streak' + n] = d;
    }
    // Sunday closes the week: every planned day done earns a shield (at most 2 held).
    if (new Date(d + 'T00:00:00Z').getUTCDay() === 0) {
      if (weekOk && weekPlanned > 0) {
        out.perfectWeeks++;
        out.shields = Math.min(2, out.shields + 1);
        for (const n of [1, 4, 12]) if (out.perfectWeeks >= n && !out.earned['perfect' + n]) out.earned['perfect' + n] = d;
      }
      weekOk = true; weekPlanned = 0;
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
  return [
    { id: 'train', label: "Do today's workout", done: today.length > 0 },
    { id: 'beat', label: 'Beat last time on one lift', done: beat },
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
];

/** Every badge with the date it was earned (null if not yet). */
export function badges(t = todayIso()) {
  const st = streakInfo(t);
  const real = S.sessions.filter(s => !s.seed && s.date <= t).sort((a, b) => (a.date < b.date ? -1 : 1));
  const got = { ...st.earned };
  if (real[0]) got.first = real[0].date;
  for (const n of [10, 25, 50, 100, 250]) if (real[n - 1]) got['w' + n] = real[n - 1].date;
  const xp = muscleXP(S.sessions, S.exById, t);
  for (const u of xp.levelUps) {
    if (u.level >= 5 && !got.lv5) got.lv5 = u.date;
    if (u.level >= 10 && !got.lv10) got.lv10 = u.date;
  }
  if (MUSCLES.every(m => xp.muscles[m]?.xp > 0)) got.allmuscles = MUSCLES.map(m => xp.muscles[m].events?.[0]?.date).filter(Boolean).sort().pop() || t;
  return BADGES.map(([id, icon, name, about]) => ({ id, icon, name, about, date: got[id] || null }));
}

/** Badges earned on date d (for the finish screen). */
export const badgesOn = d => badges(d).filter(b => b.date === d);

// ---- small views ---------------------------------------------------------------------------------------
/** Streak chip, then today's quests (training day) or a calm rest-day card. */
export function todayGame(t = todayIso()) {
  const st = streakInfo(t), q = quests(t);
  const shields = st.shields ? `<span class="shield"><i aria-hidden="true">🛡️</i> Shields: ${st.shields}</span>` : '';
  let h = `<a class="streak day" href="#/levels"><b><i class="flame" aria-hidden="true">🔥</i> Day streak: ${st.streak}</b>${shields}<span>Best: ${st.best}</span></a>`;
  if (!q.length) {
    h += `<div class="box pad restcard"><b>Rest day: your streak is safe</b><p class="fine">Muscles grow while you recover. A walk or a stretch is a bonus, not a must.</p></div>`;
  } else {
    const n = q.filter(x => x.done).length;
    h += `<div class="box pad quests${n === q.length ? ' alldone' : ''}"><p class="lbl">Today's quests · ${n} of ${q.length}</p><ul>${q.map(x => `<li class="${x.done ? 'done' : ''}"><i aria-hidden="true">${x.done ? '✓' : ''}</i><span>${x.label}</span></li>`).join('')}</ul>${n === q.length ? '<p class="fine">All done. See you next training day.</p>' : ''}</div>`;
  }
  if (st.shieldUsed && st.shieldUsed >= addDays(t, -2)) h += `<p class="fine shieldnote">🛡️ A streak shield covered a missed day. Earn more with perfect weeks.</p>`;
  return h;
}

export function badgeWall(t = todayIso()) {
  const all = badges(t), got = all.filter(b => b.date).length;
  return `<p class="lbl">Badges · ${got} of ${all.length}</p><ul class="box badges">${all.map(b => `<li class="${b.date ? 'got' : ''}"><span class="bi" aria-hidden="true">${b.date ? b.icon : '🔒'}</span><span class="bt"><b>${b.name}</b><small>${b.date ? b.about : 'Not yet'}</small></span></li>`).join('')}</ul>`;
}
