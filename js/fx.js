// Motion and touch feedback, kept apart from the views. Every screen is rebuilt with innerHTML, so this module
// never holds on to elements: it notes what was tapped (by its data-* attributes), waits for the rebuild,
// then finds the new element and plays a CSS class on it. Only transform and opacity move, nothing waits
// on an animation, text is never rewritten (plain.js and the translations own it), and "reduce motion"
// turns the movement off (haptics stay, following the vibration setting).
import { S } from './state.js';

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const calm = () => !!mq?.matches;
/** A short buzz, only where the phone supports it and vibration is on in Settings. */
function buzz(p) {
  try { if (S.settings?.timerVibrate !== false && typeof navigator.vibrate === 'function') navigator.vibrate(p); } catch {}
}
/** Play a one-shot animation class; replays cleanly if it is already running. */
function play(el, cls, ms = 700) {
  if (!el || calm()) return;
  const go = () => {
    el.classList.add(cls);
    clearTimeout(el._fxT?.[cls]);
    (el._fxT ||= {})[cls] = setTimeout(() => { if (el.classList.contains(cls)) el.classList.remove(cls); }, ms);
  };
  if (el.classList.contains(cls)) { el.classList.remove(cls); requestAnimationFrame(go); } else go();
}
const esc = v => (globalThis.CSS?.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&'));
/** A selector that finds "the same" control again after a re-render: its tag plus all its data-* attributes. */
function selectorFor(el) {
  const attrs = [...el.attributes].filter(a => a.name.startsWith('data-')).map(a => `[${a.name}="${esc(a.value)}"]`).join('');
  return attrs ? el.tagName.toLowerCase() + attrs : null;
}
const pressed = el => el?.getAttribute('aria-pressed') === 'true';

// ---- confetti-style star burst (small, DOM, removes itself) ------------------------------------------
const BURST_K = ['--push', '--arms', '--up', '--pull', '--legsb', '--upper'];
export function burst(el, { n = 16, spread = 70 } = {}) {
  if (calm() || !el?.isConnected) return;
  const r = el.getBoundingClientRect();
  if (!r.width || r.bottom < 0 || r.top > innerHeight) return;
  const layer = document.createElement('div');
  layer.className = 'fx-burst';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.left = `${r.left + r.width / 2}px`;
  layer.style.top = `${r.top + r.height / 2}px`;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    const a = (360 / n) * i + (Math.random() * 18 - 9);
    p.style.cssText = `--a:${a.toFixed(0)}deg;--d:${(spread * (0.6 + Math.random() * 0.6)).toFixed(0)}px;--r:${(Math.random() * 540 - 270).toFixed(0)}deg;--k:var(${BURST_K[i % BURST_K.length]});animation-delay:${(Math.random() * 60).toFixed(0)}ms`;
    if (i % 3 === 0) p.className = 'dot';
    layer.appendChild(p);
  }
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1100);
}

// ---- taps: remember what was pressed, react once the screen has been rebuilt ------------------------
let pend = [], again = null;
function onTap(ev) {
  const b = ev.target.closest?.('button, a, [data-act]');
  if (!b || b.disabled) return;
  const act = b.dataset.act;
  const p = { sel: selectorFor(b), was: pressed(b), act };
  if (act === 'done') {
    const inp = b.closest('.set')?.querySelector('input[id^="w-"], input[id^="r-"]');
    p.uid = inp ? inp.id.replace(/^[wr]-/, '').replace(/-\d+$/, '') : null;
  }
  if (act === 'bump') p.inp = b.parentElement?.querySelector('input')?.id || null;
  const st = b.closest('.stepper');
  if (st) p.stepper = [...document.querySelectorAll('.stepper')].indexOf(st);
  p.toggle = b.hasAttribute('aria-pressed') && !p.was;
  if (!p.toggle && act !== 'bump' && p.stepper == null) return;
  p.at = performance.now();
  pend.push(p);
  // The action runs next (app.js listens on bubble) and usually re-renders at once; look after that.
  if (pend.length === 1) requestAnimationFrame(settle);
}
function settle() {
  const list = pend; pend = [];
  for (const p of list) {
    if (p.act === 'bump' && p.inp) { const i = document.getElementById(p.inp); play(i, 'fx-bump', 260); continue; }
    if (p.stepper != null && p.stepper >= 0) {
      const st = document.querySelectorAll('.stepper')[p.stepper];
      play(st?.querySelector('b, output, input'), 'fx-bump', 260);
      continue;
    }
    if (!p.sel) continue;
    const el = document.querySelector(p.sel);
    // A finished exercise folds away, taking its tick button with it.
    const card = p.uid && document.getElementById('ex-' + p.uid);
    if (p.act === 'done' && !el && card?.classList.contains('fold')) { setDone(null, p.uid); continue; }
    if (el && pressed(el)) {
      if (p.act === 'done') setDone(el, p.uid); else play(el, 'fx-pop', 360);
      // A second re-render right after (a setting saved, say) would cut the animation short: replay it there.
      again = { at: performance.now(), fn: () => { const n = document.querySelector(p.sel); if (n && pressed(n)) { play(n, 'fx-pop', 450); if (p.act === 'done') play(n.closest('.set'), 'fx-done', 700); } } };
      continue;
    }
    // Some actions save first and re-render a moment later: keep looking briefly.
    if (performance.now() - p.at < 500) pend.push(p);
  }
  if (pend.length) requestAnimationFrame(settle);
}
function setDone(btn, uid) {
  play(btn, 'fx-pop', 450);
  play(btn?.closest('.set'), 'fx-done', 700);
  const card = uid && document.getElementById('ex-' + uid);
  const allDone = card && (card.classList.contains('fold') || [...card.querySelectorAll('.check')].every(pressed));
  if (allDone) {
    buzz([14, 50, 22]);
    play(card, 'fx-cheer', 800);
    burst(card.querySelector('.foldbtn .ok') || btn, { n: 12, spread: 46 });
  } else buzz(12);
}

// ---- screen changes: slide in, fill bars, celebrate -----------------------------------------------------
let lastKey = null, lastTab = -1, lastDepth = 0, lastProg = null;
const seenBanner = new Set();
function onScreen() {
  const sc = document.getElementById('screen');
  const summary = !!sc.querySelector('[data-act="back-to-workout"]');
  const key = location.hash + (summary ? '|summary' : '');
  const tabs = [...document.querySelectorAll('#tabs a')];
  const tab = tabs.findIndex(a => a.getAttribute('aria-current') === 'page');
  const depth = location.hash.split('/').length;
  if (key !== lastKey) {
    const dir = lastKey == null ? 0 : tab !== lastTab ? Math.sign(tab - lastTab) : summary ? 1 : Math.sign(depth - lastDepth);
    lastKey = key; lastTab = tab; lastDepth = depth; lastProg = null;
    enter(sc, dir);
    if (summary) setTimeout(celebrateSummary, 420);
    const ban = sc.querySelector('.lvup-banner');
    if (ban && !seenBanner.has(ban.textContent)) { seenBanner.add(ban.textContent); setTimeout(() => burst(ban.querySelector('svg') || ban, { n: 18 }), 380); }
  }
  progress(sc);
  if (again && performance.now() - again.at < 350) again.fn(); else again = null;
}
function enter(sc, dir) {
  if (calm()) return;
  sc.style.setProperty('--fx-dx', `${dir * 16}px`);
  sc.style.setProperty('--fx-dy', dir ? '0px' : '8px');
  for (const c of sc.children) c.classList.add('fx-in');
  // Drop the class once played, so later re-renders of the same screen never replay it.
  setTimeout(() => { for (const c of sc.querySelectorAll(':scope > .fx-in')) c.classList.remove('fx-in'); }, 900);
}
/** The workout progress bar is rebuilt on every tick: grow it from where it was instead of jumping. */
function progress(sc) {
  const bar = sc.querySelector('.prog i');
  if (!bar) { lastProg = null; return; }
  const now = parseFloat(bar.style.width) || 0;
  if (lastProg != null && now !== lastProg && now > 0 && !calm()) {
    bar.animate([{ transform: `scaleX(${Math.min(1, lastProg / now)})` }, { transform: 'scaleX(1)' }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (now >= 100) play(bar.parentElement, 'fx-full', 1200);
  }
  lastProg = now;
}
function celebrateSummary() {
  const sc = document.getElementById('screen');
  const star = [...sc.querySelectorAll('.prbox')].find(b => b.querySelector('p svg'));
  const lvl = [...sc.querySelectorAll('.xpgain .pill')].find(p => p.textContent.includes('▲'));
  if (star || lvl) {
    buzz([16, 60, 16, 60, 28]);
    if (star) burst(star.querySelector('p svg') || star, { n: 18 });
    if (lvl) setTimeout(() => burst(lvl, { n: 14, spread: 56 }), star ? 260 : 0);
  }
}

// ---- tab bar: the icon of a newly chosen tab hops ---------------------------------------------------------
function onTabs(muts) {
  for (const m of muts) {
    if (m.oldValue === 'page' || m.oldValue == null) continue;
    if (m.target.getAttribute('aria-current') === 'page') play(m.target.querySelector('svg'), 'fx-hop', 500);
  }
}

// ---- sheets: close with a slide down instead of vanishing; no replay when one sheet swaps for another ----
const sheetScroll = new WeakMap();
function onBody(muts) {
  let added = null, removed = null;
  for (const m of muts) {
    for (const n of m.addedNodes) if (n.classList?.contains('scrim')) added = n;
    for (const n of m.removedNodes) if (n.classList?.contains('scrim')) removed = n;
  }
  if (added && removed) { added.classList.add('fx-swap'); return; }
  if (!removed || document.querySelector('.scrim') || calm()) return;
  // A look-alike copy that plays the closing animation: no ids, no actions, hidden from assistive tech,
  // and not a ".scrim", so nothing in the app ever mistakes it for an open sheet.
  const ghost = removed.cloneNode(true);
  ghost.className = 'fx-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  for (const el of ghost.querySelectorAll('[id], [data-act], [data-t], [data-x], [role], [autofocus]')) {
    el.removeAttribute('id'); el.removeAttribute('data-act'); el.removeAttribute('data-t'); el.removeAttribute('data-x'); el.removeAttribute('role'); el.removeAttribute('autofocus');
  }
  document.body.appendChild(ghost);
  const sh = ghost.querySelector('.sheet'), top = sheetScroll.get(removed.querySelector('.sheet'));
  if (sh && top) sh.scrollTop = top;
  setTimeout(() => ghost.remove(), 260);
}

// ---- rest timer: a draining bar, a gentle pulse in the last 5 seconds, a flash when it ends -------------
let tBar = null, tAnim = null, tObj = null, tEnd = 0, tTotal = 0, tOver = false;
function onTimer() {
  const el = document.getElementById('timer');
  const t = S.draft?.timer;
  if (!t || el.hidden || !el.firstChild) {
    tAnim?.cancel(); tAnim = null; tObj = null; tOver = false;
    // classList.remove() rewrites the attribute even when the class is absent, which would wake this
    // observer again, so only touch it when there is something to remove.
    if (el.classList.contains('fx-soon')) el.classList.remove('fx-soon');
    return;
  }
  const now = Date.now(), left = t.end - now;
  if (t !== tObj) { tObj = t; tEnd = t.end; tTotal = Math.max(1000, left); restart(el, left); }
  else if (t.end !== tEnd) { tTotal = Math.max(1000, tTotal + (t.end - tEnd)); tEnd = t.end; restart(el, left); if (t.end > now) play(el.querySelector('.num'), 'fx-bump', 260); }
  const secs = Math.ceil(left / 1000);
  const soon = secs > 0 && secs <= 5;
  if (soon !== el.classList.contains('fx-soon')) el.classList.toggle('fx-soon', soon);
  const over = el.classList.contains('over');
  if (over && !tOver) play(el, 'fx-ring', 1300);
  tOver = over;
}
function restart(el, left) {
  if (!tBar || !tBar.isConnected) {
    tBar = document.createElement('i');
    tBar.className = 'fx-tbar';
    tBar.setAttribute('aria-hidden', 'true');
    el.appendChild(tBar);
  }
  tAnim?.cancel();
  const from = Math.max(0, Math.min(1, left / tTotal));
  // A slow linear drain is information, not decoration, so it stays on with "reduce motion".
  tAnim = left > 0 ? tBar.animate([{ transform: `scaleX(${from})` }, { transform: 'scaleX(0)' }], { duration: left, easing: 'linear', fill: 'forwards' }) : null;
  if (!tAnim) tBar.style.transform = 'scaleX(0)';
}

let started = false;
/** Wires everything up once; runs by itself when the module loads in a browser. */
export function initFx() {
  if (started || typeof document === 'undefined') return;
  started = true;
  document.addEventListener('click', onTap, true);
  document.addEventListener('scroll', e => { if (e.target.classList?.contains('sheet')) sheetScroll.set(e.target, e.target.scrollTop); }, { capture: true, passive: true });
  const sc = document.getElementById('screen'), tabs = document.getElementById('tabs'), timer = document.getElementById('timer');
  if (sc) new MutationObserver(onScreen).observe(sc, { childList: true });
  if (tabs) new MutationObserver(onTabs).observe(tabs, { subtree: true, attributes: true, attributeFilter: ['aria-current'], attributeOldValue: true });
  if (timer) new MutationObserver(onTimer).observe(timer, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  new MutationObserver(onBody).observe(document.body, { childList: true });
}
if (typeof document !== 'undefined' && document.getElementById('screen')) initFx();
