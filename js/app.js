import { S, load, onChange, saveDraft, saveSettings, todayIso, dayForDate } from './state.js';
import { setUnits, setBwLabel } from './engine.js';
import { setWording, T, TIP, $, $$, esc, ICON, sheetOpen, openSheet, closeSheet, setOnBack, sheetSettling, selectorFor, toast, cvar, isHex, onFor, expertWording, setDateLang, isIOS, standalone } from './ui.js';
import { setPlain } from './plain.js';
import * as db from './db.js';
import { setLang, getLang, translate, LANGS, setUserNames, pickLang } from './i18n.js';
import * as today from './views/today.js';
import * as daily from './views/daily.js';
import * as learnView from './views/learn.js';
import { applyPalette } from './palette.js';
import './fx.js'; // motion and touch feedback (self-starting)

const TABS = [
  ['today', 'Today', ICON.today],
  ['workout', 'Workout', ICON.workout],
  ['insights', 'Progress', ICON.insights],
  ['history', 'History', ICON.history],
  ['more', 'More', ICON.more],
];

// route name -> [view, tab]
const ROUTES = {
  today: ['today', 'today'], daily: ['daily', 'today'], start: ['today', 'today'],
  workout: ['workout', 'workout'],
  insights: ['insights', 'insights'], ex: ['insights', 'insights'], body: ['insights', 'insights'], cardio: ['insights', 'insights'], lifts: ['insights', 'insights'],
  levels: ['levels', 'insights'], atlas: ['atlas', 'insights'], measure: ['insights', 'insights'],
  learn: ['learn', 'more'],
  setup: ['setup', 'more'],
  history: ['history', 'history'], session: ['history', 'history'],
  more: ['more', 'more'], program: ['more', 'more'], paste: ['more', 'more'], exercises: ['more', 'more'], exercise: ['more', 'more'],
  gyms: ['more', 'more'], equip: ['more', 'more'], data: ['more', 'more'], settings: ['more', 'more'], import: ['more', 'more'], help: ['more', 'more'],
};
// The first screen needs only Today (and the daily and learn cards on it). The other screens load on first
// visit, and in the background once the phone is idle, so a tab is still instant the first time it's tapped.
const views = { today, daily, learn: learnView };
const LAZY = {
  workout: () => import('./views/workout.js'), insights: () => import('./views/insights.js'), history: () => import('./views/history.js'),
  levels: () => import('./views/levels.js'), atlas: () => import('./views/atlas.js'), setup: () => import('./views/setup.js'), more: () => import('./views/more.js'),
};
const loading = {};
const loadView = n => views[n] ? Promise.resolve(views[n]) : (loading[n] ??= LAZY[n]().then(m => (views[n] = m), e => { delete loading[n]; throw e; }));

export function parseRoute() {
  const h = location.hash.replace(/^#\/?/, '');
  const dec = s => { try { return decodeURIComponent(s); } catch { return s; } };
  const [name = 'today', ...rest] = h.split('/').map(dec);
  return { name: ROUTES[name] ? name : 'today', args: rest };
}
// Back goes up the app, not through every screen visited. `trail` is the way back: a tab starts it
// over from Today, and opening a kind of screen already on it (another lift, another session) trims
// back to there. Each history entry carries `i`, how many entries it sits above the app's first, so
// reaching Today can jump straight to the first entry and the next back press closes the app.
const TOP = new Set([...TABS.map(t => t[0]), 'levels']);
let trail = ['today'], collapsing = false, lastI = 0, queued = null;
const depth = () => window.history.state?.i ?? 0;
export function go(path) {
  if (collapsing || sheetSettling()) { queued = path; return; } // a jump back is still landing: go once it has
  if (location.hash === '#/' + path) return;
  window.history.pushState({ i: depth() + 1 }, '', '#/' + path);
  dispatchEvent(new HashChangeEvent('hashchange'));
}
function follow(path, name) {
  if (name === 'today') trail = [path];
  else if (TOP.has(name)) trail = ['today', path];
  else {
    const k = trail.findIndex(p => p === path || p.split('/')[0] === name);
    trail = [...(k > 0 ? trail.slice(0, k) : trail), path];
  }
}
function toToday() {
  if (collapsing || trail.length > 1 || !depth() || window.history.state?.sheet) return;
  collapsing = true;
  window.history.go(-depth());
}
const flush = () => { const p = queued; queued = null; if (p) go(p); };
setOnBack(settled => {
  if (settled) return flush(); // a closed sheet's entry was dropped
  if (window.history.state?.i == null) return; // a new entry (the address bar), not a step back
  if (collapsing) { // landed on the first entry: show Today there
    collapsing = false;
    window.history.replaceState({ i: 0 }, '', '#/' + trail.at(-1));
  } else {
    trail.pop();
    if (!trail.length) trail = ['today'];
    window.history.replaceState({ i: depth() }, '', '#/' + trail.at(-1));
    toToday();
  }
  dispatchEvent(new HashChangeEvent('hashchange'));
  if (!collapsing) flush();
});

let current = null, lastKey = '';
let left = null; // the screen just left and its scroll position, so going back picks up where the lifter was
/** The screen before this one ('workout', 'history', …), or `fallback` when the app was opened here. */
export const backTo = fallback => trail.at(-2) || fallback;
let touring = false; // while the quick tour moves between screens

function render() {
  try { renderRoute(); } catch (e) { console.error(e); recovery(e); }
}
/** Shown instead of a blank or stuck screen when something can't be drawn (for example a damaged backup). */
function recovery(e) {
  const sc = document.getElementById('screen');
  if (!sc) return;
  sc.innerHTML = `<div class="empty"><b>Something went wrong showing this screen.</b><p>Your data is still on this phone. Try another tab, reload, or restore a backup.</p><p class="fine">${esc(String(e?.message || e).slice(0, 200))}</p>
    <div class="row2"><a class="btn" href="#/today">Go to Today</a><a class="btn ghost" href="#/data">Backup and restore</a></div><button class="btn ghost" data-act="reload-app">Reload the app</button></div>`;
}
function renderRoute() {
  let route = parseRoute();
  // Home-screen shortcut: #/start opens today's workout in one tap.
  if (route.name === 'start') {
    window.history.replaceState(window.history.state, '', '#/today');
    route = parseRoute();
    setTimeout(quickStart, 0);
  }
  const [vn, tab] = ROUTES[route.name], view = views[vn];
  if (!view) return void loadView(vn).then(() => render(), recovery); // the screen so far stays up meanwhile
  current = { view, route };
  if (!touring) learnView.learnFrom({ route: route.name }); // "Learn the app" missions done by visiting a screen (the tour's own visits don't count)
  const key = route.name + '/' + route.args.join('/');
  const sc = $('#screen');
  let keep = key === lastKey ? sc.scrollTop : 0;
  if (key !== lastKey) {
    // Straight back to the screen just left (back arrow or phone back): pick up where the lifter was.
    if (left && left.key === key && left.to === lastKey) keep = left.top;
    left = lastKey ? { key: lastKey, top: sc.scrollTop, to: key } : null;
    if (window.history.state?.i == null) window.history.replaceState({ ...window.history.state, i: lastKey ? lastI + 1 : 0 }, ''); // typed into the address bar, or first open
    lastI = depth();
    follow(location.hash.replace(/^#\/?/, '') || 'today', route.name);
    toToday();
  }
  const out = view.render(route) || {};
  // Redrawing the same screen (a tick, a +/- tap) keeps focus on the same control.
  const focusSel = key === lastKey && sc.contains(document.activeElement) ? selectorFor(document.activeElement) : null;

  $('#app').style.setProperty('--c', cvar(out.color || 'push'));
  if (isHex(out.color)) $('#app').style.setProperty('--on', onFor(out.color)); else $('#app').style.removeProperty('--on');
  $('#bar').innerHTML = `${out.back ? `<a class="iconbtn" href="#/${esc(out.back)}" aria-label="Back">${ICON.back}</a>` : ''}
    <div class="bar-t"><small>${out.sub || ''}</small><h1 tabindex="-1">${esc(out.title || '')}</h1></div><div class="bar-r">${out.right || ''}</div>`;
  sc.innerHTML = out.html || '';
  sc.scrollTop = keep;
  if (focusSel) sc.querySelector(focusSel)?.focus({ preventScroll: true });
  else if (key !== lastKey && lastKey) $('#bar h1')?.focus?.({ preventScroll: true });
  lastKey = key;
  for (const b of $$('.tabs a')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-current', on ? 'page' : 'false');
    b.classList.toggle('live', b.dataset.tab === 'workout' && !!S.draft);
  }
  // A brand-new user on Welcome picks how to start before the empty tabs appear.
  $('#tabs').hidden = parseRoute().name === 'setup' && !S.settings.onboarded;
  for (const b of document.querySelectorAll('#app .iconbtn[aria-label]:not([title]), #app .tipq:not([title])')) b.title = b.getAttribute('aria-label');
  out.after?.(sc);
  wake();
  paintTimer();
}

/** Reload once the workout draft (typing is saved a moment later) is safely written. */
const reloadSaved = () => saveDraft().then(() => location.reload());

async function quickStart() {
  if (S.draft) return go('workout');
  const t = todayIso(), day = dayForDate(t);
  if (!day.slots.length) return toast('Rest day today. Tap Train anyway to do a workout.', 'flat');
  await today.actions.start({ dataset: { date: t } });
}

// ---- event delegation ---------------------------------------------------------
function dispatch(kind, ev) {
  const attr = kind === 'click' ? 'act' : 'input';
  const el = ev.target.closest(`[data-${attr}]`);
  if (!el) return;
  if (kind !== 'click' && !el.matches('input,select,textarea')) return;
  const name = el.dataset[attr];
  const fn = current?.view.actions?.[name] || GLOBAL[name] || daily.actions?.[name] || learnView.actions[name]; // daily tiles and the learn card also live on Today
  if (!fn) return;
  if (kind === 'click') learnView.learnFrom({ act: name });
  if (kind === 'click') ev.preventDefault();
  Promise.resolve(fn(el, ev, current.route)).catch(err => { console.error(err); toast(err.message || 'Something went wrong', 'down'); });
}
// Long-press an icon-only button to see what it does (phones have no hover tooltips).
let pressT = null, pressShown = false;
document.addEventListener('pointerdown', ev => {
  const b = ev.target.closest?.('.iconbtn[aria-label], .tipq[aria-label], .whybtn[aria-label]');
  clearTimeout(pressT); pressShown = false;
  if (b) pressT = setTimeout(() => { pressShown = true; toast(b.getAttribute('aria-label')); navigator.vibrate?.(10); }, 550);
});
for (const t of ['pointerup', 'pointercancel', 'pointerleave']) document.addEventListener(t, () => clearTimeout(pressT));
document.addEventListener('click', ev => { if (pressShown) { pressShown = false; ev.preventDefault(); ev.stopPropagation(); } }, true);
document.addEventListener('click', ev => { unlockAudio(); dispatch('click', ev); });
// In-app links go through go(), so every history entry knows its depth.
document.addEventListener('click', ev => {
  const a = ev.target.closest('a[href^="#/"]');
  if (!a || ev.defaultPrevented || ev.button || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.altKey) return;
  ev.preventDefault();
  go(a.getAttribute('href').slice(2));
});
document.addEventListener('change', ev => dispatch('change', ev));
// Tapping a number field selects it, so typing replaces "25" instead of making "257".
document.addEventListener('focusin', ev => {
  const t = ev.target;
  if (t.matches?.('input[type="number"], input[inputmode="decimal"]')) setTimeout(() => { try { t.select(); } catch {} }, 0);
});
// Decimal fields are text fields: a number field silently drops the "," that many phone keyboards
// type (42,5 became 425, or nothing at all). Take "," as ".", and keep only digits and one point.
document.addEventListener('input', ev => {
  const t = ev.target;
  if (!t.matches?.('input[inputmode="decimal"]')) return;
  const v = t.value, at = t.selectionStart ?? v.length;
  const clean = s => { const x = s.replace(/,/g, '.').replace(/[^\d.]/g, ''); const i = x.indexOf('.'); return i < 0 ? x : x.slice(0, i + 1) + x.slice(i + 1).replace(/\./g, ''); };
  const nv = clean(v);
  if (nv === v) return;
  t.value = nv;
  const c = clean(v.slice(0, at)).length;
  try { t.setSelectionRange(c, c); } catch {}
});

// Most lost data is someone not knowing what deletes it: say where it lives, what clears it, and offer a backup.
function dataKept() {
  const li = s => `<li>${esc(s)}</li>`;
  const sheet = openSheet(`<h2 class="sh-title">How your data is kept</h2><ul class="steps">
    ${li('Only on this phone, in the storage of the browser the app runs in. It is not copied to a server or to your other devices, so no one can bring it back, not even the developer.')}
    ${li('What is kept: your workouts, exercises, plan, body weight, measurements, progress photos and settings.')}
    ${li("Deleted by: uninstalling the app, clearing the browser's data for it, cleaner apps, or a phone reset.")}
    ${isIOS() && !standalone() ? li("On iPhone, keep the app on the Home Screen: Safari clears websites it hasn't seen for 7 days.") : ''}
    ${li('Safe through: closing, restarting, updates and going offline.')}
    ${li('New phone? Save a backup, then restore it there.')}</ul>
    <div class="row2"><a class="btn" href="#/data">Back up now</a><button class="btn ghost" data-x="ok">Got it</button></div>`, { label: 'How your data is kept' });
  sheet.addEventListener('click', e => { if (e.target.closest('[data-x], a[href^="#/"]')) closeSheet(); });
}
// What the browser itself recorded, so "never uploads your workouts" can be checked rather than trusted.
function netCheck() {
  const hosts = [...new Set(performance.getEntriesByType('navigation').concat(performance.getEntriesByType('resource')).map(e => { try { return new URL(e.name).host; } catch { return ''; } }).filter(Boolean))];
  const what = h => (h === location.host ? "we go gim's own files (the app itself)"
    : h === 'cdnjs.cloudflare.com' ? 'The PDF reader, fetched when you import a PDF. Your file is read on this phone.'
    : /(^|\.)google\.com$/.test(h) ? 'Google Forms: feedback you chose to send'
    : 'Not expected: please tell the developer');
  const sheet = openSheet(`<h2 class="sh-title">Check it yourself</h2>
    <p class="sh-body">Every website this page has contacted since it opened, as your browser recorded it:</p>
    ${hosts.every(h => h === location.host) ? `<div class="warn netok" style="--k:var(--up)"><span>Only the app's own website. Nothing else.</span></div>` : ''}
    <ul class="steps nethosts">${hosts.map(h => `<li><b>${esc(h)}</b><br><small>${esc(what(h))}</small></li>`).join('')}</ul>
    <p class="fine">Try this: turn on airplane mode, then log a set. It still works.</p>
    <p class="fine"><a href="https://github.com/fir1412/we-go-gim" target="_blank" rel="noopener">The app is open source: anyone can read the code on GitHub.</a></p>
    <button class="btn" data-x="ok">Got it</button>`, { label: 'Check it yourself' });
  sheet.addEventListener('click', e => { if (e.target.closest('[data-x], a[href^="#/"]')) closeSheet(); });
}
const GLOBAL = {
  tip: el => toast(TIP(el.dataset.k)),
  'timer-add': () => { if (S.draft?.timer) { S.draft.timer.end += 30000; saveDraft(); paintTimer(); restNotice(); } },
  // Changing language reloads, so every screen, tab label and date is rebuilt in the new language.
  async 'set-lang'(el) {
    const v = el.value || el.dataset.v;
    if (!LANGS.some(([k]) => k === v) || v === getLang()) return;
    await saveSettings({ lang: v });
    await reloadSaved();
  },
  'cal-export': async () => (await loadView('more')).exportCalendar(),
  install: () => promptInstall(),
  'data-kept': () => dataKept(),
  // Shown under the language picker while a translation is on; the app info sent with it names the language.
  'lang-suggest': async () => (await import('./feedback.js')).openFeedback(APP_VERSION, 'Idea', 'Which words read wrong, and what would you say instead?'),
  'net-check': () => netCheck(),
  'reload-app': () => reloadSaved(),
  'timer-skip': () => { if (S.draft) { S.draft.timer = null; saveDraft(); paintTimer(); restNotice(); } },
};

// ---- rest timer ---------------------------------------------------------------------
let beeped = null;
export function startTimer(sec, label) {
  if (!S.draft) return;
  S.draft.timer = { end: Date.now() + sec * 1000, label };
  beeped = null;
  saveDraft();
  paintTimer();
  restNotice();
  offerNotice();
}

// The first rest of a workout: offer the rest-over notification once, where it's useful, not buried in Settings.
function offerNotice() {
  if (globalThis.gimNative) {
    if (!S.settings.restNotifyAsked && !S.draft?.past) {
      saveSettings({ restNotifyAsked: true });
      toast('Buzz when rest is over?', 'upper', { action: { label: 'Turn on', fn: async () => {
        if (await globalThis.gimNative.notificationPermission()) { await saveSettings({ restNotify: true }); restNotice(); }
      } } });
    }
    return;
  }
  if (S.settings.restNotify || S.settings.restNotifyAsked || !('Notification' in window) || Notification.permission === 'denied' || S.draft?.past) return;
  saveSettings({ restNotifyAsked: true });
  setTimeout(() => toast('Buzz when rest is over?', 'upper', { action: { label: 'Turn on', fn: async () => {
    const p = await Notification.requestPermission().catch(() => 'denied');
    if (p === 'granted') { await saveSettings({ restNotify: true }); restNotice(); toast('Rest alerts on. Change it in More → Settings.', 'up'); }
    else toast('Notifications are blocked for this app in your phone settings.', 'flat');
  } } }), 1200);
}

// A system notification when rest ends while the app is in the background or the screen is off.
// Best effort: the phone may pause a web app that has been in the background for a while.
let noticeT = null;
export function restNotice() {
  clearTimeout(noticeT);
  const t = S.draft?.timer;
  if (globalThis.gimNative) { globalThis.gimNative.restNotification(t, S.settings.restNotify).catch(console.error); return; }
  if (!t || !S.settings.restNotify || !('Notification' in window) || Notification.permission !== 'granted') return;
  noticeT = setTimeout(async () => {
    if (document.visibilityState === 'visible' || S.draft?.timer?.end !== t.end) return;
    try {
      const reg = await navigator.serviceWorker?.ready;
      const opts = { body: t.label, tag: 'rest', renotify: true, vibrate: [200, 100, 200], icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
      if (reg?.showNotification) await reg.showNotification('Rest done. Next set.', opts); else new Notification('Rest done. Next set.', opts);
    } catch {}
  }, Math.max(0, t.end - Date.now()));
}
const OVER_MAX = 10 * 60; // a forgotten bar closes itself after 10 minutes over
function paintTimer() {
  const el = $('#timer');
  const t = S.draft?.timer;
  if (!t) { el.hidden = true; return; }
  const left = Math.ceil((t.end - Date.now()) / 1000);
  if (left <= 0) {
    if (beeped !== t.end) { beeped = t.end; alertDone(); }
    // Rest over: the bar stays and counts up (+0:45) as a nudge, until the next tick or Close. Never saved as data.
    if (left < -OVER_MAX) { S.draft.timer = null; saveDraft(); el.hidden = true; return; }
  }
  el.hidden = false;
  el.classList.toggle('over', left <= 0);
  const a = Math.abs(left);
  // Build once, then only update text, so taps on the buttons are never lost mid-rebuild.
  if (!el.firstChild) el.innerHTML = `<span class="num"></span><span class="t"><span class="st"></span><b></b></span><button data-act="timer-add">+30s</button><button data-act="timer-skip"></button>`;
  el.querySelector('.num').textContent = `${left < 0 ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`;
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

/** First visit: follow the phone's language when the app speaks it. */
function guessLang() {
  return pickLang(navigator.languages || [navigator.language || 'en']);
}

// ---- theme ------------------------------------------------------------------------
export function applyTheme() {
  // Other languages always use plain wording: the dictionaries translate the plain-English text.
  const en = getLang() === 'en';
  setWording(!en ? 'plain' : S.settings.wording || (S.settings.setupAnswers?.experience === 'experienced' ? 'expert' : 'plain'));
  setDateLang(getLang());
  if (!en) setUserNames([...S.program.days.map(d => d.name), ...S.exercises.map(x => x.name), ...(S.settings.templates || []).map(t => t.name)]);
  setPlain(!expertWording(), en ? null : translate);
  setUnits(S.settings.units || 'kg');
  setBwLabel(T('bw'));
  document.documentElement.dataset.text = ['large', 'xl'].includes(S.settings.textSize) ? S.settings.textSize : '';
  const t = S.settings.theme;
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem('wgg-theme', t === 'dark' || t === 'light' ? t : ''); } catch { /* js/first.js falls back to the phone's theme */ }
  applyPalette(S.settings);
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#0F1117');
}
matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', () => S.settings && applyTheme());

// ---- first-run tour and "what's new" ------------------------------------------------------
export const APP_VERSION = '1.10.0';
const WHATS_NEW = {
  '1.10.0': ['Share a moment: a finished workout, a new best, your streak, a month or your level, as a picture for WhatsApp or a story. Drawn on your phone, nothing is uploaded, and weights stay off unless you turn them on'],
  '1.9.15': ['Opens with an outline of the app at once, instead of a blank screen, while it starts on a slow phone'],
  '1.9.14': ['Clearer Malay, Chinese and Japanese: one word for each thing on every screen, and the last English bits (chart labels, level names, empty months) are translated'],
  '1.9.13': ['Sample data now fills every screen: sleep, heart rate, a pain flag with a note, and two weeks of the daily log', 'Daily targets show on Today on rest days too', 'Using the app in Malay, Chinese or Japanese? Suggest a better word under the language picker. The daily charts and a workout’s sleep and feel line are now translated'],
  '1.9.12': ['Check it yourself: see every website the app has contacted (from Welcome or Settings)', 'How your data is kept: where your workouts live, what can delete them, and a backup button (Settings)'],
  '1.9.11': ['App colours: pick a palette in More → Settings (Graphite, Midnight, Forest, Ember, Grape) or set your own background and card colours. Text stays readable on whatever you pick'],
  '1.9.10': ['Install works in every browser: Safari, Firefox and Samsung Internet get their own steps, and links opened inside WhatsApp or Instagram say to open a real browser first', 'A backup with a very long imported workout now restores (trimmed to 100 exercises and 100 sets) instead of being refused'],
  '1.9.9': ['Swipe a pulled-up card down to close it'],
  '1.9.8': ['Tap 3+ reps left on the last set and the weight goes up faster: straight away, or a double step at the top of the range'],
  '1.9.7': ['Not sure yet? Look around with sample data from the welcome screen: eight made-up weeks to explore, removed with one tap on “Start for real”', 'Change a lift to kg, lb or machine levels mid-workout from its ⋮ menu (weights are always kept in kg)', 'Pain on a lift two workouts running now goes lighter and says to get it checked', 'Clearer privacy and terms pages, with a summary in every language and a contact email'],
  '1.9.6': ['Opens faster: only Today loads at start, and the other screens load in the background right after'],
  '1.9.5': ['Back goes up the app instead of retracing every screen: a few presses reach Today, and one more closes the app', 'Safer saves: a restore that fails half-way can still be undone, and an update never reloads before your last set is written', 'Easier to see and use: clearer edges on weight, reps and tick boxes, focus stays put when you tap +/−, and Undo waits while you reach for it', 'Opens faster, and the “Start workout” home-screen shortcut works again'],
  '1.9.4': ['Exercise details no longer repeat the unit after the progress range (“88.7 kg each”, not “kg each kg per dumbbell”)'],
  '1.9.3': ['Numbers you type are saved as you type, so nothing is lost if the phone locks mid-set', 'The rest timer’s “Next” updates when you skip an exercise', 'A finished exercise shows its name in full: the target tag makes room for the ^ button', 'The backup reminder on Today no longer hides behind other notices', 'Tip: swipe an exercise card left to skip it'],
  '1.9.2': ['Swipe an exercise card left to skip it. Its sets stop counting and the time left updates. Undo from the card, or use Skip exercise in the ⋮ menu', 'Calendar reminders use the same wording as the app: gym terms stay gym terms'],
  '1.9.1': ['When rest is over, the timer counts up (+0:45) so you can see how long you have been resting. It is never saved as data', 'Weights with a comma (42,5) type in properly', 'A finished exercise you opened again can be folded back with the ^ button', 'Back from an exercise’s details returns to where you were, like your workout'],
  '1.9.0': ['Programme: drag a day by its handle to move it up or down the week. The days in between shift along', 'My templates: save your week as a template, build a new plan without changing the one you train with, and switch whenever you like'],
  '1.8.4': ['The female body map now shows hair on the back view too'],
  '1.8.3': ['Learn the app: 10 short missions that show what each feature does. Skip any time and find them under More', 'Pounds work everywhere: Equipment, the exercise editor, and + and − step to the dumbbells you own', 'Set your EZ bar weight in Equipment', 'Imports keep gym and heart rate, and say why lines were left out'],
  '1.8.2': ['Exercise search finds what you mean as you type: words in any order, “pullup” or “pull-up”, best matches first', 'New users always start at the welcome screen, and a new exercise made from your programme goes straight back to it', 'Turn speed slider for the 3D muscle view', 'Many fixes from testing: safer imports and edits, long names wrap, no double saves'],
  '1.8.1': ['Prefer a plain log? Streaks, quests and badges can now be turned off in Settings'],
  '1.8.0': ['3D muscle map: every muscle. Tap a muscle to see the exercises that train it', 'Day streaks, daily quests and badges. Rest days never break your streak', 'Reminders on training days through your phone calendar', '90 more exercises, a more detailed body map, and Traditional Chinese (繁體中文)', 'Import notes and spreadsheets written in Malay, Chinese or Japanese'],
  '1.7.0': ['New languages: Bahasa Melayu, 中文 and 日本語. Pick one in Settings or on the welcome screen', 'Easier English: short forms are written out in full (like “3 sets of 8 reps” and “minutes”), and muscles have everyday names', 'Safer: spreadsheets exported from the app can’t run hidden formulas, and typing mistakes like 6000 kg are caught'],
  '1.6.2': ['Security fixes: backup files are checked field by field, the PDF reader is verified before it runs, and very long pasted lines no longer slow the app down'],
  '1.6.1': ['New app icon: a tuxedo kitten with its dumbbells'],
  '1.6.0': [
    'Works on tablets and computers: a wider layout, and on big screens a side menu and centred pop-ups',
    'Levels shows a real muscle map, front and back, with a Male / Female switch',
    'Forearms and neck now level up: wrist curls, hammer curls, deadlifts, shrugs, plus new farmer’s carry and neck exercises',
  ],
  '1.5.0': [
    'New app icon',
    'Day colours: any colour from the full colour wheel, or type a hex code (More → Programme → tap a day → colour dot)',
    'Import reads far more: Hevy and FitNotes in pounds, Jefit, MyFitnessPal, StrongLifts, Garmin, German GymBook, Excel dates, WhatsApp and Telegram chats, Notion, Evernote, Google Docs, RTF, email, and lift names in German, Spanish, French, Portuguese, Italian and Chinese',
    'Photos, spreadsheets and zip files now say what to do instead of failing',
    'Setup no longer asks your experience twice',
    'Rest alerts offered at your first rest; one-tap "Back up now"; turn off missed-workout reminders in Settings',
    'Measurements in inches when you use lb; save progress photos to your phone',
  ],
  '1.4.0': [
    'History shows any month, with a recap card: days trained, sets, weight lifted, bests and your most improved lift',
    'Progress tab: Insights and Levels together, with strength standards on the big barbell lifts',
    'Measurements and progress photos: Progress → Body weight → Measurements',
    'Workouts: pair two exercises as a superset, add cardio, one-tap warm-ups, and Light / Medium / Heavy to pick a starting weight on new lifts',
    'Optional notification when rest is over, even with the screen off (More → Settings)',
    'Today: offers to do a missed workout or skip it, and reminds you to back up',
    'Ready-made plans: full body, upper / lower, push pull legs, 5×5 and dumbbells at home',
    'Help page in More, Undo instead of "are you sure?" for small deletes, and long-press any icon to see what it does',
    'Long-press the app icon for Start workout, Log cardio and Weigh in shortcuts',
    'Plain words or gym terms: pick in More → Settings. Plain says "reps left" and "find your weight"; gym terms say RIR and calibrate. Tap a ? to see what a term means',
    'kg or lb: pick in More → Settings. Weights are stored in kg, so switching never changes your history; imported logs in pounds are converted',
    'Short on time? Choose 20, 30 or 45 minutes on Today and the workout trims itself to fit',
    'Hold + or − to change a weight quickly, and a Finish button at the bottom once every set is ticked',
    'Steadier time-left estimate during workouts',
    'Your programme can carry notes like "@ 80%", "RPE 8" or "5+": they show on Today and on the workout card',
    'Daily targets on Today: protein, calories, water, steps and sleep',
    'Insights stay calm for your first weeks: no "not trained lately" warnings before you have history',
    'Experienced lifters no longer start as "Rookie"; text scales with your phone\'s font size; better screen-reader labels',
    'Barbell staples in the library: barbell bench, deadlift, overhead press, front squat, barbell row, trap bar deadlift, snatch, clean & jerk, power clean, push press, plus Nordic curl, DB curl, hip abduction, glute kickback and frog pumps',
    'Matching never mixes barbell and dumbbell lifts, and search finds other names ("bicep curl", "OHP", "hex bar")',
    'New exercises get sensible guesses (glutes, Olympic lifts, Nordic curls) and you can check equipment and main muscle before saving',
    'Paste a split written your way: "Push A" days, A1/A2 supersets, "5 sets of 5", and "@ 80%", "RPE 8" or "AMRAP" kept as notes. Lines that can\'t be added are listed',
    'Import Hevy and Strong CSV exports, US-style dates (9/21/2026) and logs in pounds',
    'Restore now finds backup files on Android, including ones saved from Drive or WhatsApp',
    'Setup: choose kg or lb and plain words or gym terms, restore a backup on the "I already have logs" path, skip without a tour, and it no longer reappears on every launch. Goal weight and height stay blank until you set them',
  ],
  '1.0.0': ['Levels tab: muscle map with XP and level-ups', 'Time left and finish time during workouts', 'Import your old PDF logs from More → Import'],
  '1.1.0': [
    'New name: we go gim',
    'Programme editor: tap a day, tap an exercise, + and − instead of typing',
    'Import reads more log formats and keeps pain and sleep comments',
    'Restore and erase keep an undo copy',
    'Install button in More; phone Back closes pop-ups',
  ],
  '1.3.1': [
    'Paste a written split (from a note, coach or chat) under More → Programme, or pick "I have my own split" when setting up',
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
// Tips are functions so they follow the wording setting (plain words or gym terms).
const TOUR = [
  ['today', 'Welcome to we go gim', () => 'A gym log that plans every session from your last one. Import old logs or restore a backup from More, or just train: new lifts ask you to find your weight the first time. Five quick tips, or skip.'],
  ['today', 'Today, pre-filled', () => `Your plan for the day with every set filled in from last time; brand-new lifts ask you to find a starting weight first. Tap a row to see why. Set sleep and pain first: a rough night makes it ${/^[aeiou]/i.test(T('hold')) ? 'an' : 'a'} ${T('hold').toLowerCase()}, with the same weights as last time.`],
  ['workout', 'Log with taps', () => 'Tick each set as you finish it. The rest timer starts itself, weights carry to the next set, and ⋮ has warm-ups, swaps and notes.'],
  ['insights', 'Progress: what to work on', () => `Lifts that have stalled (${T('plateau').toLowerCase()}), pain, new lifts to weigh up and weekly sets per muscle, plus body weight and cardio.`],
  ['levels', 'Progress: level up', () => 'Switch to Levels at the top of Progress. Hard sets earn XP for the muscles they train; personal bests earn bonus XP. Tap the body map to see each muscle.'],
  ['more', 'Your programme and data', () => 'Edit your split, import old logs from PDFs or notes, and back up to Drive. Everything stays on your phone. Suggestions are general training guidance, not medical advice.'],
];

/** Walk through the tabs. The sheet stays open while the screen behind it changes, so the tour adds one history entry, not one per step. */
export function showTour(start = 0, { onDone } = {}) {
  let i = Math.min(Math.max(0, start), TOUR.length - 1);
  touring = true;
  const sheet = openSheet('', { label: 'Quick tour', onClose: () => { touring = false; if (!S.settings.tourDone) saveSettings({ tourDone: true }); onDone?.(); } });
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
    // One dot per tip (the welcome card isn't a tip), so "Tip 2 of 5" matches the dots.
    sheet.innerHTML = `<div class="grab" aria-hidden="true"></div><div class="tour"><div class="tour-ic">${i === 0 ? ICON.workout : ICON[tab] || ICON.today}</div><p class="lbl">${i ? `Tip ${i} of ${TOUR.length - 1}` : 'Hello'}</p><h2 class="sh-title">${esc(title)}</h2><p class="sh-body">${esc(body())}</p>
      ${i ? `<div class="dots" aria-hidden="true">${TOUR.slice(1).map((_, j) => `<i class="${j + 1 === i ? 'on' : j + 1 < i ? 'done' : ''}"></i>`).join('')}</div>` : ''}
      ${install ? `<button class="btn ghost" data-t="install">${ICON.phone} Add to home screen</button>` : ''}
      <div class="row2"><button class="btn ghost" data-t="${i ? 'back' : 'skip'}">${i ? 'Back' : 'Skip'}</button><button class="btn" data-t="next">${last ? "Let's train" : i ? 'Next' : 'Show me'}</button></div>
      ${i && !last ? '<button class="linkbtn tourskip" data-t="skip">Skip the tour</button>' : ''}</div>`;
    setTimeout(() => sheet.querySelector('[data-t="next"]')?.focus({ preventScroll: true }), 40);
  };
  sheet.addEventListener('click', async e => {
    const b = e.target.closest('[data-t]'); if (!b) return;
    const t = b.dataset.t;
    if (t === 'next' && i === TOUR.length - 1) { show('today'); closeSheet(); learnView.learnTourDone(); return; }
    if (t === 'next') i++;
    else if (t === 'back') i--;
    // With the browser's own dialog the tour stays; otherwise the steps take its place, so the tour ends first.
    else if (t === 'install') { if (installEvt) { await promptInstall(); paint(); } else { show('today'); closeSheet(); learnView.learnTourDone(); promptInstall(); } return; }
    else { closeSheet(); if (canInstall()) toast('You can install the app any time from More', 'flat'); return; }
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
  // The welcome screen stays until they pick something (Skip counts). Closing the app, reopening it, or
  // installing it (the installed app opens in a new window) never counts as a choice.
  if (!S.settings.onboarded && !S.sessions.length) {
    if (S.settings.seenVersion !== APP_VERSION) saveSettings({ seenVersion: APP_VERSION });
    if (!['setup', 'import', 'data'].includes(parseRoute().name)) go('setup');
    return;
  }
  if (seen === APP_VERSION) return;
  const done = () => { if (S.settings.seenVersion !== APP_VERSION) saveSettings({ seenVersion: APP_VERSION }); };
  if (!seen && S.sessions.some(s => !s.seed)) return done(); // someone with real workouts (a restored backup) already knows the app
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
/** Offered in every browser until the app runs installed: one tap where the browser allows it, its own steps elsewhere. */
export const canInstall = () => !globalThis.gimNative && (!!installEvt || !standalone());
/** How to install in this browser, as [title, steps, note]. Only Chrome-family browsers can do it in one tap. */
function installSteps() {
  const ua = navigator.userAgent, samsung = /SamsungBrowser/.test(ua);
  // A link opened inside WhatsApp, Instagram, Facebook…: their viewer can't add apps, a real browser can.
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|TikTok|Snapchat|; wv\)/.test(ua)) return ['Open we go gim in your browser first',
    ['Tap ⋮ or ⋯ at the top', 'Open in Chrome or Safari', 'Then tap Install the app again'],
    'Apps like WhatsApp, Instagram and Facebook open links in their own viewer, which cannot add apps to the home screen.'];
  if (isIOS()) return ['Install on iPhone', ['Open this page in Safari', 'Tap Share (the square with an arrow)', 'Scroll down and tap Add to Home Screen, then Add'],
    "Safari can clear data from sites you haven't opened for 7 days, and workouts logged in a Safari tab don't move to the Home Screen app. Install first, then log."];
  if (/Android/.test(ua)) return ['Add we go gim to your home screen', [samsung ? 'Tap the menu ≡ at the bottom' : 'Tap the browser menu ⋮',
    samsung ? 'Add page to → Home screen' : 'Tap Install or Add to Home screen', 'Open we go gim from there'], ''];
  if (/Firefox\//.test(ua)) return ['Install we go gim on this computer', ['Firefox on a computer cannot install web apps. Open this page in Chrome or Edge', 'Click the install icon at the right of the address bar'], ''];
  if (/Macintosh/.test(ua) && /Version\/[\d.]+ Safari/.test(ua)) return ['Install we go gim on this Mac', ['In the menu bar, choose File', 'Add to Dock'], ''];
  return ['Install we go gim on this computer', ['Click the install icon at the right of the address bar', 'Or open the browser menu and choose Install'], ''];
}
function installSheet() {
  const [title, steps, note] = installSteps();
  const el = openSheet(`<h2 class="sh-title">${esc(title)}</h2><ol class="steps">${steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="fine">It then opens full screen from the kitten icon, works offline and updates itself. Your data stays on this phone.</p>
    ${note ? `<p class="fine">${esc(note)}</p>` : ''}<button class="btn" data-x="ok">Got it</button>`, { label: title });
  el.addEventListener('click', e => { if (e.target.closest('[data-x]')) closeSheet(); });
}
/** True when the browser's own install dialog was shown and accepted. Without one, shows this browser's steps. */
export async function promptInstall() {
  if (!installEvt) { installSheet(); return false; }
  const e = installEvt;
  installEvt = null;
  e.prompt();
  const r = await e.userChoice.catch(() => null);
  if (parseRoute().name === 'more') render();
  return r?.outcome === 'accepted';
}

// ---- boot -----------------------------------------------------------------------------
async function boot() {
  // Never run inside another site's frame (clickjacking): GitHub Pages can't send frame-ancestors, so stop here.
  if (window.top !== window.self) {
    $('#screen').innerHTML = `<div class="empty"><b>we go gim can't run inside another page.</b><p><a href="${esc(location.href)}" target="_top" rel="noopener">Open it on its own</a></p></div>`;
    return;
  }
  $('#tabs').innerHTML = TABS.map(([k, l, i]) => `<a href="#/${k}" data-tab="${k}">${i}<span>${l}</span><i class="dot"></i></a>`).join('');
  // Most people keep the phone's language: start fetching its dictionary while the data loads.
  const guess = guessLang();
  if (guess !== 'en') import(`./i18n/${guess}.js`).catch(() => {});
  try {
    await load();
  } catch (e) {
    // Storage or data couldn't load: offer a way out instead of a dead screen.
    $('#screen').innerHTML = `<div class="empty"><b>Couldn't open your data.</b><p>${esc(e.message)}</p><p class="fine">If you just restored a backup, restore an older one. Otherwise close other tabs of the app and reload.</p><button class="btn" data-act="reload-app">Reload the app</button><a class="btn ghost" href="#/data">Backup and restore</a></div>`;
    document.addEventListener('click', ev => { if (ev.target.closest('[data-act="reload-app"]')) location.reload(); });
    return;
  }
  await setLang(S.settings.lang || guessLang()).catch(() => setLang('en'));
  applyTheme();
  onChange(() => { applyTheme(); render(); });
  // Another tab changed the data: reload it here too (after the workout in progress is saved, not in the middle of one).
  db.onRemoteChange(async () => {
    if (S.draft) return toast('Changes were made in another tab. They will show after this workout.', 'flat');
    await load(); applyTheme(); render();
  });
  db.onSaveFailed(() => toast(db.storageMode() === 'localstorage' ? "Couldn't save: this browser's storage is full. Save a backup now, then free space or use Chrome normally (not private mode)." : "Couldn't save that change. Save a backup and reload.", 'down'));
  if (db.storageMode() === 'localstorage') setTimeout(() => toast('This browser limits storage (private mode?). Save backups often, or open the app normally.', 'flat'), 1500);
  window.addEventListener('hashchange', () => { if (sheetOpen()) closeSheet(); render(); });
  render();
  document.body.classList.add('ready');
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1500));
  idle(() => Object.keys(LAZY).reduce((p, n) => p.then(() => loadView(n).catch(() => {})), Promise.resolve()));
  // Confirm a reload caused by an update, so a manual "Check for updates" visibly lands.
  try { if (sessionStorage.getItem('wgg-updated')) { sessionStorage.removeItem('wgg-updated'); setTimeout(() => toast('Updated to the latest version', 'up'), 300); } } catch {}
  onboarding();
  import('./feedback.js').then(m => m.flushFeedback()).catch(() => {});
  if (!globalThis.gimNative && 'serviceWorker' in navigator && location.protocol !== 'file:') {
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
      reloadSaved().catch(() => { reloading = false; }); return true;
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
