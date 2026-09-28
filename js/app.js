import { S, load, onChange, saveDraft, saveSettings } from './state.js';
import { $, $$, esc, ICON, sheetOpen, openSheet, closeSheet, toast, cvar } from './ui.js';
import * as today from './views/today.js';
import * as workout from './views/workout.js';
import * as insights from './views/insights.js';
import * as history from './views/history.js';
import * as levels from './views/levels.js';
import * as setup from './views/setup.js';
import * as more from './views/more.js';

const TABS = [
  ['today', 'Today', ICON.today],
  ['workout', 'Workout', ICON.workout],
  ['insights', 'Insights', ICON.insights],
  ['levels', 'Levels', ICON.levels],
  ['history', 'History', ICON.history],
  ['more', 'More', ICON.more],
];

// route name -> [view module, tab]
const ROUTES = {
  today: [today, 'today'],
  workout: [workout, 'workout'],
  insights: [insights, 'insights'], ex: [insights, 'insights'], body: [insights, 'insights'], cardio: [insights, 'insights'], lifts: [insights, 'insights'],
  levels: [levels, 'levels'],
  setup: [setup, 'more'],
  history: [history, 'history'], session: [history, 'history'],
  more: [more, 'more'], program: [more, 'more'], exercises: [more, 'more'], exercise: [more, 'more'],
  gyms: [more, 'more'], equip: [more, 'more'], data: [more, 'more'], settings: [more, 'more'], import: [more, 'more'],
};

export function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name = 'today', ...rest] = h.split('/').map(decodeURIComponent);
  return { name: ROUTES[name] ? name : 'today', args: rest };
}
export const go = path => { location.hash = '#/' + path; };

let current = null, lastKey = '';

function render() {
  const route = parseRoute();
  const [view, tab] = ROUTES[route.name];
  current = { view, route };
  const out = view.render(route) || {};
  const key = route.name + '/' + route.args.join('/');
  const sc = $('#screen');
  const keep = key === lastKey ? sc.scrollTop : 0;
  const focusId = key === lastKey && sc.contains(document.activeElement) ? document.activeElement.id : null;

  $('#app').style.setProperty('--c', cvar(out.color || 'push'));
  $('#bar').innerHTML = `${out.back ? `<a class="iconbtn" href="#/${esc(out.back)}" aria-label="Back">${ICON.back}</a>` : ''}
    <div class="bar-t"><small>${out.sub || ''}</small><h1 tabindex="-1">${esc(out.title || '')}</h1></div><div class="bar-r">${out.right || ''}</div>`;
  sc.innerHTML = out.html || '';
  sc.scrollTop = keep;
  if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
  else if (key !== lastKey && lastKey) $('#bar h1')?.focus?.({ preventScroll: true });
  lastKey = key;
  for (const b of $$('.tabs a')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-current', on ? 'page' : 'false');
    b.classList.toggle('live', b.dataset.tab === 'workout' && !!S.draft);
  }
  out.after?.(sc);
  wake();
  paintTimer();
}

// ---- event delegation ---------------------------------------------------------
function dispatch(kind, ev) {
  const attr = kind === 'click' ? 'act' : 'input';
  const el = ev.target.closest(`[data-${attr}]`);
  if (!el) return;
  if (kind !== 'click' && !el.matches('input,select,textarea')) return;
  const name = el.dataset[attr];
  const fn = current?.view.actions?.[name] || GLOBAL[name];
  if (!fn) return;
  if (kind === 'click') ev.preventDefault();
  Promise.resolve(fn(el, ev, current.route)).catch(err => { console.error(err); toast(err.message || 'Something went wrong', 'down'); });
}
document.addEventListener('click', ev => { unlockAudio(); dispatch('click', ev); });
document.addEventListener('change', ev => dispatch('change', ev));
// Tapping a number field selects it, so typing replaces "25" instead of making "257".
document.addEventListener('focusin', ev => {
  const t = ev.target;
  if (t.matches?.('input[type="number"]')) setTimeout(() => { try { t.select(); } catch {} }, 0);
});

const GLOBAL = {
  'timer-add': () => { if (S.draft?.timer) { S.draft.timer.end += 30000; saveDraft(); paintTimer(); } },
  'timer-skip': () => { if (S.draft) { S.draft.timer = null; saveDraft(); paintTimer(); } },
};

// ---- rest timer ---------------------------------------------------------------------
let beeped = null;
export function startTimer(sec, label) {
  if (!S.draft) return;
  S.draft.timer = { end: Date.now() + sec * 1000, label };
  beeped = null;
  saveDraft();
  paintTimer();
}
function paintTimer() {
  const el = $('#timer');
  const t = S.draft?.timer;
  if (!t) { el.hidden = true; return; }
  const left = Math.ceil((t.end - Date.now()) / 1000);
  if (left <= 0) {
    if (beeped !== t.end) { beeped = t.end; alertDone(); }
    if (left < -5) { S.draft.timer = null; saveDraft(); el.hidden = true; return; }
  }
  el.hidden = false;
  el.classList.toggle('over', left <= 0);
  const a = Math.max(0, left);
  // Build once, then only update text, so taps on the buttons are never lost mid-rebuild.
  if (!el.firstChild) el.innerHTML = `<span class="num"></span><span class="t"><span class="st"></span><b></b></span><button data-act="timer-add">+30s</button><button data-act="timer-skip"></button>`;
  el.querySelector('.num').textContent = `${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
  el.querySelector('.st').textContent = left <= 0 ? 'Rest done. Next set.' : 'Rest';
  el.querySelector('.t b').textContent = t.label;
  el.querySelector('[data-act="timer-skip"]').textContent = left <= 0 ? 'Close' : 'Skip';
}
setInterval(paintTimer, 500);
// Keep the workout clock and time-left estimate fresh, but never while typing.
setInterval(() => {
  if (S.draft && !S.draft.summary && parseRoute().name === 'workout' && !document.activeElement?.matches('input, textarea') && !document.querySelector('.scrim')) render();
}, 30000);

let actx = null;
function unlockAudio() {
  if (actx || !S.settings?.timerSound) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; }
}
function alertDone() {
  if (S.settings.timerVibrate && navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (S.settings.timerSound && actx) {
    try {
      [0, 0.25].forEach(d => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
        g.gain.setValueAtTime(0.25, actx.currentTime + d); g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d + 0.2);
        o.start(actx.currentTime + d); o.stop(actx.currentTime + d + 0.22);
      });
    } catch {}
  }
}

// ---- screen wake lock during workouts -----------------------------------------
let lock = null;
async function wake() {
  const want = S.settings.wakeLock && S.draft && parseRoute().name === 'workout' && document.visibilityState === 'visible';
  if (want && !lock && 'wakeLock' in navigator) {
    try { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } catch { lock = null; }
  } else if (!want && lock) { lock.release().catch(() => {}); lock = null; }
}
document.addEventListener('visibilitychange', () => { wake(); paintTimer(); });

// ---- theme ------------------------------------------------------------------------
export function applyTheme() {
  const t = S.settings.theme;
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0F1117');
}
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => S.settings && applyTheme());

// ---- first-run tour and "what's new" ------------------------------------------------------
export const APP_VERSION = '1.3.0';
const WHATS_NEW = {
  '1.0.0': ['Levels tab: muscle map with XP and level-ups', 'Time left and finish time during workouts', 'Import your old PDF logs from More → Import'],
  '1.1.0': [
    'New name: we go gim',
    'Programme editor: tap a day, tap an exercise, + and − instead of typing',
    'Import reads more log formats and keeps pain and sleep comments',
    'Restore and erase keep an undo copy',
    'Install button in More; phone Back closes pop-ups',
  ],
  '1.3.0': [
    'Move a workout to another day: More → Programme → open a day → Move to another day',
    'Easier to tap and read: bigger buttons, 12px minimum text, stronger contrast in light mode, feedback on every tap',
    'Cleaner icons in Insights and Levels',
    'Exercise setting "Weight jump" now explains itself',
  ],
  '1.2.0': [
    'First-run setup: start fresh, bring your old logs, or build a personalised split',
    'Split builder: 7 quick questions for a weekly plan that fits your days, session length, equipment and joints. Rebuild it any time from More → Settings; your logs stay',
    'More dumbbell and bodyweight exercises in the library',
    'Check for updates in More → Settings',
    'Import: remarks like "felt heavy" become notes, not exercises; duplicate PDF copies are removed; spelling variants merge into one exercise',
    'Send feedback from More',
    'Log past workouts from History, or tap a past day on Today',
    'Create a new exercise right inside a workout',
    'iPhone: Add to Home Screen guide and a proper home-screen icon',
  ],
};
const TOUR = [
  ['today', 'Welcome to we go gim', 'A gym log that plans every session from your last one. It starts empty: import your old logs or restore a backup from More, or just train and new lifts calibrate themselves. Five quick tips, or skip.'],
  ['today', 'Today, pre-filled', 'Your plan for the day with every set filled in from last time; brand-new lifts ask you to find a starting weight first. Tap a row to see why. Set sleep and pain first: a rough night holds the load.'],
  ['workout', 'Log with taps', 'Tick each set as you finish it. The rest timer starts itself, weights carry to the next set, and ⋮ has warm-ups, swaps and notes.'],
  ['insights', 'What to work on', 'Plateaus, pain, lifts to calibrate and weekly volume, plus body weight and cardio.'],
  ['levels', 'Level up', 'Hard sets earn XP for the muscles they train; personal bests earn bonus XP. Tap the body map to see each muscle.'],
  ['more', 'Your programme and data', 'Edit your split, import old logs from PDFs or notes, and back up to Drive. Everything stays on your phone. Suggestions are general training guidance, not medical advice.'],
];

/** Walk through the tabs. The sheet stays open while the screen behind it changes, so the tour adds one history entry, not one per step. */
export function showTour(start = 0, { onDone } = {}) {
  let i = Math.min(Math.max(0, start), TOUR.length - 1);
  const sheet = openSheet('', { label: 'Quick tour', onClose: () => onDone?.() });
  const show = tab => {
    if (parseRoute().name !== tab) { window.history.replaceState(window.history.state, '', '#/' + tab); render(); }
    const c = $('#app').style.getPropertyValue('--c');
    sheet.parentElement?.style.setProperty('--c', !c || c.includes('--rest') ? 'var(--push)' : c);
  };
  const paint = () => {
    const [tab, title, body] = TOUR[i];
    show(tab);
    const last = i === TOUR.length - 1;
    const install = last && canInstall();
    sheet.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="tour"><div class="tour-ic">${i === 0 ? ICON.workout : ICON[tab] || ICON.today}</div><p class="lbl">${i ? `Tip ${i} of ${TOUR.length - 1}` : 'Hello'}</p><h2 class="sh-title">${esc(title)}</h2><p class="sh-body">${esc(body)}</p>
      <div class="dots" aria-hidden="true">${TOUR.map((_, j) => `<i class="${j === i ? 'on' : ''}"></i>`).join('')}</div>
      ${install ? `<button class="btn ghost" data-t="install">${ICON.phone} Add to home screen</button>` : ''}
      <div class="row2"><button class="btn ghost" data-t="${i ? 'back' : 'skip'}">${i ? 'Back' : 'Skip'}</button><button class="btn" data-t="next">${last ? "Let's train" : i ? 'Next' : 'Show me'}</button></div></div>`;
    setTimeout(() => sheet.querySelector('[data-t="next"]')?.focus({ preventScroll: true }), 40);
  };
  sheet.addEventListener('click', async e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const t = b.dataset.t;
    if (t === 'next' && i === TOUR.length - 1) { show('today'); closeSheet(); return; }
    if (t === 'next') i++;
    else if (t === 'back') i--;
    else if (t === 'install') { await promptInstall(); paint(); return; }
    else { closeSheet(); return; }
    paint();
  });
  paint();
}

function showWhatsNew(from, onDone) {
  const items = Object.entries(WHATS_NEW).filter(([v]) => !from || cmpVer(v, from) > 0).flatMap(([, l]) => l);
  if (!items.length) return onDone?.();
  let replay = false;
  const el = openSheet(`<div class="tour"><div class="tour-ic">${ICON.levels}</div><p class="lbl">Updated to ${APP_VERSION}</p><h2 class="sh-title">What's new</h2>
    <ul class="newlist">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="row2"><button class="btn ghost" data-t="tour">Replay tour</button><button class="btn" data-t="ok" autofocus>Got it</button></div></div>`,
    { label: "What's new", onClose: () => { onDone?.(); if (replay) setTimeout(() => showTour(1), 0); } });
  el.parentElement.style.setProperty('--c', 'var(--push)');
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    replay = b.dataset.t === 'tour';
    closeSheet();
  });
}
const cmpVer = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let k = 0; k < 3; k++) if ((x[k] || 0) !== (y[k] || 0)) return (x[k] || 0) - (y[k] || 0); return 0; };

// Marked as seen only once the sheet is dismissed, so closing the app mid-tour shows it again next time.
function onboarding() {
  if (new URLSearchParams(location.search).has('notour')) return; // for automated tests
  const seen = S.settings.seenVersion;
  // Brand-new users choose how to start (fresh, their own logs, or a personalised split); the tour follows.
  // Until they pick, every launch comes back here, so closing the app mid-way never leaves them on a split they didn't choose.
  if (!S.settings.onboarded && !S.sessions.length) {
    if (seen !== APP_VERSION) saveSettings({ seenVersion: APP_VERSION });
    if (!['setup', 'import', 'data'].includes(parseRoute().name)) go('setup');
    return;
  }
  if (seen === APP_VERSION) return;
  const done = () => { if (S.settings.seenVersion !== APP_VERSION) saveSettings({ seenVersion: APP_VERSION }); };
  if (!seen) showTour(0, { onDone: done }); else showWhatsNew(seen, done);
}

/** Manual update check (Settings). Returns 'latest', 'updating' or 'unsupported'. A found update installs and reloads by itself. */
export async function checkForUpdates() {
  const reg = await navigator.serviceWorker?.getRegistration?.();
  if (!reg) return 'unsupported';
  await reg.update();
  return reg.installing || reg.waiting ? 'updating' : 'latest';
}

// ---- install ("Add to home screen") ------------------------------------------------------
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (parseRoute().name === 'more') render(); });
window.addEventListener('appinstalled', () => { installEvt = null; toast('Installed. Open we go gim from your home screen.', 'up'); });
export const canInstall = () => !!installEvt;
export async function promptInstall() {
  if (!installEvt) return false;
  const e = installEvt;
  installEvt = null;
  e.prompt();
  const r = await e.userChoice.catch(() => null);
  if (parseRoute().name === 'more') render();
  return r?.outcome === 'accepted';
}

// ---- boot -----------------------------------------------------------------------------
async function boot() {
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<a href="#/${k}" data-tab="${k}">${i}<span>${l}</span><i class="dot"></i></a>`).join('');
  try {
    await load();
  } catch (e) {
    $('#screen').innerHTML = `<div class="empty"><b>Couldn't open storage.</b><p>${esc(e.message)}</p></div>`;
    return;
  }
  applyTheme();
  onChange(() => { applyTheme(); render(); });
  window.addEventListener('hashchange', () => { if (sheetOpen()) closeSheet(); render(); });
  render();
  document.body.classList.add('ready');
  // Confirm a reload caused by an update, so a manual "Check for updates" visibly lands.
  try { if (sessionStorage.getItem('wgg-updated')) { sessionStorage.removeItem('wgg-updated'); setTimeout(() => toast('Updated to the latest version', 'up'), 300); } } catch {}
  onboarding();
  import('./feedback.js').then(m => m.flushFeedback()).catch(() => {});
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(reg => {
      // An installed app can stay open for days: look for updates whenever it comes back to the front.
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
    // A new version took over: reload once so every file is from the same version, but never
    // while typing or with a sheet open (the workout draft itself is saved on every change).
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    const tryReload = () => {
      if (reloading || document.activeElement?.matches('input, textarea, select') || sheetOpen()) return false;
      reloading = true;
      try { sessionStorage.setItem('wgg-updated', '1'); } catch {}
      location.reload(); return true;
    };
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || tryReload()) return;
      const retry = () => { if (tryReload()) { document.removeEventListener('visibilitychange', retry); window.removeEventListener('hashchange', retry); } };
      document.addEventListener('visibilitychange', retry);
      window.addEventListener('hashchange', retry);
    });
  }
}
boot();
