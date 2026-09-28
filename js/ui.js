// Shared UI helpers: escaping, formatting, chips, charts, sheets, toasts.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ESC[c]);

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MONTHS = MON;
export const parts = iso => { const [y, m, d] = iso.split('-').map(Number); return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }; };
export const fmtDate = (iso, { year = false, dow = false } = {}) => {
  if (!iso) return '';
  const p = parts(iso);
  return `${dow ? DOW[p.dow] + ' ' : ''}${p.d} ${MON[p.m - 1]}${year ? ' ' + p.y : ''}`;
};
export const dowName = (i, long = false) => (long ? DOW_LONG : DOW)[i];
export const num = (v, dp = 1) => (v == null || isNaN(v) ? '—' : String(+(+v).toFixed(dp)));
export const kfmt = v => Math.round(v).toLocaleString('en-GB');

export const COLORS = ['push', 'pull', 'legs', 'upper', 'legsb', 'arms', 'rest'];
export const cvar = c => `var(--${COLORS.includes(c) ? c : 'upper'})`;

export const CHIP = {
  reps: ['+1 rep', 'up'], load: ['', 'up'], cal: ['Calibrate', 'upper'], check: ['Set units', 'flat'],
  log: ['Log reps', 'flat'], hold: ['Hold', 'mute'], plat: ['Plateau watch', 'flat'], deload: ['Deload', 'legs'],
};
export function chip(sg, ex) {
  if (!sg) return '';
  const [t, k] = CHIP[sg.t] || ['', 'mute'];
  let txt = t;
  if (sg.t === 'load') txt = ex.unit === 'L' ? `+${sg.inc} level` : `+${num(sg.inc, 2)} kg`;
  if (sg.t === 'plat' && sg.status === 'plateau') txt = 'Plateau';
  return `<span class="pill" style="--k:var(--${k})">${esc(txt)}</span>`;
}
export const pill = (txt, k = 'mute') => `<span class="pill" style="--k:var(--${k})">${esc(txt)}</span>`;

export const STATUS = {
  up: ['Progressing', 'up'], flat: ['Flat', 'flat'], down: ['Dipped', 'down'],
  watch: ['Plateau watch', 'flat'], plateau: ['Plateau', 'down'], new: ['New', 'upper'], none: ['No data', 'mute'],
};

/** Small sparkline. */
export function spark(pts, k = 'up', W = 64, H = 28) {
  if (!pts.length) return '';
  const mn = Math.min(...pts), mx = Math.max(...pts), pd = 4;
  const y = v => (mx === mn ? H / 2 : H - pd - (v - mn) / (mx - mn) * (H - 2 * pd));
  const xy = pts.map((v, i) => [pts.length === 1 ? W / 2 : pd + i * (W - 2 * pd) / (pts.length - 1), y(v)]);
  const line = xy.map(q => q.map(n => n.toFixed(1)).join(',')).join(' ');
  const e = xy[xy.length - 1];
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" aria-hidden="true"><polygon points="${xy[0][0]},${H} ${line} ${e[0]},${H}" fill="var(--${k})" opacity=".15"/><polyline points="${line}" fill="none" stroke="var(--${k})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${e[0]}" cy="${e[1]}" r="3" fill="var(--${k})"/></svg>`;
}

/** Line chart over dates. series: [{date, v, label?}], opts: {k, goal, unit, height} */
export function lineChart(series, { k = 'push', goal = null, unit = '', height = 150, label = 'chart', dp = 1 } = {}) {
  if (series.length < 1) return `<p class="fine">Not enough data yet.</p>`;
  const W = 340, H = height, L = 34, R = 14, T = 16, B = 22;
  const t = series.map(p => Date.parse(p.date));
  const t0 = Math.min(...t), t1 = Math.max(...t), span = t1 - t0 || 1;
  let vs = series.map(p => p.v);
  if (goal != null) vs = vs.concat(goal);
  let y0 = Math.min(...vs), y1 = Math.max(...vs);
  const pad = (y1 - y0) * 0.12 || Math.max(1, y1 * 0.05);
  y0 -= pad; y1 += pad;
  const X = ms => (series.length === 1 ? (L + W - R) / 2 : L + (ms - t0) / span * (W - L - R));
  const Y = v => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const ticks = niceTicks(y0, y1, 3);
  let g = '';
  for (const v of ticks) g += `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${L - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" font-size="10" fill="var(--mute)">${+v.toFixed(1)}</text>`;
  if (goal != null) g += `<line x1="${L}" x2="${W - R}" y1="${Y(goal)}" y2="${Y(goal)}" stroke="var(--up)" stroke-width="1.5"/><text x="${W - R}" y="${Y(goal) - 4}" text-anchor="end" font-size="10" fill="var(--up)">goal ${goal}</text>`;
  const pts = series.map(p => [X(Date.parse(p.date)), Y(p.v)]);
  const line = pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  if (pts.length > 1) g += `<polygon points="${pts[0][0].toFixed(1)},${H - B} ${line} ${pts[pts.length - 1][0].toFixed(1)},${H - B}" fill="var(--${k})" opacity=".13"/><polyline points="${line}" fill="none" stroke="var(--${k})" stroke-width="2.5" stroke-linejoin="round"/>`;
  pts.forEach((p, i) => {
    const last = i === pts.length - 1;
    g += `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${last ? 4.5 : 3}" fill="${last ? `var(--${k})` : 'var(--panel)'}" stroke="var(--${k})" stroke-width="2"><title>${fmtDate(series[i].date)}: ${+series[i].v.toFixed(dp)} ${unit}</title></circle>`;
    if (series[i].label) g += `<text x="${p[0].toFixed(1)}" y="${(p[1] + 16).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="var(--mute)">${esc(series[i].label)}</text>`;
  });
  const lp = pts[pts.length - 1], lv = series[series.length - 1].v;
  g += `<text x="${Math.min(lp[0], W - R) - 8}" y="${lp[1] - 8}" text-anchor="end" font-size="12" font-weight="700" fill="var(--ink)">${+lv.toFixed(dp)}</text>`;
  g += `<text x="${L}" y="${H - 6}" font-size="10" fill="var(--mute)">${fmtDate(series[0].date)}</text>`;
  if (series.length > 1) g += `<text x="${W - R}" y="${H - 6}" text-anchor="end" font-size="10" fill="var(--mute)">${fmtDate(series[series.length - 1].date)}</text>`;
  return `<svg class="chartsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
}

/** Vertical bars by label. data: [{label, v, k?}] */
export function barChart(data, { height = 120, unit = '', label = 'chart' } = {}) {
  const W = 340, H = height, L = 8, R = 8, T = 16, B = 20;
  const mx = Math.max(1, ...data.map(d => d.v));
  const bw = (W - L - R) / data.length;
  let g = '';
  data.forEach((d, i) => {
    const h = d.v / mx * (H - T - B), x = L + i * bw + bw * 0.18, w = bw * 0.64, y = H - B - h;
    g += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" fill="var(--${d.k || 'upper'})"><title>${esc(d.label)}: ${d.v} ${unit}</title></rect>`;
    if (d.v) g += `<text x="${(x + w / 2).toFixed(1)}" y="${(y - 4).toFixed(1)}" text-anchor="middle" font-size="9.5" fill="var(--mute)">${d.v}</text>`;
    g += `<text x="${(x + w / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9.5" fill="var(--mute)">${esc(d.label)}</text>`;
  });
  return `<svg class="chartsvg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${g}</svg>`;
}

function niceTicks(a, b, n) {
  const span = b - a, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(s => s * mag).find(s => span / s <= n + 1) || mag * 10;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b + 1e-9; v += step) out.push(v);
  return out;
}

// ---- sheets & toasts -------------------------------------------------------------
let sheetClose = null;
/** Open a bottom sheet. Returns the sheet element. onClose runs when it's dismissed. */
export function openSheet(html, { onClose, label = 'Dialog' } = {}) {
  closeSheet();
  const opener = document.activeElement;
  const app = document.getElementById('app');
  const wrap = document.createElement('div');
  wrap.className = 'scrim';
  // Sheets live outside #app, so carry its accent colour over.
  wrap.style.setProperty('--c', app?.style.getPropertyValue('--c') || 'var(--push)');
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}" tabindex="-1"><div class="grab" aria-hidden="true"></div>${html}</div>`;
  document.body.appendChild(wrap);
  app?.setAttribute('inert', '');
  const sheet = wrap.querySelector('.sheet');
  wrap.addEventListener('click', e => { if (e.target === wrap) closeSheet(); });
  wrap.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    if (e.key === 'Tab') { // keep focus inside the sheet
      const f = [...sheet.querySelectorAll('button:not([disabled]), a[href], input, select, textarea')].filter(x => !x.hidden);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  // Android back button closes the sheet instead of leaving the screen.
  // One history entry is reused across sheets; closing from the UI leaves it in place
  // (going back asynchronously would race a sheet that opens right after).
  if (!history.state?.sheet) history.pushState({ sheet: true }, '');
  sheetClose = () => {
    wrap.remove(); sheetClose = null;
    // Closed from the UI: we're still on the sheet's history entry. Remember it so the next
    // back press skips straight past it instead of appearing to do nothing.
    staleHref = history.state?.sheet ? location.href : null;
    app?.removeAttribute('inert');
    if (opener?.isConnected) opener.focus({ preventScroll: true });
    onClose?.();
  };
  const f = sheet.querySelector('[autofocus]') || sheet.querySelector('input, select, textarea, button');
  setTimeout(() => (f || sheet).focus({ preventScroll: true }), 30);
  return sheet;
}
export function closeSheet() { sheetClose?.(); }
let staleHref = null;
window.addEventListener('popstate', () => {
  if (sheetClose) { sheetClose(); staleHref = null; return; }
  const skip = staleHref && location.href === staleHref;
  staleHref = null;
  if (skip) history.back();
});
window.addEventListener('hashchange', () => { staleHref = null; });
export const sheetOpen = () => !!sheetClose;

/** In-app confirmation (never window.confirm). */
export function confirmSheet({ title, body = '', ok = 'Confirm', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const el = openSheet(`<h2 class="sh-title">${esc(title)}</h2>${body ? `<p class="sh-body">${body}</p>` : ''}
      <div class="row2"><button class="btn ghost" data-x="no">Cancel</button><button class="btn ${danger ? 'danger' : ''}" data-x="yes">${esc(ok)}</button></div>`,
      { label: title, onClose: () => { if (!done) resolve(false); } });
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-x]');
      if (!b) return;
      done = true; resolve(b.dataset.x === 'yes'); closeSheet();
    });
  });
}

let toastT;
export function toast(msg, k = 'ink') {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.style.setProperty('--k', `var(--${k})`);
  el.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('on'), 2600);
}

export const ICON = {
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  workout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/></svg>',
  insights: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l5-5 4 3 8-8"/><path d="M15 7h5v5"/></svg>',
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4"/></svg>',
  levels: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/></svg>',
  history: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>',
  dots: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="4" width="18" height="16" rx="4"/><path d="M9 9a4 4 0 0 1 6 0M12 9l1.5-2"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>',
  plate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7 9l5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
  save: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
};
