// Daily targets: protein, calories, water, steps and sleep, logged with a few taps.
import { S, todayIso, saveDaily, saveSettings, dailyTargets } from '../state.js';
import { addDays, dowOf } from '../engine.js';
import { esc, fmtDate, toast, openSheet, closeSheet, barChart, dowName, ICON } from '../ui.js';

// key, label, unit, quick-add steps, colour, input step
export const METRICS = [
  ['protein', 'Protein', 'g', [10, 20, 40], 'push', 1],
  ['kcal', 'Calories', 'kcal', [100, 250, 500], 'flat', 10],
  ['water', 'Water', 'L', [0.25, 0.5, 1], 'upper', 0.25],
  ['steps', 'Steps', '', [1000, 2500, 5000], 'up', 100],
  ['sleep', 'Sleep', 'h', null, 'legs', 0.5],
];
const SLEEP_PRESETS = [5, 6, 7, 8, 9];
const meta = k => METRICS.find(m => m[0] === k);
/** 2750 → "2,750", 3.5 → "3.5", 0.25 → "0.25", 0 → "0". */
const fmt = (k, v) => (v == null || v === '' ? '—' : k === 'steps' || k === 'kcal' ? Math.round(v).toLocaleString('en-GB') : String(+(+v).toFixed(2)));
const withUnit = (k, v) => { const u = meta(k)[2]; return `${fmt(k, v)}${u ? ' ' + u : ''}`; };

/** Compact card for the Today screen. Tapping a metric opens its quick-add sheet. */
export function dailyCard(date = todayIso(), { link = true } = {}) {
  const t = dailyTargets(), d = S.daily[date] || {};
  const shown = METRICS.filter(([k]) => t[k] != null);
  if (!shown.length) return link ? `<section class="box dailycard"><div class="cap"><b>Daily targets</b><a class="linkbtn" href="#/daily">Set targets</a></div></section>` : '';
  const tiles = shown.map(([k, label, unit, , c]) => {
    const v = d[k] ?? (k === 'sleep' ? null : 0), pct = t[k] ? Math.min(1, v / t[k]) : 0, hit = t[k] && v >= t[k];
    return `<button class="dtile ${hit ? 'hit' : ''}" data-act="daily-open" data-k="${k}" style="--k:var(--${c})" aria-label="${esc(`${label} ${fmt(k, v)}/${fmt(k, t[k])}${unit ? ' ' + unit : ''}${v == null ? ', not logged' : ''}${hit ? ', target reached' : ''}. Tap to add`)}">
      <span class="dt-l">${label}${hit ? ICON.check : ''}</span><b class="num">${fmt(k, v)}<small>/${fmt(k, t[k])}${unit ? ' ' + unit : ''}</small></b><i class="dt-bar"><i style="width:${(pct * 100).toFixed(0)}%"></i></i></button>`;
  }).join('');
  return `<section class="box dailycard"><div class="cap"><b>Today's targets</b>${link ? `<a class="linkbtn" href="#/daily">Last 7 days</a>` : ''}</div><div class="dtiles">${tiles}</div></section>`;
}

export function render() {
  const t = todayIso(), tg = dailyTargets();
  let h = dailyCard(t, { link: false });
  let charts = 0;
  for (const [k, label, unit, , c] of METRICS) {
    if (tg[k] == null) continue;
    const bars = [];
    for (let i = 6; i >= 0; i--) { const day = addDays(t, -i); bars.push({ label: i ? dowName(dowOf(day)) : 'Today', v: +(+(S.daily[day]?.[k] ?? 0)).toFixed(k === 'water' ? 2 : 0), k: c }); }
    if (!bars.some(b => b.v)) continue;
    charts++;
    const past = bars.slice(0, 6).filter(b => b.v);
    const avg = past.length ? past.reduce((a, b) => a + b.v, 0) / past.length : 0;
    const hits = bars.filter(b => b.v >= tg[k]).length;
    h += `<div class="box chart"><div class="cap"><b>${label}</b><span><span>target ${withUnit(k, tg[k])}</span>${avg ? ` · <span>avg ${fmt(k, avg)}</span>` : ''} · <span>hit ${hits} of 7 days</span></span></div>${barChart(bars, { unit, height: 100, label: `${label}, last 7 days` })}</div>`;
  }
  if (!charts) h += `<div class="box pad"><p class="fine">Tap a target above to log it. Your last 7 days show up here.</p></div>`;
  h += `<button class="btn ghost" data-act="daily-targets">Change targets</button>
    <p class="fine">Targets are yours to set; leave one empty to hide it. Protein starts at about 1.8 g per kg of body weight. General guidance, not medical or dietary advice.</p>`;
  return { title: 'Daily targets', sub: fmtDate(t, { dow: true }), back: 'today', html: h, color: 'push' };
}

let lastAdd = null; // {k, v} so a mistaken tap can be undone

function sheetStatus(k) {
  const v = S.daily[todayIso()]?.[k], tg = dailyTargets()[k];
  const left = tg != null && (v ?? 0) < tg ? ` · ${withUnit(k, tg - (v ?? 0))} to go` : tg != null ? ' · target reached' : '';
  return `${withUnit(k, v ?? 0)} of ${tg != null ? withUnit(k, tg) : 'no target'} today${left}`;
}

function quickSheet(k) {
  const [, label, unit, steps, , step] = meta(k);
  const v = S.daily[todayIso()]?.[k];
  lastAdd = null;
  const sleep = k === 'sleep';
  openSheet(`<h2 class="sh-title">${label}</h2>
    <p class="sh-body" id="daily-status" aria-live="polite">${esc(sheetStatus(k))}</p>
    ${steps ? `<div class="row3">${steps.map(s => `<button class="btn" data-act="daily-add" data-k="${k}" data-v="${s}">+ ${withUnit(k, s)}</button>`).join('')}</div>
      <button class="linkbtn" data-act="daily-undo" data-k="${k}" id="daily-undo" hidden>Undo last add</button>` : ''}
    ${sleep ? `<div class="chips" role="group" aria-label="Hours slept">${SLEEP_PRESETS.map(h => `<button class="mini" data-act="daily-sleep" data-v="${h}" aria-pressed="${+v === h}">${h}${h === 9 ? '+' : ''} h</button>`).join('')}</div>` : ''}
    <label class="field"><span>${sleep ? 'Or type hours slept last night' : "Or type today's total"}</span><input class="inp" id="daily-v" type="text" inputmode="decimal" autocomplete="off" step="${step}" min="0" value="${v ?? ''}"></label>
    <div class="row2"><button class="btn ghost" data-act="daily-clear" data-k="${k}">Clear today</button><button class="btn" data-act="daily-set" data-k="${k}" style="--c:var(--up)">Save total</button></div>
    ${steps ? `<button class="btn ghost" data-act="daily-done">Done</button>` : ''}`, { label });
}

/** Keep the sheet open after a quick add so several taps in a row are quick; just refresh its numbers. */
function paintSheet(k) {
  const st = document.getElementById('daily-status');
  if (st) st.textContent = sheetStatus(k);
  const inp = document.getElementById('daily-v');
  if (inp) inp.value = S.daily[todayIso()]?.[k] ?? '';
  const u = document.getElementById('daily-undo');
  if (u) { u.hidden = !lastAdd; if (lastAdd) u.textContent = `Undo +${withUnit(k, lastAdd.v)}`; }
}

async function setSleep(v) {
  await saveDaily(todayIso(), { sleep: v });
  // Hours slept also set today's readiness, which holds loads after a short night.
  if (v != null) { const { setReadiness } = await import('../state.js'); await setReadiness({ sleep: v < 6 ? '<6' : v < 7 ? '6–7' : '7+' }); }
}

export const actions = {
  'daily-open'(el) { quickSheet(el.dataset.k); },
  async 'daily-add'(el) {
    const k = el.dataset.k, t = todayIso(), add = +el.dataset.v;
    const v = +((S.daily[t]?.[k] || 0) + add).toFixed(2);
    lastAdd = { k, v: add };
    await saveDaily(t, { [k]: v });
    paintSheet(k);
  },
  async 'daily-undo'(el) {
    const k = el.dataset.k, t = todayIso();
    if (!lastAdd || lastAdd.k !== k) return;
    const v = Math.max(0, +((S.daily[t]?.[k] || 0) - lastAdd.v).toFixed(2));
    lastAdd = null;
    await saveDaily(t, { [k]: v || null });
    paintSheet(k);
  },
  'daily-done'() { closeSheet(); },
  async 'daily-sleep'(el) {
    const v = +el.dataset.v;
    closeSheet();
    await setSleep(v);
    toast(`Sleep: ${v} h`, 'up');
  },
  async 'daily-set'(el) {
    const k = el.dataset.k, raw = document.getElementById('daily-v').value.trim(), v = raw === '' ? null : +raw;
    if (v != null && !(v >= 0 && v < 100000) || (k === 'sleep' && v > 24)) return toast(k === 'sleep' ? 'Enter hours between 0 and 24' : 'Enter a number', 'flat');
    closeSheet();
    if (k === 'sleep') await setSleep(v);
    else await saveDaily(todayIso(), { [k]: v });
    toast(v == null ? `${meta(k)[1]} cleared` : `${meta(k)[1]}: ${withUnit(k, v)}`, 'up');
  },
  async 'daily-clear'(el) { closeSheet(); await saveDaily(todayIso(), { [el.dataset.k]: null }); toast(`${meta(el.dataset.k)[1]} cleared for today`); },
  'daily-targets'() {
    const t = S.settings.targets || {}, d = dailyTargets();
    openSheet(`<h2 class="sh-title">Daily targets</h2><p class="sh-body">Leave a box empty to hide that target.</p>
      ${METRICS.map(([k, label, unit, , , step]) => `<label class="field"><span>${label}${unit ? ` (${unit})` : ''}</span><input class="inp" id="tg-${k}" type="text" inputmode="decimal" autocomplete="off" step="${step}" min="0" value="${esc(t[k] === null ? '' : d[k] ?? '')}" placeholder="${k === 'kcal' ? 'e.g. 2500' : 'hidden'}"></label>`).join('')}
      <button class="btn" data-act="daily-targets-save" style="--c:var(--up)">Save targets</button>`, { label: 'Daily targets' });
  },
  async 'daily-targets-save'() {
    const targets = {};
    for (const [k] of METRICS) { const raw = document.getElementById('tg-' + k).value.trim(); targets[k] = raw === '' || !(+raw > 0) ? null : +raw; }
    closeSheet();
    await saveSettings({ targets });
    toast('Targets saved', 'up');
  },
};
