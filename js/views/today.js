import { S, todayIso, dayForDate, setReadiness, startWorkout, suggestionCtx, isPoor, deloadActive, saveSettings, saveBody, discardDraft, refresh } from '../state.js';
import { suggest, weekStart, addDays, deloadCheck, fmtLoad, unitShort, dowOf, estimateDay } from '../engine.js';
import { esc, fmtDate, chip, pill, ICON, openSheet, closeSheet, confirmSheet, toast, cvar, dowName, num } from '../ui.js';
import { go } from '../app.js';

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
    h += `<a class="resume" href="#/workout" style="--k:${cvar(S.draft.color)}"><span><b>${esc(S.draft.name)} ${stale ? `from ${fmtDate(S.draft.date, { dow: true })} not saved` : 'in progress'}</b><small>${done}/${all.length} sets · ${stale ? 'finish or discard it' : `started ${new Date(S.draft.start).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}</small></span><span class="pill">${stale ? 'Open' : 'Resume'} ${ICON.chev}</span></a>`;
  }
  h += deloadCard(t);

  // week strip
  const ws = weekStart(t);
  h += `<div class="days" role="group" aria-label="This week">`;
  for (let i = 0; i < 7; i++) {
    const d = addDays(ws, i), pd = dayForDate(d), done = S.sessions.some(s => s.date === d && !s.seed);
    h += `<a href="#/today/${d}" class="${d === t ? 'is-today' : ''} ${done ? 'is-done' : ''}" aria-current="${d === date ? 'date' : 'false'}" style="--k:${cvar(pd.color)}">
      <span>${dowName(dowOf(d)).slice(0, 1)}</span><b>${+d.slice(8)}</b><span>${esc(pd.name.split(' ')[0])}</span></a>`;
  }
  h += `</div>`;

  const doneHere = S.sessions.filter(s => s.date === date && !s.seed);
  for (const s of doneHere) {
    const n = s.entries.reduce((a, e) => a + e.sets.filter(x => x.done && !x.warm).length, 0);
    const exN = s.entries.filter(e => e.sets.some(x => x.done && !x.warm)).length;
    h += `<a class="donecard" href="#/session/${esc(s.id)}" style="--k:${cvar(s.color)}">${ICON.check}<span><b>${esc(s.name)} done</b><small>${n} set${n === 1 ? '' : 's'} · ${exN} exercise${exN === 1 ? '' : 's'} · tap for details</small></span></a>`;
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
  const planned = { ...day, slots: day.slots.map((x, i) => ({ ...x, sets: sgs[i]?.reps.length ?? x.sets })) };
  const sets = planned.slots.reduce((a, x) => a + +x.sets, 0);
  const last = S.sessions.find(s => (s.name === day.name || s.color === day.color) && s.date <= date);
  h += `<div class="hero"><div><h2>${esc(day.name)}</h2><p>${esc(day.sub || '')}</p></div>
    <div class="meta"><span><b>${day.slots.length}</b>exercises</span><span><b>${sets}</b>work sets</span><span><b>~${Math.round(estimateDay(planned, S.exById, S.sessions) / 60)}</b>min</span><span><b>${last ? (last.date === t ? 'Today' : fmtDate(last.date)) : '—'}</b>last done</span></div></div>`;

  const resume = S.draft && S.draft.name === day.name && S.draft.date === t;
  // Readiness only shapes a workout at the moment it starts: hide it once today's is logged or under way.
  if (isToday && !doneToday && !resume) {
    h += `<div class="box ready">
      <div class="rrow"><span>Sleep last night</span><div class="seg" role="group" aria-label="Sleep">${['<6', '6–7', '7+'].map(v => `<button data-act="sleep" data-v="${v}" aria-pressed="${S.readiness.sleep === v}">${v} h</button>`).join('')}</div></div>
      <div class="rrow"><span>Pain or joint niggle</span><div class="seg" role="group" aria-label="Pain">${['No', 'Yes'].map(v => `<button data-act="pain" data-v="${v}" aria-pressed="${(v === 'Yes') === !!S.readiness.pain}">${v}</button>`).join('')}</div></div>
      ${isPoor() ? `<div class="warn"><b>Hold day.</b><span>Suggestions use last session's numbers at 2–3 RIR. Sharp or radiating pain, chest pain, fainting or unusual breathlessness: skip training and get checked.</span></div>` : ''}
    </div>`;
  } else if (!isToday) {
    h += `<p class="fine">Preview for ${fmtDate(date, { dow: true })}. Suggestions assume your current readiness.</p>`;
  }

  h += `<p class="lbl">${doneToday ? 'Next time · tap for why' : 'Suggested · tap for why'}</p><ul class="box sug">`;
  const groups = groupLabels(day.slots);
  day.slots.forEach((slot, i) => {
    const ex = S.exById[slot.exId];
    if (!ex) return;
    const sg = sgs[i];
    const lastExp = S.sessions.find(s => s.date <= ctx.date && s.entries.some(e => e.exId === ex.id && e.sets.some(x => x.done && !x.warm)));
    const le = lastExp?.entries.find(e => e.exId === ex.id);
    const ls = le ? le.sets.filter(x => x.done && !x.warm) : [];
    const lastTxt = ls.length ? `Last ${fmtLoad(ex, Math.max(...ls.map(x => +x.w || 0)))}${ex.unit === 'bw' ? '' : ' ' + unitShort(ex.unit)} × ${ls.map(x => x.r ?? '?').join('·')} · ${fmtDate(lastExp.date)}` : 'No comparable log yet';
    const isOpen = open.has(i);
    h += `<li><button class="head" data-act="why" data-i="${i}" aria-expanded="${isOpen}">
      <span class="name">${groups[i] ? `<em class="grp">${groups[i]}</em>` : ''}${esc(ex.name)}</span>
      <span class="to"><span class="num">${sg.w == null ? (ex.unit === 'bw' ? 'BW' : '?') : esc(fmtLoad(ex, sg.w))}<small>${sg.w == null || ex.unit === 'bw' ? '' : unitShort(ex.unit)}</small> × ${sg.reps.join('·')}</span>${chip(sg, ex)}</span>
      <span class="last">${esc(lastTxt)} · ${slot.sets}×${slot.lo}–${slot.hi}</span></button>
      ${isOpen ? `<p class="why">${esc(sg.why)} <span class="rir">Target ${esc(sg.rir)} RIR.</span> <a href="#/ex/${esc(ex.id)}">History ${ICON.chev}</a></p>` : ''}</li>`;
  });
  h += `</ul>`;
  const pastNoLog = date < t && !doneHere.length;
  if (pastNoLog) h += `<div class="cta"><div class="row2"><button class="btn ghost" data-act="log-day" data-date="${date}">Log this day</button><button class="btn" data-act="start" data-date="${date}">Do ${esc(day.name)} today</button></div></div>`;
  else if (doneToday && !resume) h += `<button class="btn ghost" data-act="pick-day">Train again today</button>`;
  else if (!pastNoLog) h += `<div class="cta"><button class="btn" data-act="start" data-date="${date}">${resume ? 'Resume workout' : isToday ? 'Start workout <small>· sets pre-filled</small>' : `Do ${esc(day.name)} today <small>· sets pre-filled</small>`}</button></div>`;

  return { title: isToday ? 'Today' : fmtDate(date, { dow: true }), sub: sub(t, gym), right: bwBtn(lastBw), html: h, color: day.color };
}

const sub = (t, gym) => `${fmtDate(t, { dow: true })} · <button class="linkbtn" data-act="gym">${ICON.pin}${esc(gym?.name || 'Gym')}</button>`;
const bwBtn = b => `<button class="chipbtn" data-act="bw" aria-label="${b ? `${num(b.kg)} kg, log body weight` : 'Weigh in'}">${ICON.scale}<span>${b ? num(b.kg) + ' kg' : 'Weigh in'}</span></button>`;

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

function deloadCard(t) {
  if (deloadActive(t)) {
    return `<div class="banner" style="--k:var(--legs)"><span><b>Deload week until ${fmtDate(S.settings.deloadUntil)}</b><small>About half the sets, 85–90% load, 3–4 RIR.</small></span><button class="mini" data-act="deload-end">End</button></div>`;
  }
  if (S.settings.deloadDismissed && S.settings.deloadDismissed > addDays(t, -7)) return '';
  const chk = deloadCheck(S.sessions, S.exercises, t);
  if (!chk.should) return '';
  return `<div class="banner" style="--k:var(--flat)"><span><b>Consider a deload week</b><small>${chk.reasons.map(esc).join('. ')}.</small></span>
    <span class="bcol"><button class="mini" data-act="deload-start">Start</button><button class="mini" data-act="deload-dismiss">Not now</button></span></div>`;
}

export const actions = {
  async 'log-day'(el) {
    const { logPast } = await import('./history.js');
    await logPast(el.dataset.date, dayForDate(el.dataset.date));
  },
  sleep: el => setReadiness({ sleep: el.dataset.v }),
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
    await startWorkout(day, t);
    go('workout');
  },
  'pick-day'() {
    const days = S.program.days.filter(d => d.slots.length);
    openSheet(`<h2 class="sh-title">Which workout?</h2><div class="list">${days.map(d => `<button class="li" data-act="start-day" data-dow="${d.dow}" style="--k:${cvar(d.color)}"><i class="sw"></i><span><b>${esc(d.name)}</b><small>${esc(d.sub || '')} · ${d.slots.length} exercises</small></span></button>`).join('')}</div>`, { label: 'Pick a workout' });
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
      <label class="field"><span>Weight (kg)</span><input id="bw-kg" type="number" inputmode="decimal" step="0.1" min="20" max="300" value="${cur ? cur.kg : last ? last.kg : ''}" autofocus></label>
      <p class="fine">Same time of day, ideally morning, gives the cleanest trend. Goal: ${esc(S.settings.goalKg)} kg.</p>
      <div class="row2"><a class="btn ghost" href="#/body">See trend</a><button class="btn" data-act="bw-save">Save</button></div>`, { label: 'Body weight' });
  },
  async 'bw-save'() {
    const date = document.getElementById('bw-date').value || todayIso();
    const kg = parseFloat(document.getElementById('bw-kg').value);
    if (!(kg > 20 && kg < 300)) return toast('Enter a weight between 20 and 300 kg', 'down');
    if (date > todayIso()) return toast("Can't log a future date", 'down');
    closeSheet();
    await saveBody({ id: 'b-' + date, date, kg });
    toast(`Saved ${kg} kg`, 'up');
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
};
