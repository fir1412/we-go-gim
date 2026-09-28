// "Learn the app": a checklist of small missions, one per main feature. A mission is ticked off when the
// feature is actually used (a tap or a visit), not when a tip is read, so it teaches by doing.
// Plain data and helpers only (no DOM), so gamify.js and the tests can use it.

/** [id, icon, title, what it does, how it is done: { acts: data-act names, routes: screen names }] */
export const MISSIONS = [
  ['tour', '👋', 'Take the quick tour', 'Five short tips on the main screens.', {}],
  ['ready', '😴', 'Tell the app how you slept', 'Sleep and pain on Today change the day\'s weights, so a rough night never forces a heavy session.', { acts: ['sleep', 'pain'] }],
  ['why', '💡', 'See why a weight was picked', 'Tap a suggestion to see why it steps up, holds or steps down.', { acts: ['why'] }],
  ['set', '✅', 'Tick a set', 'Tick each set as you finish it. The rest timer starts by itself and the weight carries to the next set.', { acts: ['done'] }],
  ['swap', '🔁', 'Swap or add an exercise', 'Machine taken? Swap to one that trains the same muscle, or add any exercise from the library.', { acts: ['swap', 'add-ex', 'p-swap', 'p-add'] }],
  ['progress', '📊', 'Check your progress', 'See which lifts are moving, which have stalled, and your weekly sets per muscle.', { routes: ['insights', 'lifts', 'ex'] }],
  ['levels', '🏅', 'Level up your muscles', 'Hard sets earn points for the muscles they train. Tap the body map to see each muscle\'s level.', { routes: ['levels'] }],
  ['atlas', '🧍', 'Explore the muscles in 3D', 'Turn the body, tap a muscle, and see the exercises that train it.', { routes: ['atlas'] }],
  ['program', '🗓️', 'Make the programme yours', 'Change training days, exercises and rep ranges, or rebuild the plan from a few questions.', { routes: ['program'] }],
  ['backup', '💾', 'Save a backup', 'Everything stays on this phone. A backup file keeps it safe if you lose or change phones.', { acts: ['backup-dl', 'backup-share', 'backup-now'] }],
].map(([id, icon, title, about, how]) => ({ id, icon, title, about, acts: how.acts || [], routes: how.routes || [] }));

export const MISSION_IDS = MISSIONS.map(m => m.id);

/** Missions done so far: { done: [ids], n, total, all, last: date the last one was done } */
export function learnProgress(settings = {}) {
  const got = settings.learn && typeof settings.learn === 'object' ? settings.learn : {};
  const done = MISSION_IDS.filter(id => typeof got[id] === 'string');
  return { done, n: done.length, total: MISSION_IDS.length, all: done.length === MISSION_IDS.length, last: done.map(id => got[id]).sort().pop() || null };
}

/** The mission a tap (data-act) or a screen visit completes, if any and not done yet. */
export function missionFor({ act, route }, settings = {}) {
  const got = settings.learn || {};
  return MISSIONS.find(m => !got[m.id] && (act ? m.acts.includes(act) : m.routes.includes(route))) || null;
}

/** Backup cleaning: keep only known missions with a date. */
export function cleanLearn(x) {
  if (!x || typeof x !== 'object') return {};
  return Object.fromEntries(MISSION_IDS.filter(id => typeof x[id] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x[id])).map(id => [id, x[id]]));
}
