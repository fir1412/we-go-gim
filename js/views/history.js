import { S, todayIso, deleteSession, saveSession, startFromSession, discardDraft, refresh, startWorkout } from '../state.js';
import { weekStart, addDays, workSets, volume, fmtLoad, unitShort, dowOf, exposures, compareExposure, muscleXP, xpBySession, toDisp, fromDisp, getUnits, score } from '../engine.js';
import { esc, fmtDate, pill, ICON, confirmSheet, toast, cvar, MONTHS, kfmt, dowName, openSheet, closeSheet, T, expertWording } from '../ui.js';
import { go } from '../app.js';

let editing = null; // session id being edited
let showSeed = true;
let viewMonth = null; // 'YYYY-MM' being browsed; null means the current month

/** '2026-09' + -1 → '2026-08' */
const addMonths = (ym, n) => { const i = +ym.slice(0, 4) * 12 + (+ym.slice(5) - 1) + n; return `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`; };
const monthName = ym => `${MONTHS[+ym.slice(5) - 1]} ${ym.slice(0, 4)}`;

export function render(route) {
  if (route.name === 'session') return detail(route.args[0]);
  const t = todayIso();
  const isImp = s => s.seed || s.imported;
  const nImp = S.sessions.filter(isImp).length;
  const on = {};
  for (const s of S.sessions) (on[s.date] ||= []).push(s);
  // Every month from the first logged session to now, so any month can be browsed.
  const nowM = t.slice(0, 7);
  const firstM = S.sessions.reduce((a, s) => (s.date.slice(0, 7) < a ? s.date.slice(0, 7) : a), nowM);
  const vm = viewMonth && viewMonth >= firstM && viewMonth <= nowM ? viewMonth : nowM;
  const inMonth = S.sessions.filter(s => s.date.slice(0, 7) === vm);
  const list = inMonth.filter(s => showSeed || !isImp(s));

  const xp = xpBySession(muscleXP(S.sessions, S.exById));

  // stats
  const ws = weekStart(t);
  const thisWeek = S.sessions.filter(s => s.date >= ws && s.date <= t && !s.seed).length;
  const planned = S.program.days.filter(d => d.slots.length).length;
  const last30 = S.sessions.filter(s => s.date > addDays(t, -30) && s.date <= t).length;
  let streak = 0;
  for (let w = 0; w < 52; w++) {
    const a = addDays(ws, -7 * (w + 1)), b = addDays(a, 6);
    if (S.sessions.some(s => s.date >= a && s.date <= b)) streak++; else break;
  }

  let h = `<div class="kpis"><div class="kpi"><b>${thisWeek}<small>/${planned}</small></b><span>this week</span></div><div class="kpi"><b>${last30}</b><span>last 30 days</span></div><div class="kpi"><b>${streak}</b><span>week streak</span></div></div>
    <button class="btn ghost" data-act="log-past">${ICON.plus} Log a past workout</button>`;

  // Month calendar, Monday first, with arrows and a picker to reach any month.
  const first = `${vm}-01`, days = new Date(+vm.slice(0, 4), +vm.slice(5), 0).getDate();
  let g = ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => `<span class="h">${x}</span>`).join('');
  g += '<span class="pad" aria-hidden="true"></span>'.repeat((dowOf(first) + 6) % 7);
  for (let i = 0; i < days; i++) {
    const d = addDays(first, i), ss = on[d];
    const lab = `${fmtDate(d)}${ss ? ': ' + ss.map(s => s.name).join(', ') : ''}`;
    g += ss ? `<a href="#/session/${esc(ss[0].id)}" class="on ${d === t ? 'now' : ''}" style="--k:${cvar(ss[0].color)}" aria-label="${esc(lab)}">${i + 1}</a>`
      : `<span class="${d === t ? 'now' : ''} ${d > t ? 'fut' : ''}" aria-label="${esc(lab)}">${i + 1}</span>`;
  }
  const counts = {};
  for (const s of S.sessions) counts[s.date.slice(0, 7)] = (counts[s.date.slice(0, 7)] || 0) + 1;
  let opts = '';
  for (let m = nowM; m >= firstM; m = addMonths(m, -1)) opts += `<option value="${m}"${m === vm ? ' selected' : ''}>${monthName(m)}${counts[m] ? ` · ${counts[m]}` : ''}</option>`;
  h += `<div class="box cal"><div class="calnav">
      <button class="iconbtn sm flip" data-act="hist-month-step" data-n="-1" aria-label="Previous month"${vm <= firstM ? ' disabled' : ''}>${ICON.chev}</button>
      <select class="inp" data-input="hist-month" aria-label="Month to show">${opts}</select>
      <button class="iconbtn sm" data-act="hist-month-step" data-n="1" aria-label="Next month"${vm >= nowM ? ' disabled' : ''}>${ICON.chev}</button></div>
    <div class="cap"><span>${inMonth.length} session${inMonth.length === 1 ? '' : 's'} this month · ${S.sessions.length} in all</span></div><div class="g">${g}</div>
    ${vm !== nowM ? `<button class="linkbtn center" data-act="hist-month-now">Back to this month</button>` : ''}</div>`;

  h += recap(vm, inMonth);
  h += `<div class="rrow"><p class="lbl">Sessions</p>${nImp ? `<button class="linkbtn" data-act="toggle-seed" aria-pressed="${!showSeed}">${showSeed ? `Hide ${nImp} imported` : 'Show imported'}</button>` : ''}</div>`;
  if (!list.length) h += inMonth.length ? `<div class="empty"><b>Only imported sessions in ${monthName(vm)}.</b><p>Your ${nImp} imported session${nImp === 1 ? ' is' : 's are'} hidden. Tap Show imported.</p></div>`
    : S.sessions.length ? `<div class="empty"><b>No sessions in ${monthName(vm)}.</b><p>Use the arrows or the month list above to see other months.</p></div>`
    : `<div class="empty"><b>No sessions yet.</b><p>Finish a workout and it lands here.</p></div>`;
  let month = '';
  for (const s of list) {
    const m = s.date.slice(0, 7);
    if (m !== month) {
      if (month) h += `</ul>`;
      month = m;
      h += `<p class="lbl">${MONTHS[+m.slice(5) - 1]} ${m.slice(0, 4)}</p><ul class="box hist">`;
    }
    const n = s.entries.reduce((a, e) => a + workSets(e).length, 0);
    const doneEx = s.entries.filter(e => workSets(e).length).length;
    const lead = s.entries.find(e => workSets(e).length);
    const ex = lead && S.exById[lead.exId];
    const line = ex ? `${ex.name} ${fmtLoad(ex, Math.max(...workSets(lead).map(x => +x.w || 0)))}${ex.unit === 'bw' ? '' : ' ' + unitShort(ex.unit)} × ${workSets(lead).map(x => x.r ?? '?').join('·')}` : 'No sets';
    const pain = s.entries.some(e => e.pain);
    const mins = s.start && s.end && s.end > s.start ? Math.round((s.end - s.start) / 60000) : s.minutes ?? null;
    const gx = xp[s.id]?.total || 0;
    h += `<li><a href="#/session/${esc(s.id)}"><div class="dt"><b>${+s.date.slice(8)}</b><span>${dowName(dowOf(s.date))}</span></div>
      <div class="mid"><div class="w">${esc(s.name)} ${isImp(s) ? pill(s.approx ? 'imported · date approx' : 'imported', 'mute') : ''}${pain ? ' ' + pill('pain', 'down') : ''}</div><div class="s"><b>${n} set${n === 1 ? '' : 's'} · ${doneEx} ex${mins ? ` · ${mins} min` : ''}</b> · ${esc(line)}</div></div>
      <span class="hxp" style="--k:${cvar(s.color)}">${gx ? `+${gx}<small>XP</small>` : ''}</span></a></li>`;
  }
  if (month) h += `</ul>`;
  return { title: 'History', sub: 'Month by month, newest first', html: h, color: 'upper' };
}

/** One card summing up a month: sessions, sets, weight lifted, bests and the lift that improved most. */
function recap(vm, list) {
  const real = list.filter(s => !s.seed);
  if (!real.length) return '';
  let sets = 0, vol = 0;
  const musc = {}, exIds = new Set();
  for (const s of real) for (const e of s.entries) {
    const ex = S.exById[e.exId], ws = workSets(e);
    if (!ex || !ws.length) continue;
    sets += ws.length; vol += volume(ex, ws); exIds.add(ex.id);
    const m = ex.muscles?.[0]; if (m) musc[m] = (musc[m] || 0) + ws.length;
  }
  const start = `${vm}-01`, end = `${vm}-31`;
  let bests = 0, top = null;
  for (const id of exIds) {
    const ex = S.exById[id], exps = exposures(S.sessions, ex);
    const inM = exps.filter(x => x.date >= start && x.date <= end), before = exps.filter(x => x.date < start);
    const sc = xs => Math.max(0, ...xs.map(x => score(x, ex.unit) || 0));
    const a = sc(before), b = sc(inM);
    if (!a || !b) continue;
    if (b > a + 1e-6) bests++;
    const g = b / a - 1;
    if (g > 0.001 && (!top || g > top.g)) top = { ex, g };
  }
  const busiest = Object.entries(musc).sort((x, y) => y[1] - x[1])[0];
  const days = new Set(real.map(s => s.date)).size;
  return `<section class="box recap"><p class="lbl">${esc(MONTHS[+vm.slice(5) - 1])} recap</p>
    <div class="kpis"><div class="kpi"><b>${days}</b><span>day${days === 1 ? '' : 's'} trained</span></div><div class="kpi"><b>${sets}</b><span>working sets</span></div><div class="kpi"><b>${vol ? kfmt(toDisp(vol)) : '—'}</b><span>${getUnits()} lifted</span></div></div>
    <ul class="rlist">${bests ? `<li>${ICON.star}<span><b>${bests}</b> lift${bests === 1 ? '' : 's'} beat ${bests === 1 ? 'its' : 'their'} best before this month</span></li>` : ''}
    ${top ? `<li>${ICON.trendUp}<span>Most improved: <a href="#/ex/${esc(top.ex.id)}">${esc(top.ex.name)}</a>, up ${Math.round(top.g * 100)}%</span></li>` : ''}
    ${busiest ? `<li>${ICON.bars}<span>Most sets: ${esc(busiest[0])} (${busiest[1]})</span></li>` : ''}</ul></section>`;
}

function detail(id) {
  const s = S.sessions.find(x => x.id === id);
  if (!s) return { title: 'Not found', back: 'history', html: `<div class="empty"><b>This session doesn't exist.</b><p>It may have been deleted.</p></div>` };
  const ed = editing === id;
  const dur = s.start && s.end ? Math.round((s.end - s.start) / 60000) : s.minutes ?? null;
  let vol = 0, sets = 0, reps = 0;
  for (const e of s.entries) { const ex = S.exById[e.exId]; if (ex) { vol += volume(ex, workSets(e)); sets += workSets(e).length; reps += workSets(e).reduce((a, x) => a + (+x.r || 0), 0); } }
  // Bodyweight-only sessions have no load to add up, so show reps instead of "0 kg".
  const volKpi = vol > 0 ? `<b>${kfmt(toDisp(vol))}</b><span>${getUnits()} ${expertWording() ? 'volume' : 'lifted'}</span>` : `<b>${reps}</b><span>reps</span>`;
  let h = `<div class="kpis"><div class="kpi"><b>${sets}</b><span>set${sets === 1 ? '' : 's'} done</span></div><div class="kpi">${volKpi}</div><div class="kpi"><b>${dur == null ? '—' : dur < 1 ? '&lt;1' : dur}</b><span>minutes</span></div></div>`;
  const meta = [];
  if (s.readiness?.sleep) meta.push(`Sleep ${s.readiness.sleep} h`);
  if (s.readiness?.pain) meta.push('Pain flagged');
  if (s.feel) meta.push(`Feel ${s.feel}/5`);
  if (s.hr) meta.push(`Peak HR ${s.hr}`);
  if (s.deload) meta.push(T('deload'));
  if (meta.length || s.note) h += `<div class="box pad"><p class="meta-l">${esc(meta.join(' · '))}</p>${s.note ? `<p class="enote">${esc(s.note)}</p>` : ''}</div>`;
  const sx = xpBySession(muscleXP(S.sessions, S.exById))[s.id];
  if (sx && !ed) h += `<a class="box xpstrip" href="#/levels"><b>+${sx.total} XP</b>${Object.entries(sx.muscles).sort((a, b) => b[1] - a[1]).map(([m, g]) => `<span>${esc(m)} +${g}</span>`).join('')}</a>`;
  if (s.cardio?.length) h += `<div class="box pad"><p class="lbl">Cardio</p>${s.cardio.map(c => `<p>${esc(c.type)} · ${c.min} min${c.km ? ` · ${c.km} km` : ''} · ${esc(c.intensity)}</p>`).join('')}</div>`;
  if (s.seed) h += `<p class="fine">Imported from the handoff summary. It holds only the lifts that summary named${s.approx ? ', and the date is approximate' : ''}.</p>`;
  else if (s.imported) h += `<p class="fine">Imported from your old logs${s.approx ? '. The date is approximate' : ''}. It counts toward suggestions, progress and levels like any other session.</p>`;

  s.entries.forEach((e, ei) => {
    const ex = S.exById[e.exId];
    const name = ex ? ex.name : `Deleted exercise (${e.exId})`;
    let n = 0;
    let cmp = null;
    if (ex && !ed && workSets(e).length) {
      const exps = exposures(S.sessions, ex, { gymId: s.gymId || null });
      const i = exps.findIndex(x => x.sessionId === s.id);
      if (i >= 0) cmp = compareExposure(exps, i, ex.unit);
    }
    const badges = [cmp?.pr ? pill('★ PR', 'arms') : '', cmp && cmp.dir !== 'first' ? pill(cmp.text, cmp.dir === 'up' ? 'up' : cmp.dir === 'same' ? 'mute' : cmp.kind === 'load' ? 'flat' : 'down') : cmp ? pill('first log', 'upper') : '', e.pain ? pill('pain', 'down') : ''].join(' ');
    h += `<article class="box exc hx"><header><div><h2>${ex ? `<a href="#/ex/${esc(ex.id)}">${esc(name)}</a>` : esc(name)}</h2><p>${ex ? esc(unitShort(ex.unit) || (ex.unit === 'L' ? 'level' : 'bodyweight')) : ''}${e.rir ? ` · ${esc(T('rir'))} ${esc(e.rir)}` : ''}${cmp?.prevDate ? ` · vs ${fmtDate(cmp.prevDate)}` : ''}</p></div><div class="badges">${badges}</div></header>`;
    if (ed) {
      h += `<div class="sets">${e.sets.map((x, si) => `<div class="set edit ${x.done ? 'done' : ''}"><span class="i">${x.warm ? 'W' : ++n}</span>
        <input class="inp" id="ew-${ei}-${si}" type="number" inputmode="decimal" step="any" value="${ex && ex.unit !== 'L' ? toDisp(x.w) ?? '' : x.w ?? ''}" data-input="edit-set" data-e="${ei}" data-s="${si}" data-f="w" aria-label="${esc(`${name} set ${si + 1}: ${ex?.unit === 'L' ? 'level' : ex?.unit === 'bw' ? `added weight (${getUnits()})` : `weight (${getUnits()})`}`)}">
        <input class="inp" id="er-${ei}-${si}" type="number" inputmode="numeric" value="${x.r ?? ''}" data-input="edit-set" data-e="${ei}" data-s="${si}" data-f="r" aria-label="${esc(`${name} set ${si + 1}: reps`)}">
        <button class="check" data-act="edit-done" data-e="${ei}" data-s="${si}" aria-pressed="${!!x.done}" aria-label="${esc(`${name} set ${si + 1} counted as done`)}">${ICON.check}</button></div>`).join('')}</div>`;
    } else {
      const fl = w => (ex ? fmtLoad(ex, w) : String(w ?? '—'));
      const work = workSets(e), warm = e.sets.filter(x => x.warm && x.done), skipped = e.sets.filter(x => !x.done && !x.warm).length;
      h += work.length ? `<p class="sline num">${esc(groupSets(work, fl))}</p>` : `<p class="fine">No sets done.</p>`;
      const extra = [warm.length ? `Warm-up ${groupSets(warm, fl)}` : '', skipped ? `${skipped} skipped` : ''].filter(Boolean).join(' · ');
      if (extra) h += `<p class="fine">${esc(extra)}</p>`;
    }
    if (e.note) h += `<p class="enote">${esc(e.note)}</p>`;
    h += `</article>`;
  });

  h += ed
    ? `<button class="btn" data-act="edit-save" data-id="${esc(id)}" style="--c:var(--up)">Save changes</button><button class="btn ghost" data-act="edit-cancel">Cancel</button>`
    : `<div class="row2"><button class="btn ghost" data-act="edit" data-id="${esc(id)}">Edit sets</button><button class="btn" data-act="repeat" data-id="${esc(id)}">Repeat workout</button></div>
       <button class="linkbtn danger center" data-act="delete" data-id="${esc(id)}">Delete session</button>`;
  return { title: s.name, sub: fmtDate(s.date, { dow: true, year: true }), back: 'history', color: s.color, html: h };
}

/** "25 × 8·8·8 · 22.5 × 6" */
function groupSets(sets, fl) {
  const out = [];
  for (const x of sets) {
    const last = out[out.length - 1];
    if (last && last.w === x.w) last.r.push(x.r ?? '?');
    else out.push({ w: x.w, r: [x.r ?? '?'] });
  }
  return out.map(g => `${fl(g.w)} × ${g.r.join('·')}`).join(' · ');
}

let buffer = null;
/** Start logging a workout on an earlier date (a programme day or an empty one). */
export async function logPast(date, day) {
  if (S.draft) {
    if (!(await confirmSheet({ title: `Discard the ${S.draft.name} workout in progress?`, body: 'Sets you ticked there will be lost. Finish it first to keep them.', ok: 'Discard and continue', danger: true }))) return;
    await discardDraft();
  }
  await startWorkout(day, date);
  go('workout');
}

export const actions = {
  'log-past'() {
    const t = todayIso(), y = addDays(t, -1);
    const days = S.program.days.filter(d => d.slots.length);
    openSheet(`<h2 class="sh-title">Log a past workout</h2>
      <label class="field"><span>Date</span><input class="inp" id="past-date" type="date" value="${y}" max="${y}"></label>
      <div class="field"><span>Workout</span><div class="list box" id="past-days">${days.map(d => `<button class="li" data-act="log-past-go" data-dow="${d.dow}" style="--k:${cvar(d.color)}"><i class="sw"></i><span><b>${esc(d.name)}</b><small>${d.slots.length} exercises from your programme</small></span>${ICON.chev}</button>`).join('')}
      <button class="li" data-act="log-past-go" data-dow="-1"><i class="sw"></i><span><b>Empty workout</b><small>Add exercises yourself</small></span>${ICON.chev}</button></div></div>
      <p class="fine">Sets are pre-filled from your history up to that date. It counts for History, Insights and XP like any other workout.</p>`, { label: 'Log a past workout' });
  },
  async 'log-past-go'(el) {
    const date = document.getElementById('past-date')?.value;
    if (!date || date >= todayIso()) return toast('Pick a date before today', 'flat');
    const dow = +el.dataset.dow;
    const day = dow < 0 ? { dow: -1, name: 'Workout', color: 'upper', slots: [] } : S.program.days.find(d => d.dow === dow);
    closeSheet();
    await logPast(date, day);
  },
  'toggle-seed'() { showSeed = !showSeed; refresh(); },
  'hist-month'(el) { viewMonth = el.value; refresh(); },
  'hist-month-step'(el) { viewMonth = addMonths(document.querySelector('[data-input="hist-month"]')?.value || todayIso().slice(0, 7), +el.dataset.n); refresh(); },
  'hist-month-now'() { viewMonth = null; refresh(); },
  edit(el) { editing = el.dataset.id; buffer = structuredClone(S.sessions.find(s => s.id === editing)); refresh(); },
  'edit-cancel'() {
    const i = S.sessions.findIndex(x => x.id === buffer?.id);
    if (i >= 0) S.sessions[i] = buffer;
    editing = null; buffer = null; refresh();
  },
  'edit-set'(el) {
    const s = S.sessions.find(x => x.id === editing);
    const entry = s.entries[+el.dataset.e], set = entry.sets[+el.dataset.s];
    const ex = S.exById[entry.exId];
    // Loads are typed in the display unit (kg or lb) and stored in kg; cable levels never convert.
    set[el.dataset.f] = el.value === '' ? null : el.dataset.f === 'w' && ex?.unit !== 'L' ? fromDisp(el.value) : +el.value;
  },
  'edit-done'(el) {
    const s = S.sessions.find(x => x.id === editing);
    const set = s.entries[+el.dataset.e].sets[+el.dataset.s];
    set.done = !set.done; refresh();
  },
  async 'edit-save'(el) {
    const s = S.sessions.find(x => x.id === el.dataset.id);
    editing = null; buffer = null;
    await saveSession(s);
    toast('Session updated', 'up');
  },
  async delete(el) {
    const s = S.sessions.find(x => x.id === el.dataset.id);
    if (!(await confirmSheet({ title: `Delete ${s.name} on ${fmtDate(s.date)}?`, body: 'This removes it from history and from future suggestions. It cannot be undone.', ok: 'Delete', danger: true }))) return;
    await deleteSession(s.id);
    toast('Session deleted');
    go('history');
  },
  async repeat(el) {
    const s = S.sessions.find(x => x.id === el.dataset.id);
    if (S.draft) {
      if (!(await confirmSheet({ title: `Discard the ${S.draft.name} workout in progress?`, ok: 'Discard and start', danger: true }))) return;
      await discardDraft();
    }
    await startFromSession(s);
    go('workout');
  },
};

// Leaving edit mode without saving restores the original.
window.addEventListener('hashchange', () => {
  if (editing && buffer) {
    const i = S.sessions.findIndex(x => x.id === buffer.id);
    if (i >= 0) S.sessions[i] = buffer;
    editing = null; buffer = null;
  }
});
