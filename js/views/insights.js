import { S, todayIso, dayForDate, suggestionCtx, saveBody, deleteBody, saveCardio, deleteCardio, saveSettings, uid, refresh, saveMeasure, deleteMeasure, savePhoto, deletePhoto, loadPhoto } from '../state.js';
import {
  muscleTrends, exposures, trend, topLoad, score, isKg, suggest, deloadCheck, weekStart, addDays,
  daysBetween, weeklyRate, personalBests, compareExposure, fmtLoad, unitLong, unitShort, workSets, MUSCLES, estimateDay, toDisp, getUnits, LB_KG,
} from '../engine.js';
import { esc, fmtDate, pill, chip, spark, lineChart, barChart, STATUS, ICON, toast, confirmSheet, openSheet, closeSheet, num, cvar, GLYPH_ICON, T, helpTip, expertWording } from '../ui.js';
import { weeklyVolume, baseSets } from '../split.js';

let volWeek = 0; // 0 = this week, 1 = last week
// Body weight in the chosen unit (kg or lb), one decimal; stored in kg.
const U = () => getUnits();
const bwF = () => (getUnits() === 'lb' ? 1 / LB_KG : 1);
const bwDisp = kg => (kg == null || kg === '' || !Number.isFinite(+kg) ? null : +(+kg * bwF()).toFixed(1));
const bwKg = v => +(v / bwF()).toFixed(3);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** "? × 8" for experts, "Find weight × 8" in plain wording. */
const targetText = (ex, sg) => {
  const u = unitShort(ex.unit);
  return sg.w == null ? `${expertWording() ? '?' : 'Find weight'} × ${sg.reps.join('·')}` : `${fmtLoad(ex, sg.w)}${u ? ' ' + u : ''} × ${sg.reps.join('·')}`;
};
/** Enough history to judge gaps: 6+ logged sessions, or two weeks since the first one. Before that, gap warnings are noise. */
function settled(t) {
  let n = 0, first = null;
  for (const s of S.sessions) if (!s.seed && s.date <= t) { n++; if (!first || s.date < first) first = s.date; }
  return n >= 6 || (first != null && daysBetween(first, t) >= 14);
}
/** The weekly minimum for this user's experience, same as the plan builder. */
const minSets = () => baseSets(S.settings.setupAnswers?.experience || 'some');
/** Done sets per muscle between two dates: main muscle counts 1, helpers ½ (the same rule as the plan). */
function doneVolume(from, to) {
  const done = {};
  for (const s of S.sessions) {
    if (s.date < from || s.date > to) continue;
    for (const e of s.entries) {
      const ex = S.exById[e.exId];
      if (!ex) continue;
      const n = workSets(e).length;
      if (n) (ex.muscles || []).forEach((m, i) => { done[m] = (done[m] || 0) + (i ? n / 2 : n); });
    }
  }
  return done;
}

export function render(route) {
  switch (route.name) {
    case 'ex': return exDetail(route.args[0]);
    case 'body': return body();
    case 'cardio': return cardio();
    case 'lifts': return lifts();
    case 'measure': return measure();
    default: return overview();
  }
}

// ---- overview -------------------------------------------------------------------
function nextTrainingDay(t) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(t, i), day = dayForDate(d);
    if (!day.slots.length) continue;
    if (i === 0 && S.sessions.some(s => s.date === t && !s.seed)) continue;
    return { date: d, day };
  }
  return null;
}

/** What the next training day asks of each lift, from the same engine as the Today screen. */
function planCard(t) {
  const next = nextTrainingDay(t);
  if (!next) return `<div class="box pad"><p class="fine">No training day in your programme this week.</p></div>`;
  const ctx = suggestionCtx(next.date);
  const when = next.date === t ? 'Today' : fmtDate(next.date, { dow: true });
  const rows = [], n = { load: 0, reps: 0, cal: 0, other: 0 };
  for (const slot of next.day.slots) {
    const ex = S.exById[slot.exId];
    if (!ex) continue;
    const sg = suggest(slot, ex, ctx);
    n[sg.t in n ? sg.t : 'other']++;
    const target = targetText(ex, sg);
    rows.push(`<li><a href="#/ex/${esc(ex.id)}"><span class="nm">${esc(ex.name)}</span><span class="tg num">${esc(target)}</span>${sg.w == null && !expertWording() ? '' : chip(sg, ex)}</a></li>`);
  }
  const mins = Math.round(estimateDay(next.day, S.exById, S.sessions) / 60);
  const sum = [n.load && `${n.load} to load up`, n.reps && `${n.reps} to add a rep`, n.cal && `${n.cal} to ${expertWording() ? 'calibrate' : 'find a weight for'}`].filter(Boolean).join(' · ');
  let h = `<section class="box nextplan" style="--k:${cvar(next.day.color)}"><header><div class="grow"><small>Next session · ${esc(when)}</small><b>${esc(next.day.name)}</b></div><span class="fine">~${mins} min</span>${next.date === t ? `<a class="mini go" href="#/today">Go</a>` : ''}</header>`;
  if (sum) h += `<p class="fine">${esc(sum)}</p>`;
  h += `<ul class="plist">${rows.join('')}</ul>`;
  if (n.cal) h += `<p class="fine">${expertWording() ? 'Calibrate: pick a load for mid-range reps with 2 in reserve. It becomes the baseline.' : 'Find your weight: pick one you can lift for the middle of the rep range with about 2 reps to spare. Next time builds on it.'} ${helpTip('calibrate')}</p>`;
  return h + `</section>`;
}

function focusItems(t) {
  const items = [];
  const chk = deloadCheck(S.sessions, S.exercises, t);
  if (chk.should) items.push({ k: 'down', ic: '↓', title: expertWording() ? 'Consider a deload week' : 'Consider a lighter week', text: chk.reasons.join('. ') + '. Start one from the Today screen.' });

  const next = nextTrainingDay(t);
  if (next) {
    const ctx = suggestionCtx(t);
    const when = next.date === t ? 'Today' : fmtDate(next.date, { dow: true });
    const log = [];
    for (const slot of next.day.slots) {
      const ex = S.exById[slot.exId];
      if (!ex) continue;
      const sg = suggest(slot, ex, ctx);
      if (sg.t === 'plat') items.push({ k: 'flat', ic: '!', title: `${ex.name}: ${T(sg.status === 'plateau' ? 'plateau' : 'plateauWatch').toLowerCase()}`, text: `${when}: ${fmtLoad(ex, sg.w)} × ${sg.reps.join('·')}. ${sg.why}`, ex: ex.id });
      else if (sg.t === 'log' || sg.t === 'check') log.push(ex.name);
      else if (ex.caution && (sg.t === 'reps' || sg.t === 'load')) items.push({ k: 'down', ic: '⚑', title: `${ex.name}: go carefully`, text: ex.caution, ex: ex.id });
    }
    if (log.length) items.push({ k: 'flat', ic: '✎', title: 'Log reps or units', text: `${log.join(', ')}: the old log is missing reps or has an unclear unit.` });
  }

  const painRecent = new Map();
  for (const s of S.sessions) {
    if (s.seed || s.date > t || daysBetween(s.date, t) > 14) continue;
    for (const e of s.entries) if (e.pain && S.exById[e.exId] && !painRecent.has(e.exId)) painRecent.set(e.exId, s.date);
  }
  for (const [id, d] of painRecent) items.push({ k: 'down', ic: '⚑', title: `Pain flagged on ${S.exById[id].name}`, text: `Last on ${fmtDate(d)}. It holds its load until a pain-free session. Sharp, radiating or worsening pain needs a proper check.`, ex: id });

  // Muscles the programme trains that haven't had a working set (main or helper) in 10+ days.
  // Only once there's enough history: on day one every muscle is "untrained", which isn't news.
  const ready = settled(t);
  if (ready) {
    const lastHit = {};
    for (const s of S.sessions) {
      if (s.date > t) continue;
      for (const e of s.entries || []) {
        if (!workSets(e).length) continue;
        for (const m of S.exById[e.exId]?.muscles || []) if (!(lastHit[m] >= s.date)) lastHit[m] = s.date;
      }
    }
    const plannedSets = weeklyVolume(S.program, S.exById);
    const stale = MUSCLES.filter(m => plannedSets[m] && (!lastHit[m] || daysBetween(lastHit[m], t) >= 10))
      .map(m => ({ m, d: lastHit[m] ? daysBetween(lastHit[m], t) : null })).sort((a, b) => (b.d ?? 999) - (a.d ?? 999));
    if (stale.length) items.push({ k: 'flat', ic: '⏱', title: `Ready for some work: ${plural(stale.length, 'muscle')}`, text: `${stale.map(x => `${x.m} ${x.d == null ? 'not logged yet' : `last ${x.d} days ago`}`).join(', ')}. No need to cram it into one day; pick up the plan at the next session.` });
  }

  const legHr = S.sessions.filter(s => s.hr >= 150 && /leg/i.test(s.name) && s.date <= t && daysBetween(s.date, t) <= 28);
  if (legHr.length) items.push({ k: 'legs', ic: '♥', title: 'Leg days push your heart rate', text: `Peak ${Math.max(...legHr.map(s => s.hr))} bpm recently. Rest 2–3 min between squat sets and stop 1–3 reps short of failure.` });

  const tr = muscleTrends(S.sessions, S.exercises).filter(x => x.status === 'up' && isKg(x.ex.unit) && x.scores.length >= 2);
  if (tr.length) {
    const best = tr.map(x => ({ x, g: x.scores[x.scores.length - 1] / x.scores[0] - 1 })).sort((a, b) => b.g - a.g)[0];
    if (best.g > 0.02) items.push({ k: 'up', ic: '↑', title: `${best.x.muscle}: ${best.x.ex.name} up ${Math.round(best.g * 100)}%${best.g > 0.6 ? ' (mostly calibration)' : ''}`, text: `Estimated max across your last ${best.x.n} sessions.${best.g > 0.6 ? ' A jump this big usually includes load calibration (early weights were light), so treat it as a new baseline rather than pure strength.' : ' Keep adding reps before adding load.'}`, ex: best.x.ex.id });
  }

  if (ready) {
    const ws = weeklyVolume(S.program, S.exById), lo = minSets();
    const low = ['Chest', 'Back', 'Quads', 'Hamstrings', 'Side delts'].filter(m => (ws[m] || 0) < lo);
    if (low.length) items.push({ k: 'upper', ic: '≡', title: 'Room to grow', text: `${low.map(m => `${m} ${num(ws[m] || 0)}`).join(', ')} sets a week in your plan (helpers count half). Around ${lo} or more suits most people: add a set or two if these lag, or keep it while recovery is the limit.` });
  }
  return items.slice(0, 7);
}

function overview() {
  const t = todayIso();
  const tr = muscleTrends(S.sessions, S.exercises);
  const c = { up: 0, flat: 0, bad: 0 };
  for (const x of tr) {
    if (x.status === 'up') c.up++;
    else if (['watch', 'plateau', 'down'].includes(x.status)) c.bad++;
    else c.flat++;
  }
  let h = progressNav('insights');
  if (!S.sessions.some(s => !s.seed)) h += `<div class="box pad emptyact"><b>Your progress shows up here</b><p class="fine">After two workouts you'll see which lifts are going up, which have stalled, and sets per muscle each week. Until then, here's what your next session asks for.</p><div class="row2"><a class="btn" href="#/today">Go to today's workout</a><a class="btn ghost" href="#/import">Import old logs</a></div></div>`;
  h += planCard(t);
  const tally = `<div class="tally"><div style="--k:var(--up)"><b>${c.up}</b><span>progressing</span></div><div style="--k:var(--flat)"><b>${c.flat}</b><span>flat or new</span></div><div style="--k:var(--down)"><b>${c.bad}</b><span>need attention</span></div></div>`;

  const f = focusItems(t);
  h += `<p class="lbl">Watch-outs and wins</p>`;
  h += f.length
    ? `<ul class="box focus">${f.map(i => `<li>${i.ex ? `<a href="#/ex/${esc(i.ex)}">` : '<div>'}<span class="ic" style="--k:var(--${i.k})">${GLYPH_ICON[i.ic] || esc(i.ic)}</span><span><b>${esc(i.title)}</b>${esc(i.text)}</span>${i.ex ? '</a>' : '</div>'}</li>`).join('')}</ul>`
    : `<div class="box pad"><p class="fine">Nothing needs attention. Keep logging.</p></div>`;

  h += `<p class="lbl">By muscle · lead lift</p>${tr.length ? tally : ''}`;
  if (!tr.length) h += `<div class="box pad"><p class="fine">Log a lift twice to see its trend.</p></div>`;
  else {
    h += `<ul class="box mus">`;
    for (const x of tr) {
      const [label, k] = STATUS[x.status] || STATUS.flat;
      const d = isKg(x.ex.unit)
        ? `${x.ex.name}: ${T('estMax')} ${num(toDisp(x.scores[0]))} → ${num(toDisp(x.scores[x.scores.length - 1]))} ${unitShort(x.ex.unit)}`
        : `${x.ex.name}: ${fmtLoad(x.ex, x.from.w)} → ${fmtLoad(x.ex, x.to.w)}`;
      h += `<li><a href="#/ex/${esc(x.ex.id)}"><span class="t">${esc(x.muscle)} ${pill(label, k)}</span><span class="d">${esc(d)} · ${plural(x.n, 'session')}</span>${spark(x.scores, k)}</a></li>`;
    }
    h += `</ul>`;
  }
  const missing = MUSCLES.filter(m => !tr.some(x => x.muscle === m));
  if (tr.length && missing.length) h += `<p class="fine">Not enough data yet (a main lift logged twice): ${esc(missing.join(', '))}.</p>`;

  // weekly volume: planned vs done this week
  // one counting rule everywhere: main muscle 1, helpers ½ (as in the plan preview)
  const planned = weeklyVolume(S.program, S.exById);
  const ws = weekStart(t);
  const wa = addDays(ws, -7 * volWeek), wb = volWeek ? addDays(wa, 6) : t;
  const done = doneVolume(wa, wb), lo = minSets();
  const max = Math.max(24, ...Object.values(planned), ...Object.values(done));
  h += `<div class="box vol"><div class="cap"><b>${esc(T('weeklySets'))} ${helpTip('weeklySets')}</b><div class="seg sm" role="group" aria-label="Which week">${[[0, 'This week'], [1, 'Last week']].map(([v, l]) => `<button data-act="volweek" data-v="${v}" aria-pressed="${volWeek === v}">${l}</button>`).join('')}</div></div>
    <p class="fine vleg"><span><i class="vk vk-d"></i> done</span> <span><i class="vk vk-p"></i> planned</span> <span><i class="vk vk-b"></i> ${lo}–20 sets</span> <span><span class="vok">${ICON.check}</span> reached</span></p>`;
  for (const m of MUSCLES) {
    const p = planned[m] || 0, d = done[m] || 0;
    if (!p && !d) continue;
    const ok = d >= lo;
    h += `<div class="vrow"><span>${esc(m)}</span><div class="vtrack" aria-hidden="true"><span class="band" style="left:${lo / max * 100}%;width:${(20 - lo) / max * 100}%"></span><i class="plan" style="width:${p / max * 100}%"></i><i class="done" style="width:${d / max * 100}%"></i></div><span class="num" role="img" aria-label="${esc(`${num(d)} of ${num(p)} planned${ok ? ', reached' : ''}`)}">${ok ? `<span class="vok">${ICON.check}</span>` : ''}${num(d)}<small>/${num(p)}</small></span></div>`;
  }
  h += `<p class="fine">An exercise counts fully for its main muscle and half for helpers, the same as the plan preview: bench is 1 set of chest and ½ each of front delts and triceps.${!volWeek && Object.keys(done).length === 0 ? ' Nothing logged yet this week; check last week for a full picture.' : ''}</p></div>`;

  // body + cardio summaries
  const b = S.body, last = b[b.length - 1];
  const rate = weeklyRate(b.filter(x => x.date <= t && daysBetween(x.date, t) <= 28).map(x => ({ date: x.date, v: +x.kg })));
  const wk = S.cardio.filter(x => x.date >= ws && x.date <= t);
  h += `<div class="row2">
    <a class="box stat" href="#/body"><span class="lbl">Body weight</span><b class="num">${last ? num(bwDisp(last.kg)) : '—'}<small> ${U()}</small></b><span class="fine">${rate == null ? 'Log a few weigh-ins' : `${rate > 0 ? '+' : ''}${num(rate * bwF(), 2)} ${U()}/week`}${+S.settings.goalKg ? ` · goal ${num(bwDisp(S.settings.goalKg))}` : ''}</span></a>
    <a class="box stat" href="#/cardio"><span class="lbl">Cardio this week</span><b class="num">${wk.reduce((a, x) => a + (+x.min || 0), 0)}<small> min</small></b><span class="fine">${wk.length} session${wk.length === 1 ? '' : 's'} · aim 2–3</span></a></div>`;
  h += `<a class="btn ghost" href="#/lifts">All exercises and records ${ICON.chev}</a>`;
  return { title: 'Insights', sub: `From ${plural(S.sessions.length, 'logged session')}`, html: h, color: 'legs' };
}

/** Progress has two views: Insights and Levels. */
export const progressNav = on => `<nav class="subnav" aria-label="Progress views"><a href="#/insights" aria-current="${on === 'insights' ? 'page' : 'false'}">Insights</a><a href="#/levels" aria-current="${on === 'levels' ? 'page' : 'false'}">Levels</a></nav>`;

// ---- all lifts -------------------------------------------------------------------
function lifts() {
  const rows = S.exercises.map(ex => {
    const exps = exposures(S.sessions, ex);
    return { ex, exps, tr: trend(exps.slice(0, 8), ex.unit) };
  }).sort((a, b) => (b.exps[0]?.date || '').localeCompare(a.exps[0]?.date || '') || a.ex.name.localeCompare(b.ex.name));
  let h = `<input class="inp" id="liftsearch" type="search" placeholder="Search exercises" autocomplete="off" aria-label="Search exercises"><ul class="box mus" id="liftlist">`;
  for (const { ex, exps, tr } of rows) {
    const [label, k] = STATUS[tr.status] || STATUS.none;
    const pb = personalBests(exps, ex.unit);
    const d = !exps.length ? 'Never logged' : isKg(ex.unit) && pb.best ? `Best ${T('estMax')} ${num(toDisp(pb.best.v))} ${unitShort(ex.unit)} · ${plural(exps.length, 'session')}` : `Top ${fmtLoad(ex, pb.heavy?.w ?? 0)} · ${plural(exps.length, 'session')}`;
    h += `<li data-name="${esc(ex.name.toLowerCase())}"><a href="#/ex/${esc(ex.id)}"><span class="t">${esc(ex.name)} ${pill(label, k)}</span><span class="d">${esc(d)}</span>${tr.scores.length > 1 ? spark(tr.scores, k) : ''}</a></li>`;
  }
  h += `</ul>`;
  return {
    title: 'Exercises', sub: 'Trend and records per lift', back: 'insights', html: h, color: 'legs',
    after: root => root.querySelector('#liftsearch').addEventListener('input', ev => {
      const q = ev.target.value.trim().toLowerCase();
      for (const li of root.querySelectorAll('#liftlist li')) li.hidden = !!q && !li.dataset.name.includes(q);
    }),
  };
}

// ---- exercise detail -------------------------------------------------------------
let exMetric = 'e1rm';
function exDetail(id) {
  const ex = S.exById[id];
  if (!ex) return { title: 'Not found', back: 'insights', html: `<div class="empty"><b>This exercise doesn't exist.</b></div>` };
  const exps = exposures(S.sessions, ex);
  const tr = trend(exps.slice(0, 8), ex.unit);
  const [label, k] = STATUS[tr.status] || STATUS.none;
  const pb = personalBests(exps, ex.unit);
  const kg = isKg(ex.unit);
  const metric = kg ? exMetric : 'load';

  let h = `<div class="rrow"><span>${pill(label, k)} ${esc(unitLong(ex.unit))}${ex.perGym ? ' · compared per gym' : ''}</span><a class="linkbtn" href="#/exercise/${esc(ex.id)}">Edit exercise</a></div>`;
  if (ex.caution) h += `<div class="warn" style="--k:var(--down)"><b>Note.</b><span>${esc(ex.caution)}</span></div>`;
  if (ex.unitUnclear) h += `<div class="warn"><b>Unit unclear.</b><span>Old entries mix per-side and total load. Set the unit under Edit exercise.</span></div>`;

  h += nextTarget(ex);
  h += standards(ex, pb);
  h += `<div class="kpis">
    <div class="kpi"><b>${kg && pb.best ? num(toDisp(pb.best.v)) : '—'}</b><span>best ${esc(T('estMax'))} ${helpTip('estMax')}${kg && pb.best ? ` · ${fmtDate(pb.best.date)}` : ''}</span></div>
    <div class="kpi"><b>${pb.heavy ? esc(fmtLoad(ex, pb.heavy.w)) : '—'}</b><span>heaviest${pb.heavy ? ` × ${pb.heavy.r}` : ''}</span></div>
    <div class="kpi"><b>${exps.length}</b><span>sessions</span></div></div>`;

  if (exps.length) {
    const chron = [...exps].reverse();
    let series;
    if (metric === 'e1rm') series = chron.map(e => ({ date: e.date, v: score(e, ex.unit) })).filter(p => p.v != null).map(p => ({ ...p, v: toDisp(p.v) }));
    else if (metric === 'vol') series = chron.map(e => ({ date: e.date, v: e.sets.reduce((a, s) => a + (+s.w || 0) * (+s.r || 0) * (ex.unit === 'kg/DB' ? 2 : 1), 0) })).filter(p => p.v > 0).map(p => ({ ...p, v: Math.round(toDisp(p.v)) }));
    else series = chron.map(e => ({ date: e.date, v: ex.unit === 'bw' ? e.sets.reduce((a, s) => a + (+s.r || 0), 0) : ex.unit === 'L' ? topLoad(e).w : toDisp(topLoad(e).w) }));
    const unitLbl = metric === 'load' && ex.unit === 'bw' ? 'reps' : metric === 'load' && ex.unit === 'L' ? 'level' : U();
    h += `<div class="box chart">`;
    if (kg) h += `<div class="seg sm" role="group" aria-label="Chart metric">${[['e1rm', expertWording() ? 'e1RM' : 'Est. max'], ['load', 'Top load'], ['vol', expertWording() ? 'Volume' : 'Total lifted']].map(([v, l]) => `<button data-act="metric" data-v="${v}" aria-pressed="${metric === v}">${l}</button>`).join('')}</div>`;
    else h += `<div class="cap"><b>${ex.unit === 'bw' ? 'Total reps' : 'Top level'}</b></div>`;
    h += lineChart(series, { k: 'legs', unit: unitLbl, label: `${ex.name} over time` });
    if (metric === 'e1rm') h += `<p class="fine">${expertWording() ? 'Epley estimate from your best set each session.' : 'Estimated from your best set each session.'} A trend, not a tested max.</p>`;
    if (metric === 'vol') h += `<p class="fine">${esc(T('volume'))}: weight × reps added up${ex.unit === 'kg/DB' ? ', counting both dumbbells' : ''}.</p>`;
    h += `</div>`;

    const hasRir = exps.some(e => e.rir != null && e.rir !== '');
    h += `<p class="lbl">Sessions</p><div class="box tblwrap"><table class="xtbl"><thead><tr><th>Date</th><th>Sets</th>${kg ? `<th>${expertWording() ? 'e1RM' : 'Est. max'}</th>` : ''}${hasRir ? `<th>${esc(T('rir'))}</th>` : ''}</tr></thead><tbody>`;
    exps.slice(0, 40).forEach((e, i) => {
      const sc = score(e, ex.unit);
      // vs the previous session at the same gym for machines/cables; across gyms the change isn't meaningful
      const prev = exps[i + 1];
      const cmp = prev && ex.perGym && S.sessions.find(x => x.id === e.sessionId)?.gymId !== S.sessions.find(x => x.id === prev.sessionId)?.gymId ? null : compareExposure(exps, i, ex.unit);
      const tag = cmp && cmp.dir !== 'first' ? `<small class="dl" style="--k:var(--${cmp.dir === 'up' ? 'up' : cmp.dir === 'same' ? 'mute' : cmp.kind === 'load' ? 'flat' : 'down'})">${cmp.pr ? '★ ' : ''}${esc(cmp.text)}</small>` : '';
      h += `<tr><td><a href="#/session/${esc(e.sessionId)}">${fmtDate(e.date)}${e.approx ? '*' : ''}</a></td><td>${esc(groupSets(e.sets, ex))}${e.pain ? ' ' + pill('pain', 'down') : ''}${tag}</td>${kg ? `<td class="num">${sc ? num(toDisp(sc)) : '—'}</td>` : ''}${hasRir ? `<td>${esc(e.rir ?? '')}</td>` : ''}</tr>`;
    });
    h += `</tbody></table></div>`;
    if (exps.some(e => e.approx)) h += `<p class="fine">* Date approximate (imported from the handoff summary).</p>`;
  } else {
    h += `<div class="empty"><b>No sessions yet.</b><p>Log this lift once to set a baseline.</p></div>`;
  }
  return { title: ex.name, sub: esc((ex.muscles || []).join(' · ')), back: 'lifts', html: h, color: 'legs' };
}

/** The next planned session's target for this lift, from the same engine as the Today screen. */
function nextTarget(ex) {
  const t = todayIso();
  for (let i = 0; i < 8; i++) {
    const d = addDays(t, i), day = dayForDate(d);
    const slot = day.slots.find(sl => sl.exId === ex.id);
    if (!slot) continue;
    if (i === 0 && S.sessions.some(x => x.date === t && !x.seed && x.entries.some(e => e.exId === ex.id))) continue;
    const sg = suggest(slot, ex, suggestionCtx(d));
    const target = targetText(ex, sg);
    return `<div class="box nexttgt"><div class="rrow"><span><small>Next · ${esc(day.name)} ${i === 0 ? 'today' : esc(fmtDate(d, { dow: true }))}</small><b class="num">${esc(target)}</b></span>${chip(sg, ex)}</div><p class="fine">${esc(sg.why)}</p></div>`;
  }
  return '';
}

/** "25 × 8·8·8 · 22.5 × 6" */
function groupSets(sets, ex) {
  const out = [];
  for (const s of sets) {
    const last = out[out.length - 1];
    if (last && last.w === +s.w) last.r.push(s.r ?? '?');
    else out.push({ w: +s.w, r: [s.r ?? '?'] });
  }
  return out.map(g => `${fmtLoad(ex, g.w)} × ${g.r.join('·')}`).join(' · ');
}

// ---- body weight ----------------------------------------------------------------
function body() {
  const t = todayIso();
  const b = S.body;
  const last = b[b.length - 1];
  const goal = +S.settings.goalKg || null;   // no goal until the user sets one
  const u = U(), f = bwF();
  const rate = weeklyRate(b.filter(x => x.date <= t && daysBetween(x.date, t) <= 28).map(x => ({ date: x.date, v: +x.kg })));
  const lo = Math.round(20 * f), hi = Math.round(300 * f);
  let h = `<div class="box pad addrow">
    <label class="field"><span>Date</span><input class="inp" id="b-date" type="date" value="${t}" max="${t}"></label>
    <label class="field"><span>Weight (${u})</span><input class="inp" id="b-kg" type="number" inputmode="decimal" step="0.1" min="${lo}" max="${hi}" value="${last ? bwDisp(last.kg) : ''}"></label>
    <button class="btn" data-act="body-add">Save</button></div>`;
  const pctWk = rate != null && last ? rate / last.kg * 100 : null;
  const toGo = last && goal ? +(last.kg - goal).toFixed(1) : null;
  const weeks = rate && rate < 0 && toGo > 0 ? Math.ceil(toGo / -rate) : null;
  h += `<div class="kpis"><div class="kpi"><b>${last ? num(bwDisp(last.kg)) : '—'}</b><span>latest${last ? ` · ${fmtDate(last.date)}` : ''}</span></div>
    <div class="kpi"><b>${rate == null ? '—' : (rate > 0 ? '+' : '') + num(rate * f, 2)}</b><span>${u} / week (4 wk)</span></div>
    ${goal ? `<div class="kpi"><b>${toGo == null ? '—' : num(Math.abs(toGo) * f)}</b><span>${u} ${toGo != null && toGo < 0 ? 'under' : 'to'} ${num(bwDisp(goal))} goal</span></div>`
      : `<button class="kpi kpi-btn" data-act="goal"><b>${ICON.plus}</b><span>Set a goal (optional)</span></button>`}</div>`;
  if (pctWk != null && pctWk < -1) h += `<div class="warn" style="--k:var(--down)"><b>Fast loss.</b><span>About ${num(-pctWk)}% of body weight a week. Past roughly 1% a week, muscle loss risk rises, more so combined with training to failure.</span></div>`;
  if (weeks) h += `<p class="fine">At this rate you'd reach ${num(bwDisp(goal))} ${u} in about ${weeks} weeks (${fmtDate(addDays(t, weeks * 7), { year: true })}). Trends over a few weeks mean more than single weigh-ins.</p>`;
  h += `<div class="box chart">${lineChart(b.map(x => ({ date: x.date, v: bwDisp(x.kg) })), { k: 'upper', goal: goal ? bwDisp(goal) : null, unit: u, label: 'Body weight over time' })}</div>`;
  h += `<div class="rrow"><p class="lbl">Weigh-ins</p><button class="linkbtn" data-act="goal">${goal ? `Goal ${num(bwDisp(goal))} ${u} · change` : 'Set a goal'}</button></div><ul class="box hist small">`;
  for (const x of [...b].reverse()) h += `<li><div class="rowi"><span class="num big">${num(bwDisp(x.kg))}</span><span class="grow">${fmtDate(x.date, { dow: true, year: true })}${x.note ? `<small>${esc(x.note)}</small>` : ''}</span><button class="iconbtn sm" data-act="body-del" data-id="${esc(x.id)}" aria-label="Delete ${fmtDate(x.date)} weigh-in">×</button></div></li>`;
  if (!b.length) h += `<li><div class="rowi"><span class="fine">No weigh-ins yet.</span></div></li>`;
  h += `</ul><a class="btn ghost" href="#/measure">Measurements and progress photos ${ICON.chev}</a>`;
  return { title: 'Body weight', sub: goal ? 'Trend toward your goal' : 'Your weigh-ins and trend', back: 'insights', html: h, color: 'upper' };
}

// ---- cardio ------------------------------------------------------------------------
const TYPES = ['Treadmill', 'Incline walk', 'Run', 'Cycling', 'Rower', 'Swim', 'Muay Thai', 'Other'];
const INT = [['easy', 'Easy'], ['moderate', 'Moderate'], ['hard', 'Hard']];
const cardioDraft = { type: 'Swim', intensity: 'easy' };

function cardio() {
  const t = todayIso();
  let h = `<div class="box pad cform">
    <div class="chips" role="group" aria-label="Type">${TYPES.map(x => `<button class="mini" data-act="c-type" data-v="${x}" aria-pressed="${cardioDraft.type === x}">${x}</button>`).join('')}</div>
    <div class="row2"><label class="field"><span>Date</span><input class="inp" id="c-date" type="date" value="${t}" max="${t}"></label>
    <label class="field"><span>Minutes</span><input class="inp" id="c-min" type="number" inputmode="numeric" min="1" max="600" placeholder="30"></label></div>
    <div class="rrow"><span>Intensity</span><div class="seg" role="group" aria-label="Intensity">${INT.map(([v, l]) => `<button data-act="c-int" data-v="${v}" aria-pressed="${cardioDraft.intensity === v}">${l}</button>`).join('')}</div></div>
    <input class="inp" id="c-note" placeholder="Note (optional)" aria-label="Note">
    <button class="btn" data-act="cardio-add">Log cardio</button></div>`;

  const ws = weekStart(t), bars = [];
  for (let i = 7; i >= 0; i--) {
    const a = addDays(ws, -7 * i), b = addDays(a, 6);
    const min = S.cardio.filter(x => x.date >= a && x.date <= b).reduce((s, x) => s + (+x.min || 0), 0);
    bars.push({ label: i === 0 ? 'now' : fmtDate(a), v: min, k: i === 0 ? 'pull' : 'upper' });
  }
  h += `<div class="box chart"><div class="cap"><b>Minutes per week</b><span>aim 2–3 sessions of 20–40 min</span></div>${barChart(bars, { unit: 'min', label: 'Cardio minutes per week, last 8 weeks' })}</div>`;

  // hard cardio or Muay Thai the day before a leg day
  const warn = [];
  for (const x of S.cardio) {
    if (x.date > t || daysBetween(x.date, t) > 14) continue;
    if (!(x.intensity === 'hard' || x.type === 'Muay Thai')) continue;
    const nd = addDays(x.date, 1);
    const logged = S.sessions.find(s => s.date === nd && /leg/i.test(s.name));
    const planned = nd >= t && /leg/i.test(dayForDate(nd).name) ? dayForDate(nd) : null;
    const legs = logged || planned;
    if (legs) warn.push(`${x.type} (${x.intensity}) on ${fmtDate(x.date)} before ${legs.name} on ${fmtDate(nd)}`);
  }
  if (warn.length) h += `<div class="warn" style="--k:var(--down)"><b>Clash.</b><span>${warn.map(esc).join('; ')}. Hard cardio the day before legs costs leg performance. Move it after an upper day, or trim leg volume if Muay Thai becomes regular.</span></div>`;

  h += `<p class="lbl">Recent</p><ul class="box hist small">`;
  for (const x of S.cardio.slice(0, 40)) h += `<li><div class="rowi"><span class="sw" style="--k:var(--${x.intensity === 'hard' ? 'down' : x.intensity === 'moderate' ? 'flat' : 'up'})"></span><span class="grow"><b>${esc(x.type)}</b> · ${esc(x.min)} min${x.km ? ` · ${num(x.km)} km` : ''} · ${esc(x.intensity)}<small>${fmtDate(x.date, { dow: true })}${x.note ? ' · ' + esc(x.note) : ''}</small></span><button class="iconbtn sm" data-act="cardio-del" data-id="${esc(x.id)}" aria-label="Delete cardio on ${fmtDate(x.date)}">×</button></div></li>`;
  if (!S.cardio.length) h += `<li><div class="rowi"><span class="fine">No cardio logged yet.</span></div></li>`;
  h += `</ul>`;
  return { title: 'Cardio', sub: 'Swims, walks, rides, Muay Thai', back: 'insights', html: h, color: 'pull' };
}

// ---- strength standards -----------------------------------------------------------
// Rough one-rep-max to body-weight ratios for five levels. A guide, not a verdict.
const STD = {
  men: { bbsquat: [0.75, 1.25, 1.5, 2.25, 2.75], bbbench: [0.5, 0.75, 1.25, 1.75, 2], deadlift: [1, 1.5, 2, 2.5, 3], ohp: [0.35, 0.55, 0.8, 1.1, 1.4], bbrow: [0.5, 0.75, 1, 1.5, 1.75], frontsquat: [0.6, 1, 1.25, 1.75, 2.25] },
  women: { bbsquat: [0.5, 0.75, 1.25, 1.5, 1.75], bbbench: [0.25, 0.5, 0.75, 1, 1.5], deadlift: [0.5, 1, 1.25, 1.75, 2.5], ohp: [0.2, 0.35, 0.5, 0.75, 1], bbrow: [0.25, 0.4, 0.65, 0.9, 1.2], frontsquat: [0.4, 0.6, 1, 1.25, 1.5] },
};
const STD_NAMES = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
function standards(ex, pb) {
  if (!STD.men[ex.id]) return '';
  const sex = S.settings.stdSex, bw = S.body[S.body.length - 1]?.kg;
  if (!sex) return `<div class="box pad std"><p class="lbl">How strong is that?</p><p class="fine">Compare your best with typical lifters of your body weight. Which standards?</p><div class="seg" role="group" aria-label="Standards for">${[['men', 'Men'], ['women', 'Women'], ['none', 'Hide this']].map(([v, l]) => `<button data-act="std-sex" data-v="${v}">${l}</button>`).join('')}</div></div>`;
  if (sex === 'none') return '';
  if (!bw) return `<div class="box pad std"><p class="lbl">How strong is that?</p><p class="fine">Log your body weight (the scale button on Today) to compare your best with typical lifters.</p></div>`;
  if (!pb.best) return '';
  const r = pb.best.v / bw, cuts = STD[sex][ex.id];
  const lvl = cuts.filter(c => r >= c).length; // 0 = below beginner
  const pos = Math.min(100, (r / (cuts[4] * 1.1)) * 100);
  const nextKg = lvl < 5 ? cuts[lvl] * bw : null;
  return `<div class="box pad std"><div class="rrow"><p class="lbl">How strong is that?</p><button class="linkbtn" data-act="std-sex" data-v="">Change</button></div>
    <p><b>${lvl ? STD_NAMES[lvl - 1] : 'Starting out'}</b> · ${num(r, 2)}× body weight (${esc(T('estMax'))} ${num(toDisp(pb.best.v))} ${U()})</p>
    <div class="stdbar" aria-hidden="true">${cuts.map(c => `<i style="left:${(c / (cuts[4] * 1.1)) * 100}%"></i>`).join('')}<b style="left:${pos}%"></b></div>
    <div class="stdlbl" aria-hidden="true">${STD_NAMES.map(n => `<span>${n}</span>`).join('')}</div>
    <p class="fine">${nextKg ? `${STD_NAMES[lvl]} starts around ${num(toDisp(nextKg))} ${U()} at your body weight. ` : ''}Rough guide for ${sex}, from common strength tables. Age, height and training history all matter.</p></div>`;
}

// ---- measurements and progress photos -------------------------------------------------------
const MEAS = [['waist', 'Waist'], ['chest', 'Chest'], ['hips', 'Hips'], ['arm', 'Arm'], ['thigh', 'Thigh']];
const photoCache = {};
function measure() {
  const t = todayIso(), list = S.measures, first = list[0], last = list[list.length - 1];
  let h = `<div class="box pad stack"><p class="lbl">Measure (cm)</p>
    <label class="field"><span>Date</span><input class="inp" id="m-date" type="date" value="${t}" max="${t}"></label>
    <div class="mgrid">${MEAS.map(([k, l]) => `<label class="field"><span>${l}</span><input class="inp" id="m-${k}" type="number" inputmode="decimal" step="0.5" min="10" max="300" placeholder="${last?.[k] ?? '—'}"></label>`).join('')}</div>
    <p class="fine">Fill in only what you measure. Same time of day, tape snug but not tight.</p>
    <button class="btn" data-act="m-save">Save measurements</button></div>`;
  if (list.length) {
    h += `<p class="lbl">Change since ${fmtDate(first.date, { year: true })}</p><div class="box tblwrap"><table class="xtbl"><thead><tr><th>Date</th>${MEAS.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead><tbody>`;
    for (const m of [...list].reverse()) h += `<tr><td>${fmtDate(m.date)}</td>${MEAS.map(([k]) => `<td class="num">${m[k] ?? '—'}${m !== first && m[k] != null && first[k] != null && m[k] !== first[k] ? `<small class="dl" style="--k:var(--mute)">${m[k] > first[k] ? '+' : ''}${num(m[k] - first[k])}</small>` : ''}</td>`).join('')}<td><button class="iconbtn sm" data-act="m-del" data-id="${esc(m.id)}" aria-label="Delete ${fmtDate(m.date)} measurements">×</button></td></tr>`;
    h += `</tbody></table></div>`;
  }
  h += `<div class="rrow"><p class="lbl">Progress photos</p><label class="mini filebtn">${ICON.plus} Add photo<input type="file" accept="image/*" data-input="m-photo"></label></div>`;
  h += S.photos.length
    ? `<div class="photos">${[...S.photos].reverse().map(p => `<button class="ph" data-act="m-open" data-id="${esc(p.id)}" aria-label="Photo from ${fmtDate(p.date, { year: true })}"><img data-ph="${esc(p.id)}" alt=""><span>${fmtDate(p.date)}</span></button>`).join('')}</div>`
    : `<div class="box pad"><p class="fine">Photos from the same spot and light every few weeks show change the scale misses.</p></div>`;
  h += `<p class="fine">Photos stay on this phone only. They are not in backup files, so save any you want to keep elsewhere.</p>`;
  return {
    title: 'Measurements', sub: 'Tape and photos', back: 'body', html: h, color: 'upper',
    after: root => { for (const img of root.querySelectorAll('img[data-ph]')) showPhoto(img, img.dataset.ph); },
  };
}
async function showPhoto(img, id) {
  const src = photoCache[id] || (photoCache[id] = await loadPhoto(id));
  if (src && img.isConnected) img.src = src;
}
/** Shrink a camera photo to at most 1000 px on the long side, as JPEG, so storage stays small. */
function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const k = Math.min(1, 1000 / Math.max(im.width, im.height));
      const c = document.createElement('canvas');
      c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a photo')); };
    im.src = url;
  });
}

// ---- actions -------------------------------------------------------------------------
export const actions = {
  metric(el) { exMetric = el.dataset.v; refresh(); },
  'std-sex': el => saveSettings({ stdSex: el.dataset.v || null }),
  async 'm-save'() {
    const date = document.getElementById('m-date').value || todayIso();
    if (date > todayIso()) return toast("Can't log a future date", 'down');
    const rec = { id: 'm-' + date, date };
    for (const [k] of MEAS) { const v = parseFloat(document.getElementById('m-' + k).value); if (v >= 10 && v <= 300) rec[k] = v; }
    if (Object.keys(rec).length === 2) return toast('Enter at least one measurement', 'flat');
    await saveMeasure({ ...(S.measures.find(m => m.id === rec.id) || {}), ...rec });
    toast(`Measurements saved for ${fmtDate(date)}`, 'up');
  },
  async 'm-del'(el) {
    const rec = S.measures.find(m => m.id === el.dataset.id);
    await deleteMeasure(el.dataset.id);
    if (rec) toast(`Measurements on ${fmtDate(rec.date)} deleted`, 'ink', { undo: () => saveMeasure(rec) });
  },
  async 'm-photo'(el) {
    const f = el.files?.[0];
    if (!f) return;
    try {
      const data = await shrink(f);
      const id = uid('p');
      photoCache[id] = data;
      await savePhoto({ id, date: todayIso() }, data);
      toast('Photo saved on this phone', 'up');
    } catch (e) { toast(e.message, 'down'); }
    el.value = '';
  },
  async 'm-open'(el) {
    const p = S.photos.find(x => x.id === el.dataset.id);
    if (!p) return;
    const src = photoCache[p.id] || (photoCache[p.id] = await loadPhoto(p.id));
    openSheet(`<h2 class="sh-title">${fmtDate(p.date, { dow: true, year: true })}</h2>${src ? `<img class="phfull" src="${src}" alt="Progress photo from ${fmtDate(p.date, { year: true })}">` : '<p class="fine">Photo not found.</p>'}
      <div class="row2"><button class="btn ghost" data-act="sheet-close-ins">Close</button><button class="btn danger" data-act="m-photo-del" data-id="${esc(p.id)}">Delete photo</button></div>`, { label: 'Progress photo' });
  },
  'sheet-close-ins': () => closeSheet(),
  async 'm-photo-del'(el) {
    closeSheet();
    if (!(await confirmSheet({ title: 'Delete this photo?', body: 'Photos are not in backups, so it cannot be brought back.', ok: 'Delete', danger: true }))) return;
    await deletePhoto(el.dataset.id);
    delete photoCache[el.dataset.id];
  },
  volweek(el) { volWeek = +el.dataset.v; refresh(); },
  async 'body-add'() {
    const date = document.getElementById('b-date').value || todayIso();
    const v = parseFloat(document.getElementById('b-kg').value), kg = bwKg(v);
    if (!(kg > 20 && kg < 300)) return toast(`Enter a weight between ${Math.round(20 * bwF())} and ${Math.round(300 * bwF())} ${U()}`, 'down');
    if (date > todayIso()) return toast("Can't log a future date", 'down');
    await saveBody({ id: 'b-' + date, date, kg });
    toast(`Saved ${num(v)} ${U()} for ${fmtDate(date)}`, 'up');
  },
  async 'body-del'(el) {
    const rec = S.body.find(b => b.id === el.dataset.id);
    await deleteBody(el.dataset.id);
    if (rec) toast(`Weigh-in on ${fmtDate(rec.date)} deleted`, 'ink', { undo: () => saveBody(rec) });
  },
  goal() {
    openSheet(`<h2 class="sh-title">Goal weight</h2><p class="sh-body">Optional. Leave it empty for no goal.</p><label class="field"><span>${U()}</span><input class="inp" id="goal-kg" type="number" inputmode="decimal" step="0.5" value="${+S.settings.goalKg ? bwDisp(S.settings.goalKg) : ''}" autofocus></label><button class="btn" data-act="goal-save">Save goal</button>`, { label: 'Goal weight' });
  },
  async 'goal-save'() {
    const raw = document.getElementById('goal-kg').value.trim();
    const v = raw === '' ? null : bwKg(parseFloat(raw));
    if (v != null && !(v > 20 && v < 300)) return toast(`Enter a goal between ${Math.round(20 * bwF())} and ${Math.round(300 * bwF())} ${U()}, or leave it empty`, 'down');
    closeSheet();
    await saveSettings({ goalKg: v });
  },
  'c-type'(el) { cardioDraft.type = el.dataset.v; keepInputs(['c-date', 'c-min', 'c-note']); },
  'c-int'(el) { cardioDraft.intensity = el.dataset.v; keepInputs(['c-date', 'c-min', 'c-note']); },
  async 'cardio-add'() {
    const date = document.getElementById('c-date').value || todayIso();
    const min = parseInt(document.getElementById('c-min').value, 10);
    if (!(min > 0 && min <= 600)) return toast('Enter minutes between 1 and 600', 'down');
    if (date > todayIso()) return toast("Can't log a future date", 'down');
    await saveCardio({ id: uid('c'), date, type: cardioDraft.type, min, intensity: cardioDraft.intensity, note: document.getElementById('c-note').value.trim() });
    toast(`Logged ${min} min ${cardioDraft.type.toLowerCase()}`, 'up');
  },
  async 'cardio-del'(el) {
    const rec = S.cardio.find(c => c.id === el.dataset.id);
    await deleteCardio(el.dataset.id);
    if (rec) toast(`${rec.type} on ${fmtDate(rec.date)} deleted`, 'ink', { undo: () => saveCardio(rec) });
  },
};

/** Re-render without losing what's typed in a form. */
function keepInputs(ids) {
  const keep = ids.map(id => [id, document.getElementById(id)?.value]);
  refresh();
  for (const [id, v] of keep) { const el = document.getElementById(id); if (el && v != null) el.value = v; }
}
