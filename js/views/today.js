import { S, todayIso, dayForDate, setReadiness, startWorkout, suggestionCtx, isPoor, deloadActive, saveSettings, saveBody, discardDraft, refresh, trimmedCounts } from '../state.js';
import { suggest, weekStart, addDays, daysBetween, deloadCheck, fmtLoad, unitShort, dowOf, estimateDay, planSec, SESSION_LENGTHS, toDisp, fromDisp, getUnits } from '../engine.js';
import { esc, fmtDate, fmtTime, chip, pill, ICON, openSheet, closeSheet, confirmSheet, toast, cvar, kstyle, dowName, dowLetter, num, T, helpTip, expertWording } from '../ui.js';
import { dailyCard } from './daily.js';
import { go } from '../app.js';
import { todayGame } from '../gamify.js';

const open = new Set();
let openDate = null;

export function render(route) {
  const t = todayIso();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(route.args[0] || '') ? route.args[0] : t;
  if (openDate !== date) { open.clear(); openDate = date; }
  const day = dayForDate(date);
  const isToday = date === t;
  const gym = S.settings.gyms.find(g => g.id === S.settings.gymId);
  const lastBw = S.body[S.body.length - 1];

  let h = '';
  if (S.draft) {
    const all = S.draft.entries.flatMap(e => e.sets.filter(s => !s.warm)), done = all.filter(s => s.done).length;
    const stale = S.draft.date < t;
    h += `<a class="resume" href="#/workout" style="${kstyle(S.draft.color)}"><span><b>${esc(S.draft.name)} ${stale ? `from ${fmtDate(S.draft.date, { dow: true })} not saved` : 'in progress'}</b><small>${done}/${all.length} sets · ${stale ? 'finish or discard it' : `started ${fmtTime(S.draft.start)}`}</small></span><span class="pill">${stale ? 'Open' : 'Resume'} ${ICON.chev}</span></a>`;
  }
  // One banner at a time, most useful first, so Start stays near the top.
  h += (date === t ? missedCard(t) : '') || deloadCard(t) || (date === t ? backupCard(t) : '');

  // week strip
  const ws = weekStart(t);
  h += `<div class="days" role="group" aria-label="This week">`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i), pd = dayForDate(d), done = S.sessions.some(s => s.date === d && !s.seed);
    h += `<a href="#/today/${d}" class="${d === t ? 'is-today' : ''} ${done ? 'is-done' : ''}" aria-current="${d === date ? 'date' : 'false'}" style="${kstyle(pd.color)}">
      <span>${dowLetter(dowOf(d))}</span><b>${+d.slice(8)}</b><span class="dn">${esc(pd.name)}</span></a>`;
  }
  h += `</div>`;
  if (date === t) h += todayGame(t);

  const doneHere = S.sessions.filter(s => s.date === date && !s.seed);
  for (const s of doneHere) {
    const n = s.entries.reduce((a, e) => a + e.sets.filter(x => x.done && !x.warm).length, 0);
    const exN = s.entries.filter(e => e.sets.some(x => x.done && !x.warm)).length;
    h += `<a class="donecard" href="#/session/${esc(s.id)}" style="${kstyle(s.color)}">${ICON.check}<span><b>${esc(s.name)} done</b><small>${n} set${n === 1 ? '' : 's'} · ${exN} exercise${exN === 1 ? '' : 's'} · tap for details</small></span></a>`;
  }
  const doneToday = isToday && doneHere.some(s => s.name === day.name);

  if (!day.slots.length) {
    h += `<div class="hero" style="--c:var(--rest)"><div><h2>Rest</h2><p>${esc(day.sub || 'Rest day')}</p></div>
      <div class="meta"><span>Swim, incline walk or easy cycling, 20–40 min if you feel like it. Keep hard cardio away from leg days.</span></div></div>
      <div class="row2"><a class="btn ghost" href="#/cardio">Log cardio</a><button class="btn ghost" data-act="pick-day">Train anyway</button></div>`;
    return { title: isToday ? 'Today' : fmtDate(date, { dow: true }), sub: sub(t, gym), right: bwBtn(lastBw), html: h, color: 'rest' };
  }

  const ctx = suggestionCtx(isToday ? date : t);
  const sgs = day.slots.map(slot => S.exById[slot.exId] ? suggest(slot, S.exById[slot.exId], ctx) : null);
  // Count what will actually be done (a deload halves the sets), not just the plan.
  const counts = day.slots.map((x, i) => sgs[i]?.reps.length ?? +x.sets);
  const resume = S.draft && S.draft.name === day.name && S.draft.date === t;
  // "How long today?" only shapes a workout about to start from Today.
  const choosing = isToday && !doneToday && !resume;
  const len = choosing ? +S.settings.sessionLen || null : null;
  const trim = trimmedCounts(day, counts, len);
  const isTrimmed = trim.some((n, i) => n !== counts[i]);
  const sets = trim.reduce((a, n) => a + n, 0), exN = day.slots.filter((x, i) => S.exById[x.exId] && trim[i] > 0).length;
  const estSec = isTrimmed ? planSec(day.slots, trim, S.exById, S.sessions) : estimateDay({ ...day, slots: day.slots.map((x, i) => ({ ...x, sets: counts[i] })) }, S.exById, S.sessions);
  const last = S.sessions.find(s => (s.name === day.name || s.color === day.color) && s.date <= date);
  h += `<div class="hero"><div><h2>${esc(day.name)}</h2><p>${esc(day.sub || '')}</p></div>
    <div class="meta"><span><b>${exN}</b>exercises</span><span><b>${sets}</b>work sets</span><span><b>~${Math.round(estSec / 60)}</b>min</span><span><b>${last ? (last.date === t ? 'Today' : fmtDate(last.date)) : '—'}</b>last done</span></div></div>`;

  // Readiness only shapes a workout at the moment it starts: hide it once today's is logged or under way.
  if (choosing) {
    const xp = expertWording();
    h += `<div class="box ready">
      <div class="rrow"><span>Sleep last night</span><div class="seg" role="group" aria-label="Sleep last night">${['<6', '6–7', '7+'].map(v => `<button data-act="sleep" data-v="${v}" aria-pressed="${S.readiness.sleep === v}">${v} h</button>`).join('')}</div></div>
      <div class="rrow"><span>${esc(T('pain'))}</span><div class="seg" role="group" aria-label="${esc(T('pain'))}">${['No', 'Yes'].map(v => `<button data-act="pain" data-v="${v}" aria-pressed="${(v === 'Yes') === !!S.readiness.pain}">${v}</button>`).join('')}</div></div>
      <div class="rrow"><span>How long today?</span><div class="seg" role="group" aria-label="How long today">${[...SESSION_LENGTHS, null].map(v => `<button data-act="len" data-v="${v ?? ''}" aria-pressed="${len === v}" aria-label="${v ? v + ' minutes' : 'Full workout'}">${v ? v + ' min' : 'Full'}</button>`).join('')}</div></div>
      ${isTrimmed ? `<p class="fine lenfine">Short session: ${trim.some(n => n === 0) ? 'extra exercises skipped and ' : ''}fewer sets, main lifts kept first.</p>` : ''}
      ${isPoor() ? `<div class="warn"><b>${esc(T('holdDay'))}.</b>${helpTip('hold')}<span>${xp ? "Suggestions use last session's numbers at 2–3 RIR." : 'Same weights as last time, stopping with 2–3 reps left in the tank.'} Sharp or radiating pain, chest pain, fainting or unusual breathlessness: skip training and get checked.</span></div>` : ''}
    </div>`;
  } else if (!isToday) {
    h += `<p class="fine">Preview for ${fmtDate(date, { dow: true })}. Suggestions assume your current readiness.</p>`;
  }
  if (isToday) h += dailyCard(date);

  h += `<p class="lbl">${doneToday ? 'Next time · tap for why' : 'Suggested · tap for why'}</p><ul class="box sug">`;
  const groups = groupLabels(day.slots);
  day.slots.forEach((slot, i) => {
    const ex = S.exById[slot.exId];
    if (!ex) return;
    const sg = sgs[i], n = trim[i];
    const lastExp = S.sessions.find(s => s.date <= ctx.date && s.entries.some(e => e.exId === ex.id && e.sets.some(x => x.done && !x.warm)));
    const le = lastExp?.entries.find(e => e.exId === ex.id);
    const ls = le ? le.sets.filter(x => x.done && !x.warm) : [];
    const lastTxt = ls.length ? `Last ${fmtLoad(ex, Math.max(...ls.map(x => +x.w || 0)))}${ex.unit === 'bw' ? '' : ' ' + unitShort(ex.unit)} × ${ls.map(x => x.r ?? '?').join('·')} · ${fmtDate(lastExp.date)}` : 'First time: no past sets yet';
    const isOpen = open.has(i);
    const reps = sg.reps.slice(0, n || sg.reps.length);
    const load = sg.w == null ? (ex.unit === 'bw' ? T('bw') : expertWording() ? '?' : 'Find weight') : fmtLoad(ex, sg.w);
    h += `<li class="${n === 0 ? 'skip' : ''}"><button class="head" data-act="why" data-i="${i}" aria-expanded="${isOpen}">
      <span class="name">${groups[i] ? `<em class="grp">${groups[i]}</em>` : ''}${esc(ex.name)}</span>
      ${n === 0 ? `<span class="to">${pill('Skipped today')}</span>` : `<span class="to"><span class="num">${esc(load)}<small>${sg.w == null || ex.unit === 'bw' ? '' : unitShort(ex.unit)}</small> × ${reps.join('·')}</span>${chip(sg, ex)}</span>`}
      ${slot.note ? `<span class="snote">${esc(slot.note)}</span>` : ''}
      <span class="last">${esc(lastTxt)} · ${n && n !== sg.reps.length ? `${n} of ` : ''}${slot.sets}×${slot.lo}–${slot.hi}</span></button>
      ${isOpen ? `<p class="why">${esc(sg.why)} ${sg.t === 'cal' ? helpTip('calibrate') : ''}<span class="rir">Aim for ${esc(sg.rir)} ${expertWording() ? 'RIR' : 'reps left'} on each set.</span>${helpTip('rir')} <a href="#/ex/${esc(ex.id)}">History ${ICON.chev}</a></p>` : ''}</li>`;
  });
  h += `</ul>`;
  const pastNoLog = date < t && !doneHere.length;
  if (pastNoLog) h += `<div class="cta"><div class="row2"><button class="btn ghost" data-act="log-day" data-date="${date}">Log this day</button><button class="btn" data-act="start" data-date="${date}">Do ${esc(day.name)} today</button></div></div>`;
  else if (doneToday && !resume) h += `<button class="btn ghost" data-act="pick-day">Train again today</button>`;
  else if (!pastNoLog) h += `<div class="cta"><button class="btn" data-act="start" data-date="${date}">${resume ? 'Resume workout' : isToday ? `Start ${esc(day.name)} <small>· sets pre-filled</small>` : `Do ${esc(day.name)} today <small>· sets pre-filled</small>`}</button></div>`;

  return { title: isToday ? 'Today' : fmtDate(date, { dow: true }), sub: sub(t, gym), right: bwBtn(lastBw), html: h, color: day.color };
}

const sub = (t, gym) => `${fmtDate(t, { dow: true })} · <button class="linkbtn" data-act="gym">${ICON.pin}${esc(gym?.name || 'Gym')}</button>`;
const bwBtn = b => `<button class="chipbtn" data-act="bw" aria-label="${b ? `${num(toDisp(b.kg))} ${getUnits()}, log body weight` : 'Weigh in'}">${ICON.scale}<span>${b ? num(toDisp(b.kg)) + ' ' + getUnits() : 'Weigh in'}</span></button>`;

export function groupLabels(slots) {
  const out = [], count = {};
  slots.forEach((s, i) => {
    if (!s.group) return;
    const same = slots.filter(x => x.group === s.group);
    if (same.length < 2) return;
    count[s.group] = (count[s.group] || 0) + 1;
    out[i] = s.group + count[s.group];
  });
  return out;
}

/** A training day in the last two days with nothing logged since: offer to do it today or let it go. */
export function missedDay(t) {
  if (S.settings.missedReminders === false || S.draft || S.sessions.some(s => s.date === t && !s.seed)) return null;
  for (const back of [1, 2]) {
    const d = addDays(t, -back), day = dayForDate(d);
    if (!day.slots.length) continue;
    if (S.sessions.some(s => s.date >= d && s.date < t && !s.seed)) return null;
    if (S.settings.missedSkip === d || day.name === dayForDate(t).name) return null;
    // Only once there's a habit to protect: a brand-new user hasn't "missed" anything yet.
    if (!S.sessions.some(s => !s.seed && s.date < d)) return null;
    return { date: d, day };
  }
  return null;
}
function missedCard(t) {
  const m = missedDay(t);
  if (!m) return '';
  return `<div class="banner" style="${kstyle(m.day.color)}"><span><b>You missed ${esc(m.day.name)} on ${esc(dowName(dowOf(m.date), true))}</b><small>Do it today and the week carries on, or skip it and follow the plan.</small></span>
    <span class="bcol"><button class="mini" data-act="missed-do" data-date="${m.date}">Do it today</button><button class="mini" data-act="missed-skip" data-date="${m.date}">Skip it</button></span></div>`;
}

/** Nudge to back up once there's something worth losing: 3+ workouts and no backup in 3 weeks. */
function backupCard(t) {
  const own = S.sessions.filter(s => !s.seed).length, lb = S.settings.lastBackup;
  if (own < 3 || (lb && daysBetween(lb, t) < 21)) return '';
  if (S.settings.backupSnooze && daysBetween(S.settings.backupSnooze, t) < 7) return '';
  return `<div class="banner" style="--k:var(--upper)"><span><b>${lb ? `Last backup ${daysBetween(lb, t)} days ago` : 'Back up your workouts'}</b><small>Your ${own} workouts live only on this phone. A backup file keeps them safe if it's lost.</small></span>
    <span class="bcol"><button class="mini" data-act="backup-now">Back up now</button><button class="mini" data-act="backup-later">Later</button></span></div>`;
}

function deloadCard(t) {
  const xp = expertWording();
  if (deloadActive(t)) {
    return `<div class="banner" style="--k:var(--legs)"><span><b>${xp ? 'Deload week' : 'Lighter week'} until ${fmtDate(S.settings.deloadUntil)}</b><small>${xp ? 'About half the sets, 85–90% load, 3–4 RIR.' : 'About half the sets and a bit less weight, stopping with 3–4 reps left.'}</small></span><button class="mini" data-act="deload-end">End</button></div>`;
  }
  if (S.settings.deloadDismissed && S.settings.deloadDismissed > addDays(t, -7)) return '';
  const chk = deloadCheck(S.sessions, S.exercises, t);
  if (!chk.should) return '';
  return `<div class="banner" style="--k:var(--flat)"><span><b>${xp ? 'Consider a deload week' : 'Time for a lighter week?'}</b>${helpTip('deload')}<small>${chk.reasons.map(esc).join('. ')}.</small></span>
    <span class="bcol"><button class="mini" data-act="deload-start">Start</button><button class="mini" data-act="deload-dismiss">Not now</button></span></div>`;
}

export const actions = {
  async 'log-day'(el) {
    const { logPast } = await import('./history.js');
    await logPast(el.dataset.date, dayForDate(el.dataset.date));
  },
  // Tapping the chosen option again clears it, so nothing is recorded unless you mean it.
  sleep: el => setReadiness({ sleep: S.readiness.sleep === el.dataset.v ? null : el.dataset.v }),
  len: el => saveSettings({ sessionLen: el.dataset.v ? +el.dataset.v : null }),
  pain: el => setReadiness({ pain: el.dataset.v === 'Yes' }),
  why: el => { const i = +el.dataset.i; open.has(i) ? open.delete(i) : open.add(i); refresh(); },
  async start(el) {
    const t = todayIso();
    const day = dayForDate(el.dataset.date);
    if (S.draft) {
      if (S.draft.name === day.name && S.draft.date === t) return go('workout');
      const ok = await confirmSheet({ title: `Discard the ${S.draft.name} workout in progress?`, body: 'Sets you ticked there will be lost. Finish it from the Workout tab to keep them.', ok: 'Discard and start', danger: true });
      if (!ok) return;
      await discardDraft();
    }
    await startWorkout(day, t, { minutes: +S.settings.sessionLen || null });
    go('workout');
  },
  'pick-day'() {
    const days = S.program.days.filter(d => d.slots.length);
    openSheet(`<h2 class="sh-title">Which workout?</h2><div class="list">${days.map(d => `<button class="li" data-act="start-day" data-dow="${d.dow}" style="${kstyle(d.color)}"><i class="sw"></i><span><b>${esc(d.name)}</b><small>${esc(d.sub || '')} · ${d.slots.length} exercises</small></span></button>`).join('')}</div>`, { label: 'Pick a workout' });
  },
  async 'start-day'(el) {
    const day = S.program.days.find(d => d.dow === +el.dataset.dow);
    closeSheet();
    if (S.draft) {
      const ok = await confirmSheet({ title: `Discard the ${S.draft.name} workout in progress?`, ok: 'Discard and start', danger: true });
      if (!ok) return;
      await discardDraft();
    }
    await startWorkout(day, todayIso());
    go('workout');
  },
  bw() {
    const t = todayIso();
    const cur = S.body.find(b => b.date === t);
    const last = S.body[S.body.length - 1];
    openSheet(`<h2 class="sh-title">Body weight</h2>
      <label class="field"><span>Date</span><input id="bw-date" type="date" value="${t}" max="${t}"></label>
      <label class="field"><span>Weight (${getUnits()})</span><input id="bw-kg" type="number" inputmode="decimal" step="0.1" min="20" max="${getUnits() === 'lb' ? 660 : 300}" value="${cur ? num(toDisp(cur.kg)) : last ? num(toDisp(last.kg)) : ''}" autofocus></label>
      <p class="fine">Same time of day, ideally morning, gives the cleanest trend.${S.settings.goalKg ? ` Goal: ${esc(num(toDisp(S.settings.goalKg)))} ${getUnits()}.` : ''}</p>
      <div class="row2"><a class="btn ghost" href="#/body">See trend</a><button class="btn" data-act="bw-save">Save</button></div>`, { label: 'Body weight' });
  },
  async 'bw-save'() {
    const date = document.getElementById('bw-date').value || todayIso();
    const typed = parseFloat(document.getElementById('bw-kg').value);
    const kg = +(+fromDisp(typed)).toFixed(2);
    if (!(kg > 20 && kg < 300)) return toast(getUnits() === 'lb' ? 'Enter a weight between 45 and 660 lb' : 'Enter a weight between 20 and 300 kg', 'down');
    if (date > todayIso()) return toast("Can't log a future date", 'down');
    closeSheet();
    await saveBody({ id: 'b-' + date, date, kg });
    toast(`Saved ${num(typed)} ${getUnits()}`, 'up');
  },
  gym() {
    openSheet(`<h2 class="sh-title">Where are you training?</h2><p class="sh-body">Machine and cable loads are only compared within the same gym.</p><div class="list">${S.settings.gyms.map(g => `<button class="li" data-act="gym-set" data-id="${esc(g.id)}" aria-pressed="${g.id === S.settings.gymId}">${ICON.pin}<span><b>${esc(g.name)}</b></span>${g.id === S.settings.gymId ? pill('Current', 'up') : ''}</button>`).join('')}</div><a class="btn ghost" href="#/gyms">Manage gyms</a>`, { label: 'Choose gym' });
  },
  async 'gym-set'(el) { closeSheet(); await saveSettings({ gymId: el.dataset.id }); },
  async 'deload-start'() {
    const until = addDays(todayIso(), 6);
    await saveSettings({ deloadUntil: until });
    toast(`Deload on until ${fmtDate(until)}`, 'legs');
  },
  'deload-end': () => saveSettings({ deloadUntil: null }),
  'deload-dismiss': () => saveSettings({ deloadDismissed: todayIso() }),
  'backup-later': () => saveSettings({ backupSnooze: todayIso() }),
  // Share sheet straight away (Drive, WhatsApp, email); falls back to a download.
  async 'backup-now'() {
    const { exportAll } = await import('../state.js');
    const { shareFile, download } = await import('../io.js');
    const name = `wegogim-backup-${todayIso()}.json`, text = JSON.stringify(await exportAll());
    try {
      if (!(await shareFile(name, text))) { download(name, text, 'application/json'); toast('Backup saved to Downloads', 'up'); }
      await saveSettings({ lastBackup: todayIso() });
    } catch (e) { if (e.name !== 'AbortError') throw e; }
  },
  async 'missed-do'(el) {
    if (S.draft) return go('workout');
    await startWorkout(dayForDate(el.dataset.date), todayIso(), { minutes: +S.settings.sessionLen || null });
    go('workout');
  },
  async 'missed-skip'(el) {
    const d = el.dataset.date;
    await saveSettings({ missedSkip: d });
    toast('Skipped. Train on your own days? Turn these off in More → Settings.', 'ink', { undo: () => saveSettings({ missedSkip: null }) });
  },
};
