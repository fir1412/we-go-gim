// "Learn the app": the Today card (skippable), the full mission list (#/learn, also under More), ticking a
// mission off when its feature is used, and "Show me", which opens the right screen and points at the button.
import { S, saveSettings, todayIso } from '../state.js';
import { esc, toast, openSheet, closeSheet } from '../ui.js';
import { go, showTour } from '../app.js';
import { gameOn } from '../gamify.js';
import { burst } from '../fx.js';
import { MISSIONS, learnProgress, missionFor } from '../learn.js';

const realWorkouts = () => S.sessions.filter(s => !s.seed).length;
const bar = p => `<div class="learnbar" role="progressbar" aria-label="Missions done" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.n}"><i style="width:${Math.round((p.n / p.total) * 100)}%"></i></div>`;

/** Today: the next mission, while the list isn't finished or hidden. New users only (fewer than 15 workouts);
 *  everyone can open the full list from More. */
export function learnCard() {
  const p = learnProgress(S.settings);
  if (p.all || S.settings.learnHidden || realWorkouts() >= 15) return '';
  // Sample mode: missions don't count on made-up data, so a 0-of-10 bar would never move. Offer the tour only.
  if (S.settings.sample) return `<div class="box pad learncard"><p class="lm"><i aria-hidden="true">👋</i><span><b>Take the quick tour</b><small>Five short tips on the main screens.</small></span></p><button class="btn" data-act="learn-go" data-id="tour">Show me</button></div>`;
  const m = MISSIONS.find(x => !p.done.includes(x.id));
  return `<div class="box pad learncard"><p class="lbl">Learn the app · ${p.n} of ${p.total}</p>${bar(p)}
    <p class="lm"><i aria-hidden="true">${m.icon}</i><span><b>${esc(m.title)}</b><small>${esc(m.about)}</small></span></p>
    <div class="row2"><button class="btn" data-act="learn-go" data-id="${m.id}">Show me</button><a class="btn ghost" href="#/learn">All missions</a></div>
    <button class="linkbtn" data-act="learn-hide">Not now</button></div>`;
}

let busy = false;
// Taps that can be refused (a tick without a weight) only count once they really worked.
const worked = { set: () => !!S.draft?.entries.some(e => e.sets.some(x => x.done)) || S.sessions.some(s => !s.seed) };
async function complete(m) {
  // Nothing done on made-up data counts: missions wait for Start for real.
  if (busy || S.settings.sample || S.settings.learn?.[m.id] || (worked[m.id] && !worked[m.id]())) return;
  busy = true;
  try {
    await saveSettings({ learn: { ...(S.settings.learn || {}), [m.id]: todayIso() } });
    const p = learnProgress(S.settings);
    toast(gameOn() ? `🧭 Mission done · ${m.title} · ${p.n} of ${p.total}` : `Learned · ${m.title} · ${p.n} of ${p.total}`, 'up');
    if (gameOn()) setTimeout(() => burst(document.getElementById('toast'), { n: 12, spread: 50 }), 60);
    if (p.all) setTimeout(allDone, 900);
  } finally { busy = false; }
}

function allDone() {
  const game = gameOn();
  const el = openSheet(`<div class="tour"><div class="tour-ic big" aria-hidden="true">🧭</div><p class="lbl">${game ? 'New badge' : 'All missions done'}</p>
    <h2 class="sh-title">${game ? 'Explorer' : 'You know the app'}</h2><p class="sh-body">You have tried every main feature. The list stays under More → Learn the app if you want a reminder.</p>
    <button class="btn" data-t="ok" autofocus>Let's train</button></div>`, { label: 'All missions done' });
  if (game) setTimeout(() => burst(el.querySelector('.tour-ic'), { n: 22, spread: 90 }), 120);
  el.addEventListener('click', e => { if (e.target.closest('[data-t]')) closeSheet(); });
}

/** Called for every tap on a data-act button and every screen shown. */
export function learnFrom(what) {
  if (!S.settings || learnProgress(S.settings).all) return;
  const m = missionFor(what, S.settings);
  if (m) setTimeout(() => complete(m), what.act ? 350 : 600); // after the tap's own work and redraw
}
/** The quick tour was watched to the end. */
export function learnTourDone() {
  if (!S.settings.learn?.tour) setTimeout(() => complete(MISSIONS.find(m => m.id === 'tour')), 400);
}

// "Show me": where each mission happens, and the button to point at.
function showMe(id) {
  if (id === 'tour') return showTour(1);
  const w = !!S.draft;
  const where = {
    ready: ['today', '[data-act="sleep"]'],
    why: w ? ['workout', '[data-act="why"]'] : ['today', '[data-act="why"], [data-act="start"]'],
    set: w ? ['workout', '[data-act="done"]'] : ['today', '[data-act="start"], [data-act="start-day"]'],
    swap: w ? ['workout', '[data-act="menu"], [data-act="add-ex"]'] : ['program', '[data-act="p-open"], [data-act="p-add"]'],
    progress: ['insights'], levels: ['levels'], atlas: ['atlas'], program: ['program'],
    backup: ['data', '[data-act="backup-dl"], [data-act="backup-share"]'],
  }[id];
  if (!where) return;
  const [path, sel] = where;
  go(path);
  if (sel) spot(sel);
}
/** Point at the first matching button once the screen has drawn it. */
function spot(sel, tries = 0) {
  const el = document.querySelector(sel.split(', ').map(s => '#screen ' + s).join(', '));
  if (!el) { if (tries < 12) setTimeout(() => spot(sel, tries + 1), 150); return; }
  el.classList.add('learn-spot');
  el.scrollIntoView({ block: 'center', behavior: matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setTimeout(() => el.classList.remove('learn-spot'), 4200);
}

export function render() {
  const p = learnProgress(S.settings), got = S.settings.learn || {};
  let h = `<div class="box pad"><p class="lbl">${p.n} of ${p.total} missions done</p>${bar(p)}
    <p class="fine">Each mission shows one feature. Use it once and it ticks itself off.${gameOn() ? ' Finish them all for the 🧭 Explorer badge.' : ''}</p></div>
    <ul class="box learnlist">`;
  for (const m of MISSIONS) {
    const done = !!got[m.id];
    h += `<li class="${done ? 'done' : ''}"><i aria-hidden="true">${done ? '✓' : m.icon}</i><span><b>${esc(m.title)}</b><small>${esc(m.about)}</small></span>
      <button class="mini${done ? '' : ' go'}" data-act="learn-go" data-id="${m.id}">${done ? 'Again' : 'Show me'}</button></li>`;
  }
  h += `</ul>`;
  if (!p.all) h += S.settings.learnHidden
    ? `<button class="btn ghost" data-act="learn-unhide">Show the next mission on Today</button>`
    : `<button class="btn ghost" data-act="learn-hide">Hide from Today</button>`;
  return { title: 'Learn the app', sub: 'What each feature does', back: 'more', html: h, color: 'push' };
}

export const actions = {
  'learn-go'(el) { showMe(el.dataset.id); },
  async 'learn-hide'() {
    await saveSettings({ learnHidden: true });
    toast('Hidden. Find it any time under More → Learn the app.');
  },
  async 'learn-unhide'() {
    await saveSettings({ learnHidden: false });
    toast('The next mission shows on Today', 'up');
  },
};
