import { S, saveDraft, refresh, commitDraft, discardDraft, newEntry, startWorkout, todayIso, uid, deloadActive, saveExercise, saveSettings } from '../state.js';
import { guessMuscles } from '../io.js';
import { fmtLoad, unitShort, unitLong, nextFor, volume, warmup, platesPerSide, nearestDumbbell, exposures, personalBests, e1rm, isKg, workSets, topLoad, muscleXP, levelFor, estimateRemaining, suggest, addDays, MUSCLES, toDisp, fromDisp, getUnits, stepDisp, score, round, MAX_KG, MAX_REPS } from '../engine.js';
import { esc, fmtDate, chip, pill, ICON, openSheet, closeSheet, confirmSheet, toast, cvar, kstyle, num, kfmt, T, helpTip, expertWording } from '../ui.js';
import { go, startTimer } from '../app.js';
import { groupLabels } from './today.js';

const FEEL = [[1, 'Drained'], [2, 'Low'], [3, 'OK'], [4, 'Good'], [5, 'Great']];

// Per-card UI state kept across re-renders: "why" text open, finished card re-opened.
const openWhy = new Set();
const openDone = new Set();

const lastAt = e => Math.max(0, ...e.sets.map(s => s.at || 0));
const pending = e => e.sets.findIndex(s => !s.done);

/** The set to do next after working on `e`: superset partner first, then `e` itself, then the next unfinished exercise. */
function nextUp(e) {
  const es = S.draft.entries;
  const g = e.slot?.group;
  const same = g ? es.filter(x => x.slot?.group === g) : [];
  if (same.length > 1) {
    const i = same.indexOf(e);
    for (const x of [...same.slice(i + 1), ...same.slice(0, i + 1)]) { const si = pending(x); if (si >= 0) return { e: x, si }; }
  }
  const own = pending(e);
  if (own >= 0) return { e, si: own };
  const at = es.indexOf(e);
  for (const x of [...es.slice(at + 1), ...es.slice(0, at)]) { const si = pending(x); if (si >= 0) return { e: x, si }; }
  return null;
}

/** Where the lifter is now: the set after the most recently ticked one, else the very first open set. */
function focusSet() {
  const es = S.draft.entries;
  let recent = null;
  for (const e of es) if (lastAt(e) && (!recent || lastAt(e) > lastAt(recent))) recent = e;
  if (recent) return nextUp(recent);
  const e = es.find(x => pending(x) >= 0);
  return e ? { e, si: pending(e) } : null;
}

/** A finished exercise folds to one line once its reps-left is logged, or once you've clearly moved on
 *  (two sets ticked elsewhere since), so there's always a rest period to set it. */
function folded(e) {
  if (openDone.has(e.uid) || !e.sets.length || e.sets.some(s => !s.done)) return false;
  if (e.rir != null) return true;
  const t = lastAt(e);
  let later = 0;
  for (const o of S.draft.entries) if (o !== e) for (const x of o.sets) if (x.done && (x.at || 0) > t) later++;
  return later >= 2;
}

/** Loads shown and typed in the display unit (kg or lb); cable levels are never converted. */
const conv = ex => ex.unit !== 'L';
const shown = (ex, w) => (w == null || w === '' ? '' : conv(ex) ? toDisp(w) : w);
const rirWords = r => (expertWording() ? `${r} RIR` : `${r} reps left`);

/** "25 kg ea × 9·9·9" style text for the work sets done, grouped by load. */
function setsText(ex, sets) {
  const runs = [];
  for (const s of sets) {
    const last = runs[runs.length - 1];
    if (last && +last.w === +s.w) last.r.push(s.r ?? '?'); else runs.push({ w: s.w, r: [s.r ?? '?'] });
  }
  const u = unitShort(ex.unit);
  return runs.map(x => `${fmtLoad(ex, x.w)}${u ? ' ' + u : ''} × ${x.r.join('·')}`).join(', ');
}

export function render() {
  const d = S.draft;
  if (!d) return empty();
  if (d.summary) return summary(d);
  const mins = Math.max(0, Math.floor((Date.now() - d.start) / 60000));
  const all = d.entries.flatMap(e => e.sets.filter(s => !s.warm)), done = all.filter(s => s.done).length;
  const left = estimateRemaining(d.entries, S.exById, S.sessions, Date.now(), d.start);
  const finishAt = new Date(Date.now() + left * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  let h = `<div class="sbar"><div class="prog"><i style="width:${all.length ? done / all.length * 100 : 0}%"></i></div><span class="num">${done}/${all.length} sets</span></div>`;
  // Backfilling a past day: no clock, no rest timer; an optional duration instead.
  if (d.past) h += `<div class="warn" style="--k:var(--upper)"><b>Past workout.</b><span>Logging ${fmtDate(d.date, { dow: true, year: true })}. Tick the sets you did.</span></div>
    <div class="rrow"><label for="past-min">How long did it take?</label><input class="inp sm" id="past-min" type="number" inputmode="numeric" min="1" max="300" placeholder="min" value="${d.minutes ?? ''}" data-input="past-min"></div>`;
  if (d.deload) h += `<div class="warn" style="--k:var(--legs)"><b>${esc(T('deload'))}.</b>${helpTip('deload')}<span>Fewer sets, lighter loads, stop with 3–4 reps left.</span></div>`;
  else if (d.readiness?.sleep === '<6' || d.readiness?.pain) h += `<div class="warn"><b>${esc(T('holdDay'))}.</b>${helpTip('hold')}<span>Same weights as last session. Stop 2–3 reps short of failure.</span></div>`;
  if (d.short) h += `<p class="fine">Short session (${d.short} min): fewer sets, main lifts first. Add sets with + Set if you have time.</p>`;

  h += coach(done, all.length);
  const groups = groupLabels(d.entries.map(e => e.slot || {}));
  const focus = focusSet();
  d.entries.forEach((e, ei) => { h += card(e, ei, groups[ei], focus?.e === e ? focus.si : -1); });
  if (!d.entries.length) h += `<div class="empty"><b>No exercises yet.</b><p>Add the first one below.</p></div>`;

  for (const [ci, c] of (d.cardio || []).entries()) h += `<article class="box exc cardioc"><div class="rowi"><span class="sw" style="--k:var(--pull)"></span><span class="grow"><b>${esc(c.type)}</b> · ${c.min} min${c.km ? ` · ${num(c.km)} km` : ''} · ${esc(c.intensity)}<small>Cardio, added to your cardio log when you save</small></span><button class="mini" data-act="cardio-rm" data-i="${ci}" aria-label="Remove ${esc(c.type)}">Remove</button></div></article>`;
  h += `<div class="row2"><button class="btn ghost" data-act="add-ex">${ICON.plus} Add exercise</button><button class="btn ghost" data-act="add-cardio">${ICON.plus} Add cardio</button></div>`;
  h += `<section class="box notesbox"><p class="lbl">Session notes</p>
    <div class="rrow"><span>How did it feel?</span><div class="seg" role="group" aria-label="Feel">${FEEL.map(([v, l]) => `<button data-act="feel" data-v="${v}" aria-pressed="${d.feel === v}" title="${l}">${v}</button>`).join('')}</div></div>
    <div class="rrow"><label for="hr">Peak heart rate</label><input class="inp sm" id="hr" type="number" inputmode="numeric" placeholder="bpm" value="${d.hr ?? ''}" data-input="hr"></div>
    <textarea class="inp" id="snote" rows="2" placeholder="Anything worth remembering: sleep, energy, technique" data-input="snote">${esc(d.note || '')}</textarea></section>`;
  // Every set ticked: the Finish button sticks to the bottom of the screen, within thumb reach.
  const allDone = all.length > 0 && done === all.length;
  h += allDone
    ? `<button class="linkbtn danger center" data-act="discard">Discard workout</button>
    <div class="finbar"><button class="btn" data-act="finish" style="--c:var(--up)">${ICON.check} Finish workout</button></div>`
    : `<button class="btn" data-act="finish" style="--c:var(--up)">Finish workout</button>
    <button class="linkbtn danger center" data-act="discard">Discard workout</button>`;
  return {
    // The bar is sticky, so the clock and time left stay visible while scrolling.
    title: d.name, sub: d.past ? `Past workout · ${fmtDate(d.date, { dow: true })}` : `${d.date !== todayIso() ? fmtDate(d.date, { dow: true }) + ' · ' : ''}${mins} min in · ${left ? `~${Math.round(left / 60)} left · done ${finishAt}` : 'last sets'}`, color: d.color,
    right: `<button class="mini go" data-act="finish">Finish</button>`, html: h,
  };
}

function empty() {
  const days = S.program.days.filter(d => d.slots.length);
  let h = `<div class="empty"><b>No workout running.</b><p>Start one and every set arrives pre-filled from your last session.</p></div>
    <a class="btn" href="#/today">Go to today's plan</a><p class="lbl">Or start any day</p><div class="list box">`;
  h += days.map(d => `<button class="li" data-act="start-day" data-dow="${d.dow}" style="${kstyle(d.color)}"><i class="sw"></i><span><b>${esc(d.name)}</b><small>${esc(d.sub || '')} · ${d.slots.length} exercises</small></span>${ICON.chev}</button>`).join('');
  h += `<button class="li" data-act="start-empty"><i class="sw" style="--k:var(--mute)"></i><span><b>Empty workout</b><small>Add exercises as you go</small></span>${ICON.chev}</button></div>`;
  return { title: 'Workout', sub: 'Nothing running', html: h };
}

function card(e, ei, grp, focusSi = -1) {
  const ex = S.exById[e.exId];
  if (!ex) return '';
  const g = grp ? `<em class="grp">${grp}</em>` : '';
  if (folded(e)) {
    const ws = workSets(e);
    return `<article class="box exc fold" id="ex-${e.uid}"><button class="foldbtn" data-act="unfold" data-uid="${e.uid}" aria-expanded="false" aria-label="${esc(ex.name)} done. Show sets">
      <span class="ok">${ICON.check}</span><span class="grow"><b>${g}${esc(ex.name)}</b><small>${esc(ws.length ? setsText(ex, ws) : 'No work sets')}${e.rir != null ? ` · ${esc(rirWords(e.rir))}` : ''}</small></span>${e.pain ? pill('pain', 'down') : ''}${ICON.chev}</button></article>`;
  }
  const slot = e.slot;
  const exps = exposures(S.sessions, ex, { gymId: S.settings.gymId, before: S.draft.date });
  const last = exps[0];
  const lastTxt = last ? `last ${setsText(ex, last.sets)} · ${fmtDate(last.date)}` : `no comparable log · ${unitLong(ex.unit)}`;
  let n = 0;
  const rows = e.sets.map((s, si) => {
    const label = s.warm ? 'W' : ++n;
    const bw = ex.unit === 'bw';
    const who = `${esc(ex.name)}, ${s.warm ? 'warm-up set' : 'set ' + label}`;
    return `<div class="set ${s.done ? 'done' : ''} ${s.warm ? 'warm' : ''} ${si === focusSi ? 'next' : ''}"><span class="i" aria-hidden="true">${label}</span>
      <div class="step"><button data-act="bump" data-e="${ei}" data-s="${si}" data-f="w" data-d="-1" aria-label="${who}: less weight">−</button><input id="w-${e.uid}-${si}" data-input="set" data-e="${ei}" data-s="${si}" data-f="w" type="number" inputmode="decimal" step="any" value="${esc(bw && !+s.w ? '' : shown(ex, s.w))}" placeholder="${bw ? esc(T('bw')) : ex.unit === 'L' ? 'lvl' : getUnits()}" aria-label="${who}: ${bw ? `added weight in ${getUnits()}` : ex.unit === 'L' ? 'level' : `weight in ${getUnits()}`}"><button data-act="bump" data-e="${ei}" data-s="${si}" data-f="w" data-d="1" aria-label="${who}: more weight">+</button></div>
      <div class="step"><button data-act="bump" data-e="${ei}" data-s="${si}" data-f="r" data-d="-1" aria-label="${who}: one rep fewer">−</button><input id="r-${e.uid}-${si}" data-input="set" data-e="${ei}" data-s="${si}" data-f="r" type="number" inputmode="numeric" value="${esc(s.r ?? '')}" placeholder="reps" aria-label="${who}: reps"><button data-act="bump" data-e="${ei}" data-s="${si}" data-f="r" data-d="1" aria-label="${who}: one rep more">+</button></div>
      <button class="check" data-act="done" data-e="${ei}" data-s="${si}" aria-label="${who} done" aria-pressed="${!!s.done}">${ICON.check}</button></div>`;
  }).join('');
  const whyOpen = openWhy.has(e.uid);
  // The suggestion chip doubles as the "why" toggle, so the reason costs no space until asked for.
  const tag = e.sg?.why ? `<button class="whybtn" data-act="why" data-uid="${e.uid}" aria-expanded="${whyOpen}" aria-label="Why this target for ${esc(ex.name)}">${chip(e.sg, ex)}<i class="whyq">${ICON.help}</i></button>` : chip(e.sg, ex);
  return `<article class="box exc" id="ex-${e.uid}">
    <header><div><h3>${g}<a href="#/ex/${esc(ex.id)}">${esc(ex.name)}</a></h3>
      ${slot?.note ? `<p class="snote">${esc(slot.note)}</p>` : ''}
      <p>${slot ? `${e.sg?.reps?.length || slot.sets}×${slot.lo}–${slot.hi} · ` : ''}${esc(lastTxt)}</p></div>
      <span class="hdr-r">${tag}<button class="iconbtn sm" data-act="menu" data-e="${ei}" aria-label="Options for ${esc(ex.name)}">${ICON.dots}</button></span></header>
    ${whyOpen ? `<p class="whyp">${esc(e.sg.why)} Aim for ${esc(rirWords(e.sg.rir))} on each set.${e.sg.t === 'cal' ? helpTip('calibrate') : ''}</p>` : ''}
    ${startPick(e, ex, ei)}
    ${helper(e, ex)}
    <div class="sets">${rows}</div>
    ${e.note ? `<p class="enote">${esc(e.note)}</p>` : ''}
    <div class="exf"><span class="rirlbl">${esc(T('rir'))}${helpTip('rir')}</span><div class="seg sm" role="group" aria-label="${esc(ex.name)}: ${esc(T('rirLong'))} on the last set">${['0', '1', '2', '3+'].map(v => `<button data-act="rir" data-e="${ei}" data-v="${v}" aria-pressed="${e.rir === v}">${v}</button>`).join('')}</div><span class="grow"></span>${canWarm(e, ex) ? `<button class="mini" data-act="warm" data-e="${ei}" aria-label="Add warm-up sets to ${esc(ex.name)}">+ Warm-up</button>` : ''}
      <button class="mini" data-act="add-set" data-e="${ei}" aria-label="Add a set to ${esc(ex.name)}">+ Set</button><button class="mini" data-act="pain" data-e="${ei}" aria-pressed="${!!e.pain}" aria-label="${esc(ex.name)}: pain">Pain</button></div>
  </article>`;
}

/** Plate / dumbbell helper for the next set to do. */
function helper(e, ex) {
  const s = e.sets.find(x => !x.done) || e.sets[e.sets.length - 1];
  const w = +s?.w;
  if (!(w > 0)) return '';
  const eq = S.settings.equip;
  if (ex.equip === 'barbell' || ex.equip === 'smith') {
    const bar = barFor(ex);
    const p = platesPerSide(w, bar, eq.plates);
    const U = getUnits(), wt = `${num(toDisp(w))} ${U}`;
    if (!p.ok) return `<p class="helper">${w < bar ? `Below the ${num(toDisp(bar))} ${U} bar.` : `Can't make ${wt} exactly with your plates (${num(toDisp(p.rem), 2)} ${U}/side short).`}</p>`;
    return `<p class="helper">${wt}: <b>${p.plates.length ? p.plates.join(' + ') + ' kg' : 'empty bar'}</b>${p.plates.length ? ' per side' : ''} on the ${num(toDisp(bar))} ${U} bar</p>`;
  }
  if (ex.unit === 'kg/DB' && eq.dumbbells?.length && !eq.dumbbells.includes(w)) {
    return `<p class="helper">No ${num(toDisp(w))} ${getUnits()} dumbbell in your list. Nearest: <b>${num(toDisp(nearestDumbbell(w, eq.dumbbells)))} ${getUnits()}</b></p>`;
  }
  return '';
}

/** A barbell or Smith lift with no warm-ups yet and nothing ticked: offer to add them in one tap. */
const canWarm = (e, ex) => (ex.equip === 'barbell' || ex.equip === 'smith') && !e.sets.some(s => s.warm || s.done) && +(e.sets[0]?.w) >= 40;

// ---- first workouts: short hints that follow what you're doing ------------------------------
function coach(done, total) {
  if (S.settings.coachDone || S.draft.past || S.sessions.filter(s => !s.seed && !s.imported).length >= 2) return '';
  const msg = !done
    ? ['Your first sets are filled in', 'Do the set, then tap the tick. If you did a different weight or reps, change the numbers with − and + first. Tap the coloured tag for why this target.']
    : done < total
      ? ['Nice, keep going', 'The rest timer runs along the bottom: +30s for more rest, Skip when you are ready. The next set is highlighted.']
      : ['All sets done', 'Tap Finish to see your summary and what to aim for next time.'];
  return `<div class="box coach"><b>${msg[0]}</b><p>${msg[1]}</p><button class="linkbtn" data-act="coach-ok">Got it, hide tips</button></div>`;
}

// ---- starting weight for a brand-new lift -----------------------------------------------------------
const BASE = { bbsquat: 40, squat: 40, frontsquat: 30, deadlift: 50, trapdl: 50, smithdl: 50, rdl: 40, hipthrust: 40, bbbench: 30, cgb: 25, ohp: 20, pushpress: 25, bbrow: 30, ezcurl: 15, skull: 15, snatch: 20, cleanjerk: 25, powerclean: 30, legpress: 80 };
const LIGHT_DB = new Set(['dblat', 'dbreardelt', 'wristcurl', 'revwristcurl', 'dbfly']);
const LIGHT_L = new Set(['lat', 'facepull', 'rdelt', 'glutekick']);
/** A sensible first weight from how heavy the lifter says they go (0.6 light, 1 medium, 1.5 heavy), snapped to real equipment. */
export function startGuess(ex, f = 1) {
  const exp = S.settings.setupAnswers?.experience || S.settings.experience;
  const k = f * (exp === 'new' ? 0.75 : exp === 'experienced' ? 1.35 : 1);
  const legs = (ex.muscles || []).some(m => ['Quads', 'Hamstrings', 'Glutes', 'Calves'].includes(m));
  const eq = S.settings.equip;
  if (ex.unit === 'L') return Math.max(1, Math.round((LIGHT_L.has(ex.id) ? 3 : 6) * k));
  if (ex.unit === 'kg/DB') {
    const main = (ex.muscles || [])[0];
    const base = LIGHT_DB.has(ex.id) ? 4 : legs || main === 'Chest' || main === 'Back' ? 12 : 8;
    return eq.dumbbells?.length ? nearestDumbbell(base * k, eq.dumbbells) : round(base * k, 2);
  }
  const base = BASE[ex.id] ?? (ex.equip === 'barbell' || ex.equip === 'smith' ? 30 : legs ? 40 : 25);
  if (ex.equip === 'barbell' || ex.equip === 'smith') return Math.max(barFor(ex), round(base * k, 2.5));
  return Math.max(5, round(base * k, 5));
}
function startPick(e, ex, ei) {
  if (e.sg?.t !== 'cal' || ex.unit === 'bw' || e.sets.some(s => s.done || (!s.warm && +s.w > 0))) return '';
  return `<div class="startw"><p><b>New lift.</b> How heavy do you usually go on this, or is it new to you?</p><div class="seg" role="group" aria-label="Starting weight for ${esc(ex.name)}">${[[0.6, 'Light / new'], [1, 'Medium'], [1.5, 'Heavy']].map(([v, l]) => `<button data-act="start-w" data-e="${ei}" data-v="${v}">${l}</button>`).join('')}</div><p class="fine">A starting weight is filled in for you. Or type your own below.</p></div>`;
}

// ---- supersets from the workout --------------------------------------------------------------------
function pairItem(ei) {
  const e = S.draft.entries[ei], nx = S.draft.entries[ei + 1];
  if (e.slot?.group && S.draft.entries.filter(x => x.slot?.group === e.slot.group).length > 1) return `<button class="li" data-act="unpair" data-e="${ei}"><span><b>Unpair</b><small>Rest after each exercise again</small></span></button>`;
  if (!nx) return '';
  return `<button class="li" data-act="pair" data-e="${ei}"><span><b>Pair with ${esc(S.exById[nx.exId]?.name || 'the next exercise')}</b><small>${esc(T('superset'))}: do them back to back, rest after both</small></span></button>`;
}

// ---- cardio inside a workout ---------------------------------------------------------------------------
const CW_TYPES = ['Treadmill', 'Bike', 'Rower', 'Stairs', 'Incline walk', 'Run', 'Swim', 'Other'];
const cw = { type: 'Treadmill', intensity: 'moderate' };
function cardioSheet() {
  const keep = id => document.getElementById(id)?.value ?? '';
  const min = keep('cw-min'), km = keep('cw-km');
  openSheet(`<h2 class="sh-title">Add cardio</h2>
    <div class="chips" role="group" aria-label="Type">${CW_TYPES.map(x => `<button class="mini" data-act="cw-type" data-v="${x}" aria-pressed="${cw.type === x}">${x}</button>`).join('')}</div>
    <div class="row2"><label class="field"><span>Minutes</span><input class="inp" id="cw-min" type="number" inputmode="numeric" min="1" max="600" placeholder="20" value="${esc(min)}"></label>
    <label class="field"><span>Distance (km, optional)</span><input class="inp" id="cw-km" type="number" inputmode="decimal" step="0.1" min="0" placeholder="—" value="${esc(km)}"></label></div>
    <div class="rrow"><span>Intensity</span><div class="seg" role="group" aria-label="Intensity">${[['easy', 'Easy'], ['moderate', 'Moderate'], ['hard', 'Hard']].map(([v, l]) => `<button data-act="cw-int" data-v="${v}" aria-pressed="${cw.intensity === v}">${l}</button>`).join('')}</div></div>
    <button class="btn" data-act="cw-save">Add to workout</button>`, { label: 'Add cardio' });
}

// ---- early wins: the first few workouts show that the plan is working ---------------------------------
function earlyWins(d) {
  const before = S.sessions.filter(s => !s.seed && !s.imported).length;
  if (before >= 5) return '';
  const beat = [];
  for (const e of d.entries) {
    const ex = S.exById[e.exId], ws = workSets(e);
    if (!ex || !ws.length) continue;
    const last = exposures(S.sessions, ex, { gymId: d.gymId, before: d.date })[0];
    if (!last) continue;
    const now = score({ sets: ws }, ex.unit), then = score(last, ex.unit);
    const repsNow = ws.reduce((a, s) => a + (+s.r || 0), 0), repsThen = last.sets.reduce((a, s) => a + (+s.r || 0), 0);
    if ((now != null && then != null && now > then + 1e-6) || (ex.unit === 'bw' && repsNow > repsThen)) beat.push(ex.name);
  }
  if (beat.length) return `<div class="box prbox win"><p class="lbl">You beat last time</p><p>${ICON.trendUp}${esc(beat.slice(0, 4).join(', '))}${beat.length > 4 ? ` and ${beat.length - 4} more` : ''}.</p><p class="fine">That is how it works: every session starts from your last one and asks for a little more where you earned it.</p></div>`;
  if (!before) return `<div class="box prbox win"><p class="lbl">First workout logged</p><p class="fine">Next time every set is filled in from today, with a small step up where you earned it. Beat it and you will see it here.</p></div>`;
  return '';
}

const barFor = ex => ex.equip === 'smith' ? (S.settings.equip.smithBarKg ?? S.settings.equip.barKg) : S.settings.equip.barKg;

/** Short plate list for the rest-timer bar, e.g. " · 20+5/side". Empty when it doesn't apply. */
function platesShort(ex, w) {
  if (!(ex.equip === 'barbell' || ex.equip === 'smith') || !(+w > 0)) return '';
  const p = platesPerSide(+w, barFor(ex), S.settings.equip.plates);
  return p.ok ? ` · ${p.plates.length ? p.plates.join('+') + '/side' : 'empty bar'}` : '';
}

function summary(d) {
  let vol = 0, v = 0, lv = 0, done = 0, tot = 0, reps = 0, anyKg = false; // vol: this workout; v/lv: like-for-like with last time
  const prs = [];
  // Next-time targets come from the same engine as the Today screen, with this workout counted as the latest log.
  const asSess = { id: d.id, date: d.date, gymId: d.gymId, end: Date.now(), entries: d.entries.map(e => ({ exId: e.exId, slot: e.slot, sets: e.sets, rir: e.rir, pain: e.pain })) };
  const nextDate = addDays(d.date, 7);
  const ctx = { sessions: [asSess, ...S.sessions], gymId: d.gymId, poor: false, deload: deloadActive(nextDate), equip: S.settings.equip, date: nextDate };
  const rows = d.entries.map(e => {
    const ex = S.exById[e.exId];
    if (!ex) return '';
    const ws = workSets(e);
    done += ws.length; tot += e.sets.filter(s => !s.warm).length;
    if (ws.length && isKg(ex.unit)) anyKg = true;
    reps += ws.reduce((a, s) => a + (+s.r || 0), 0);
    const prevExps = exposures(S.sessions, ex, { gymId: S.settings.gymId, before: d.date });
    const last = prevExps[0];
    vol += volume(ex, ws);
    if (last && ws.length && isKg(ex.unit) && last.sets.every(s => s.r != null)) {
      // Like for like: only as many sets as both sessions have, so 3 sets vs last week's 4 isn't a "drop".
      const n = Math.min(ws.length, last.sets.length);
      v += volume(ex, ws.slice(0, n)); lv += volume(ex, last.sets.slice(0, n));
    }
    if (ws.length && prevExps.length) {
      const pb = personalBests(prevExps, ex.unit);
      const bestNow = Math.max(0, ...ws.map(s => e1rm(+s.w, +s.r) || 0));
      const heavyNow = Math.max(...ws.map(s => +s.w || 0));
      if (pb.best && bestNow > pb.best.v + 1e-6) prs.push(`${ex.name}: best ${expertWording() ? 'e1RM' : 'estimated 1-rep max'}, ${num(toDisp(bestNow))} ${getUnits()}`);
      else if (pb.heavy && heavyNow > pb.heavy.w && ex.unit !== 'bw') prs.push(`${ex.name}: heaviest load, ${fmtLoad(ex, heavyNow)}${ex.unit === 'L' ? '' : ' ' + unitShort(ex.unit)}`);
    }
    const nx = nextFor(e, e.slot, ex);
    if (!ws.length || !e.slot) return `<div class="nt"><span>${esc(ex.name)}${e.pain ? ' ' + pill('pain', 'down') : ''}</span><b class="t-${nx.t}">${esc(nx.text)}</b></div>`;
    const sg = suggest(e.slot, ex, ctx), u = sg.w == null || ex.unit === 'bw' ? '' : unitShort(ex.unit);
    return `<div class="nt"><span>${esc(ex.name)} ${e.pain ? pill('pain', 'down') : chip(sg, ex)}</span><b class="num">${sg.w == null ? (ex.unit === 'bw' ? esc(T('bw')) : expertWording() ? '?' : 'Find weight') : esc(fmtLoad(ex, sg.w))}${u ? `<small> ${u}</small>` : ''} × ${sg.reps.join('·')}</b></div>`;
  }).join('');
  const pct = lv ? Math.round((v / lv - 1) * 100) : null;
  const mins = d.past ? d.minutes : Math.max(1, Math.round((Date.now() - d.start) / 60000));
  const planned = d.plannedSec ? Math.round(d.plannedSec / 60) : null;
  let h = `<div class="hero" style="--c:var(--up)"><div><h2>Nice work</h2><p>${esc(d.name)}${d.past ? ` · ${fmtDate(d.date, { dow: true })}` : ''}${mins ? ` · ${mins} min` : ''}${planned && !d.past ? ` (planned ~${planned})` : ''}</p></div></div>
    <div class="kpis"><div class="kpi"><b>${done}/${tot}</b><span>sets done</span></div>${anyKg ? `<div class="kpi"><b>${kfmt(toDisp(vol))}</b><span>${getUnits()} ${expertWording() ? 'volume' : 'lifted'}*</span></div>` : `<div class="kpi"><b>${kfmt(reps)}</b><span>total reps</span></div>`}
    <div class="kpi"><b style="color:var(--${pct == null ? 'mute' : pct >= 0 ? 'up' : 'down'})">${pct == null ? '—' : (pct >= 0 ? '+' : '') + pct + '%'}</b><span>vs last time*</span></div></div>`;
  h += earlyWins(d);
  if (prs.length) h += `<div class="box prbox"><p class="lbl">Personal bests</p>${prs.map(p => `<p>${ICON.star}${esc(p)}</p>`).join('')}</div>`;
  // XP earned by this workout, and any level-ups it causes
  const before = muscleXP(S.sessions, S.exById, d.date);
  const after = muscleXP([...S.sessions, { id: d.id, date: d.date, name: d.name, end: Date.now(), entries: d.entries }], S.exById, d.date);
  const gains = Object.entries(after.muscles).map(([m, r]) => ({ m, g: r.xp - (before.muscles[m]?.xp || 0), up: levelFor(r.xp).level > levelFor(before.muscles[m]?.xp || 0).level, L: levelFor(r.xp).level })).filter(x => x.g > 0).sort((a, b) => b.g - a.g);
  if (gains.length) h += `<a class="box prbox" href="#/levels"><p class="lbl">XP earned · +${gains.reduce((a, x) => a + x.g, 0)}</p><div class="xpgain">${gains.map(x => pill(`${x.up ? '▲ ' : ''}${x.m} +${x.g}${x.up ? ` · level ${x.L}` : ''}`, x.up ? 'push' : 'up')).join('')}</div></a>`;
  h += `<div class="box pad0"><p class="lbl in">Next time</p>${rows}</div>
    <div class="box ready"><div class="rrow"><span>How did it feel?</span><div class="seg" role="group" aria-label="Feel">${FEEL.map(([val, l]) => `<button data-act="feel" data-v="${val}" aria-pressed="${d.feel === val}" title="${l}">${val}</button>`).join('')}</div></div></div>
    <p class="fine">*${anyKg ? `${esc(T('volume'))} is weight × reps added up and counts both dumbbells. ` : ''}"vs last time" compares the same number of sets on lifts logged by weight last time; cable levels and bodyweight are left out.</p>
    <button class="btn" data-act="save" style="--c:var(--up)">Save workout</button>
    <button class="btn ghost" data-act="back-to-workout">Back to workout</button>`;
  return { title: 'Summary', sub: fmtDate(d.date, { dow: true }), color: 'up', html: h };
}

// ---- actions -------------------------------------------------------------------
const E = el => S.draft.entries[+el.dataset.e];
const commit = () => { saveDraft(); refresh(); };

function stepFor(ex) { return ex.unit === 'L' ? 1 : ex.unit === 'bw' ? 2.5 : ex.inc || 2.5; }

export const actions = {
  async 'start-day'(el) {
    const day = S.program.days.find(d => d.dow === +el.dataset.dow);
    await startWorkout(day, todayIso());
    refresh();
  },
  async 'start-empty'() {
    await startWorkout({ dow: -1, name: 'Workout', color: 'upper', slots: [] }, todayIso());
    refresh();
  },
  bump(el) {
    if (holdClick) { holdClick = false; return; } // the press-and-hold already stepped
    bumpOnce(el);
    commit();
  },
  // Typing never re-renders (that would close the phone keyboard); carried weights are patched in place.
  set(el) {
    const e = E(el), si = +el.dataset.s, s = e.sets[si], f = el.dataset.f;
    let v = el.value === '' || !Number.isFinite(+el.value) ? null : Math.max(0, +el.value);
    // A typo like 6000 instead of 60: cap it and say so, so charts and levels don't blow up.
    const max = f === 'r' ? MAX_REPS : S.exById[E(el).exId]?.unit === 'L' ? 100 : +toDisp(MAX_KG);
    if (v != null && v > max) { v = null; el.value = ''; toast(f === 'r' ? 'That many reps looks like a typo. Please check it.' : 'That weight looks like a typo. Please check it.', 'flat'); }
    if (v != null && String(v) !== el.value) el.value = f === 'r' ? Math.round(v) : v;
    if (f === 'w') {
      const ex = S.exById[e.exId];
      const kg = v == null ? null : conv(ex) ? fromDisp(v) : v;
      const old = s.w; s.w = kg; carry(e, si, old, kg);
      paintLater(e, ex, si);
    } else s.r = v == null ? null : Math.round(v);
    saveDraft();
  },
  done(el) {
    const e = E(el), si = +el.dataset.s, s = e.sets[si], ex = S.exById[e.exId];
    if (!s.done) {
      if (ex.unit !== 'bw' && !(s.w > 0)) { toast('Enter the weight first', 'flat'); return focusField('w', e, si); }
      if (!(s.r > 0)) { toast('Enter the reps first', 'flat'); return focusField('r', e, si); }
    }
    s.done = !s.done;
    if (s.done) s.at = Date.now(); else delete s.at;
    if (s.done) {
      // Fill only empty later weights; weights typed on purpose (back-off sets) are kept.
      if (!s.warm) for (const n of e.sets.slice(si + 1)) if (!n.done && !n.warm && (n.w == null || n.w === '')) n.w = s.w;
      openDone.clear(); // moving on re-folds any finished card you peeked at
      restAfter(e, ex, s);
    }
    commit();
    if (s.done) showNext(e);
  },
  why(el) { const u = el.dataset.uid; openWhy.has(u) ? openWhy.delete(u) : openWhy.add(u); refresh(); },
  unfold(el) { openDone.add(el.dataset.uid); refresh(); },
  rir(el) { const e = E(el); e.rir = e.rir === el.dataset.v ? null : el.dataset.v; commit(); },
  pain(el) {
    const e = E(el); e.pain = !e.pain;
    if (e.pain) toast('Pain flagged. Next time this lift holds its load.', 'down');
    commit();
  },
  'add-set'(el) {
    const e = E(el);
    const l = [...e.sets].reverse().find(s => !s.warm) || e.sets[e.sets.length - 1];
    e.sets.push({ w: l ? l.w : null, r: l ? l.r : null, done: false });
    commit();
  },
  menu(el) {
    const ei = +el.dataset.e, e = S.draft.entries[ei], ex = S.exById[e.exId];
    const hasWarm = e.sets.some(s => s.warm);
    openSheet(`<h2 class="sh-title">${esc(ex.name)}</h2><div class="list">
      <button class="li" data-act="warm" data-e="${ei}"><span><b>${hasWarm ? 'Remove warm-up sets' : 'Add warm-up sets'}</b>${hasWarm ? '' : '<small>Ramp up to your first working set</small>'}</span></button>
      <button class="li" data-act="swap" data-e="${ei}"><span><b>Swap exercise</b><small>Machine taken? Keeps the set count and rep range</small></span></button>
      ${pairItem(ei)}
      <button class="li" data-act="note" data-e="${ei}"><span><b>${e.note ? 'Edit note' : 'Add note'}</b><small>Grip, seat setting, how it felt</small></span></button>
      <button class="li" data-act="del-set" data-e="${ei}"><span><b>Remove last set</b></span></button>
      <button class="li" data-act="move" data-e="${ei}" data-d="-1" ${ei === 0 ? 'disabled' : ''}><span><b>Move up</b></span></button>
      <button class="li" data-act="move" data-e="${ei}" data-d="1" ${ei === S.draft.entries.length - 1 ? 'disabled' : ''}><span><b>Move down</b></span></button>
      <button class="li danger" data-act="remove" data-e="${ei}"><span><b>Remove from workout</b></span></button></div>`, { label: ex.name });
  },
  warm(el) {
    const e = E(el), ex = S.exById[e.exId];
    closeSheet();
    if (e.sets.some(s => s.warm)) { e.sets = e.sets.filter(s => !s.warm); return commit(); }
    const w = +(e.sets.find(s => !s.warm)?.w);
    const ws = warmup(w, ex, S.settings.equip);
    if (!ws.length) return toast(isKg(ex.unit) ? 'Set a working weight first' : 'Warm-ups only work for kg loads', 'flat');
    e.sets.unshift(...ws);
    commit();
  },
  swap(el) { closeSheet(); pickExercise(+el.dataset.e); },
  'add-ex'() { pickExercise(null); },
  async pick(el) {
    const id = el.dataset.id, ei = el.dataset.e === '' ? null : +el.dataset.e;
    closeSheet();
    if (ei == null) S.draft.entries.push(newEntry(id));
    else {
      const old = S.draft.entries[ei];
      const ticked = old.sets.filter(s => s.done).length;
      if (ticked && !(await confirmSheet({ title: `Swap and drop ${ticked} ticked set${ticked > 1 ? 's' : ''}?`, body: `Sets already done on ${esc(S.exById[old.exId].name)} will be discarded. To keep them, add ${esc(S.exById[id].name)} as a new exercise instead.`, ok: 'Swap anyway', danger: true }))) return;
      // Keep the set count and superset slot; take the rep range from the programme when the new lift is in it.
      const planned = S.program.days.flatMap(d => d.slots).find(s => s.exId === id);
      S.draft.entries[ei] = newEntry(id, planned ? { ...old.slot, lo: planned.lo, hi: planned.hi } : old.slot);
      toast(`Swapped to ${S.exById[id].name}`);
    }
    commit();
  },
  'past-min'(el) { const v = parseInt(el.value, 10); S.draft.minutes = v > 0 && v <= 300 ? v : null; if (el.value && S.draft.minutes == null) el.value = ''; saveDraft(); },
  'quick-new'(el) {
    const name = (document.getElementById('exsearch')?.value || '').trim();
    qn = { name, unit: guessUnit(name), muscle: guessMuscles(name)[0] || '', ei: el.dataset.e === '' ? null : +el.dataset.e };
    closeSheet();
    paintQuick();
  },
  'qn-unit'(el) { qnName(); qn.unit = el.dataset.v; paintQuick(); },
  'qn-muscle'(el) { qnName(); qn.muscle = el.dataset.v; paintQuick(); },
  'qn-full'() { closeSheet(); go('exercise/new'); },
  async 'qn-save'() {
    qnName();
    if (!qn.name) return toast('Give the exercise a name', 'flat');
    if (!qn.muscle) return toast('Pick the main muscle it trains', 'flat');
    // An exercise with the same name already exists: use it rather than making a duplicate.
    let ex = S.exercises.find(x => x.name.toLowerCase() === qn.name.toLowerCase());
    if (!ex) {
      const u = qn.unit;
      ex = {
        id: qn.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6),
        name: qn.name, unit: u, equip: u === 'bw' ? 'bw' : u === 'kg/DB' ? 'db' : u === 'L' ? 'cable' : 'machine',
        inc: u === 'L' ? 1 : u === 'kg/DB' ? 2 : 2.5, rest: 90, muscles: [qn.muscle], perGym: u === 'L' || u === 'kg',
      };
      await saveExercise(ex);
    }
    closeSheet();
    const target = { dataset: { id: ex.id, e: qn.ei == null ? '' : String(qn.ei) } };
    qn = null;
    await actions.pick(target);
    toast(`${ex.name} added`, 'up');
  },
  note(el) {
    const ei = +el.dataset.e, e = S.draft.entries[ei];
    closeSheet();
    openSheet(`<h2 class="sh-title">Note</h2><textarea class="inp" id="enote" rows="3" autofocus>${esc(e.note || '')}</textarea><button class="btn" data-act="note-save" data-e="${ei}">Save note</button>`, { label: 'Exercise note' });
  },
  'note-save'(el) { E(el).note = document.getElementById('enote').value.trim(); closeSheet(); commit(); },
  'del-set'(el) {
    const e = E(el); closeSheet();
    if (e.sets.length <= 1) return toast('Keep at least one set, or remove the exercise', 'flat');
    const gone = e.sets.pop(); commit();
    toast('Last set removed', 'ink', { undo: () => { e.sets.push(gone); commit(); } });
  },
  move(el) {
    const i = +el.dataset.e, j = i + +el.dataset.d, a = S.draft.entries;
    closeSheet();
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; commit();
  },
  remove(el) {
    const i = +el.dataset.e; closeSheet();
    const [e] = S.draft.entries.splice(i, 1); commit();
    toast(`${S.exById[e.exId]?.name || 'Exercise'} removed`, 'ink', { undo: () => { S.draft?.entries.splice(i, 0, e); commit(); } });
  },
  pair(el) {
    const i = +el.dataset.e, es = S.draft.entries, a = es[i], b = es[i + 1];
    closeSheet();
    if (!b) return;
    const used = new Set(es.map(x => x.slot?.group).filter(Boolean));
    const g = a.slot?.group || b.slot?.group || 'ABCDEFGH'.split('').find(x => !used.has(x)) || 'Z';
    for (const x of [a, b]) x.slot = { ...(x.slot || { exId: x.exId, sets: x.sets.filter(s => !s.warm).length, lo: 8, hi: 12 }), group: g };
    commit();
    toast(`${S.exById[a.exId].name} and ${S.exById[b.exId].name} paired: rest after both`, 'upper');
  },
  unpair(el) {
    const e = E(el), g = e.slot?.group;
    closeSheet();
    if (!g) return;
    const same = S.draft.entries.filter(x => x.slot?.group === g);
    for (const x of same.length <= 2 ? same : [e]) x.slot = { ...x.slot, group: '' };
    commit();
  },
  'start-w'(el) {
    const e = E(el), ex = S.exById[e.exId];
    const w = startGuess(ex, +el.dataset.v);
    for (const s of e.sets) if (!s.done && !s.warm) s.w = w;
    commit();
    toast(`Starting at ${fmtLoad(ex, w)}${unitShort(ex.unit) ? ' ' + unitShort(ex.unit) : ''}. Adjust with − and + if it feels off.`, 'up');
  },
  'coach-ok': () => saveSettings({ coachDone: true }),
  'add-cardio'() { cardioSheet(); },
  'cw-type'(el) { cw.type = el.dataset.v; cardioSheet(); },
  'cw-int'(el) { cw.intensity = el.dataset.v; cardioSheet(); },
  'cw-save'() {
    const min = parseInt(document.getElementById('cw-min')?.value, 10);
    const km = parseFloat(document.getElementById('cw-km')?.value);
    if (!(min > 0 && min <= 600)) return toast('Enter minutes between 1 and 600', 'flat');
    (S.draft.cardio ||= []).push({ type: cw.type, min, intensity: cw.intensity, ...(km > 0 && km < 500 ? { km } : {}) });
    closeSheet(); commit();
  },
  'cardio-rm'(el) {
    const i = +el.dataset.i, [c] = S.draft.cardio.splice(i, 1); commit();
    toast(`${c.type} removed`, 'ink', { undo: () => { S.draft?.cardio.splice(i, 0, c); commit(); } });
  },
  feel(el) { S.draft.feel = S.draft.feel === +el.dataset.v ? null : +el.dataset.v; commit(); },
  hr(el) {
    const v = parseInt(el.value, 10);
    S.draft.hr = v > 30 && v < 250 ? v : null;
    if (el.value !== '' && S.draft.hr == null) { el.value = ''; toast('Heart rate should be between 30 and 250 bpm', 'flat'); }
    saveDraft();
  },
  snote(el) { S.draft.note = el.value; saveDraft(); },
  async finish() {
    const done = S.draft.entries.some(e => e.sets.some(s => s.done && !s.warm));
    if (!done) return toast('Tick at least one working set before finishing', 'flat');
    S.draft.summary = true; S.draft.timer = null; commit();
    document.getElementById('screen').scrollTop = 0;
  },
  'back-to-workout'() { S.draft.summary = false; commit(); },
  async save() {
    const sess = await commitDraft();
    toast('Workout saved', 'up');
    go('session/' + sess.id);
  },
  async discard() {
    if (!(await confirmSheet({ title: 'Discard this workout?', body: 'Nothing from it will be saved.', ok: 'Discard', danger: true }))) return;
    await discardDraft(); refresh();
  },
};

function focusField(f, e, si) {
  const inp = document.getElementById(`${f}-${e.uid}-${si}`);
  if (!inp) return;
  inp.scrollIntoView({ block: 'center', behavior: 'smooth' });
  inp.focus({ preventScroll: true });
}

/** Refresh the later weight fields of an entry in place (no re-render, so the keyboard stays up). */
function paintLater(e, ex, si) {
  e.sets.forEach((x, j) => { if (j > si) { const inp = document.getElementById(`w-${e.uid}-${j}`); if (inp && document.activeElement !== inp) inp.value = shown(ex, x.w); } });
}

/** One −/+ step. Weights step in the display unit (kg: the exercise's jump; lb: the same jump in tidy lb). */
function bumpOnce(el) {
  const e = S.draft?.entries[+el.dataset.e];
  if (!e) return;
  const si = +el.dataset.s, ex = S.exById[e.exId], s = e.sets[si], dir = +el.dataset.d;
  if (!s) return;
  if (el.dataset.f === 'w') {
    const old = s.w;
    if (conv(ex) && getUnits() === 'lb') {
      const d = Math.max(0, (+toDisp(s.w) || 0) + stepDisp(stepFor(ex)) * dir);
      s.w = fromDisp(d);
    } else s.w = Math.max(0, +((+s.w || 0) + stepFor(ex) * dir).toFixed(2));
    carry(e, si, old, s.w);
    const inp = document.getElementById(`w-${e.uid}-${si}`);
    if (inp) inp.value = shown(ex, s.w);
    paintLater(e, ex, si);
  } else {
    s.r = Math.max(0, (+s.r || 0) + dir);
    const inp = document.getElementById(`r-${e.uid}-${si}`);
    if (inp) inp.value = s.r;
  }
}

// Press and hold −/+ to keep stepping: after a short pause it repeats, speeding up; one save at the end.
let hold = null, holdClick = false;
function endHold() {
  if (!hold) return;
  clearTimeout(hold.t);
  const fired = hold.fired;
  hold = null;
  if (fired) {
    holdClick = true; // swallow the click that follows the release
    setTimeout(() => { holdClick = false; }, 450);
    commit();
  }
}
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', ev => {
    const b = ev.target.closest?.('[data-act="bump"]');
    if (!b || !S.draft || (ev.button != null && ev.button !== 0)) return;
    endHold();
    const h = { b, fired: false, n: 0 };
    const tick = () => {
      if (hold !== h) return;
      h.fired = true; h.n++;
      bumpOnce(b);
      h.t = setTimeout(tick, h.n > 8 ? 60 : 120);
    };
    h.t = setTimeout(tick, 420);
    hold = h;
  });
  for (const t of ['pointerup', 'pointercancel']) document.addEventListener(t, endHold);
  document.addEventListener('contextmenu', ev => { if (ev.target.closest?.('[data-act="bump"]')) ev.preventDefault(); });
}

function carry(e, si, old, now) {
  const s = e.sets[si];
  for (const n of e.sets.slice(si + 1)) if (!n.done && !!n.warm === !!s.warm && (n.w === old || n.w == null)) n.w = now;
}

function restAfter(e, ex, s) {
  if (S.draft.past) return; // no rest timer when logging a past day
  const nx = nextUp(e);
  const nex = nx && S.exById[nx.e.exId];
  const ns = nx?.e.sets[nx.si];
  // The timer bar says what's coming, so the lifter can load the bar while resting.
  const label = !nx ? 'Last set done. Finish when ready.'
    : `Next: ${nx.e === e ? (ns.warm ? 'warm-up' : `set ${nx.e.sets.slice(0, nx.si + 1).filter(x => !x.warm).length}`) : nex.name} · ${ns.w == null || ns.w === '' ? '?' : fmtLoad(nex, ns.w) + (unitShort(nex.unit) ? ' ' + unitShort(nex.unit) : '')} × ${ns.r ?? '?'}${platesShort(nex, ns.w)}`;
  if (s.warm) return startTimer(45, label);
  const g = e.slot?.group;
  if (g) {
    const same = S.draft.entries.filter(x => x.slot?.group === g);
    // Straight on to the partner, no rest, while the round isn't finished.
    if (same.length > 1 && nx && nx.e !== e && same.indexOf(nx.e) > same.indexOf(e)) {
      toast(`Superset: now ${nex.name}`, 'upper');
      return;
    }
    if (same.length > 1) return startTimer(Math.max(...same.map(x => S.exById[x.exId]?.rest || 60)), label);
  }
  startTimer(ex.rest || 90, label);
}

/** After a tick, bring the next set into view if it's off screen. */
function showNext(e) {
  const nx = nextUp(e);
  if (!nx) return;
  const row = document.getElementById(`w-${nx.e.uid}-${nx.si}`)?.closest('.set');
  const sc = document.getElementById('screen');
  if (!row || !sc) return;
  const r = row.getBoundingClientRect(), v = sc.getBoundingClientRect();
  const timerH = document.getElementById('timer')?.offsetHeight || 0;
  if (r.top < v.top + 60 || r.bottom > v.bottom - timerH - 12) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function pickExercise(ei) {
  const cur = ei == null ? null : S.exById[S.draft.entries[ei].exId];
  const m = cur?.muscles?.[0];
  const inW = new Set(S.draft.entries.map(e => e.exId));
  // Same-muscle alternatives first; exercises already in today's workout sink to the bottom.
  const list = [...S.exercises].sort((a, b) => (inW.has(a.id) - inW.has(b.id)) || ((b.muscles?.[0] === m) - (a.muscles?.[0] === m)) || a.name.localeCompare(b.name));
  const sheet = openSheet(`<h2 class="sh-title">${cur ? `Swap ${esc(cur.name)}` : 'Add exercise'}</h2>
    <input class="inp" id="exsearch" type="search" placeholder="Search exercises" autocomplete="off">
    <p class="fine" id="exnone" hidden>No exercise matches. Create it below.</p>
    <div class="list scroll" id="exlist">${list.filter(x => x.id !== cur?.id).map(x => `<button class="li" data-act="pick" data-id="${esc(x.id)}" data-e="${ei ?? ''}" data-name="${esc(x.name.toLowerCase())}"><span><b>${esc(x.name)}</b><small>${esc((x.muscles || []).join(', '))} · ${unitLong(x.unit)}</small></span>${inW.has(x.id) ? pill('in workout') : x.muscles?.[0] === m && m ? pill('same muscle', 'up') : ''}</button>`).join('')}</div>
    <button class="btn ghost" data-act="quick-new" data-e="${ei ?? ''}">${ICON.plus} <span id="qn-label">Create a new exercise</span></button>`, { label: 'Pick exercise' });
  sheet.querySelector('#exsearch').addEventListener('input', ev => {
    const raw = ev.target.value.trim(), q = raw.toLowerCase();
    let shown = 0;
    for (const b of sheet.querySelectorAll('#exlist .li')) { b.hidden = !!q && !b.dataset.name.includes(q); if (!b.hidden) shown++; }
    sheet.querySelector('#exnone').hidden = shown > 0;
    sheet.querySelector('#qn-label').textContent = raw ? `Create "${raw.slice(0, 40)}"` : 'Create a new exercise';
  });
}

// ---- quick create: a new exercise straight into the workout ------------------------------
const QN_UNITS = [['kg/DB', 'kg per dumbbell'], ['kg', 'kg total'], ['L', 'Machine level'], ['bw', 'Bodyweight']];
let qn = null; // {name, unit, muscle, ei}
function guessUnit(name) {
  const n = name.toLowerCase();
  if (/\b(db|dumbbells?|dumbbel)\b/.test(n)) return 'kg/DB';
  if (/\b(cable|rope|pec deck)\b/.test(n)) return 'L';
  if (/\b(push.?ups?|pull.?ups?|chin.?ups?|dips?|bodyweight|bw|hanging)\b/.test(n)) return 'bw';
  return 'kg';
}
function paintQuick() {
  openSheet(`<h2 class="sh-title">New exercise</h2>
    <label class="field"><span>Name</span><input class="inp" id="qn-name" value="${esc(qn.name)}" maxlength="60" placeholder="e.g. Hack squat" ${qn.name ? '' : 'autofocus'}></label>
    <div class="field"><span>Load is logged as</span><div class="chips" role="group" aria-label="Unit">${QN_UNITS.map(([v, l]) => `<button class="mini" data-act="qn-unit" data-v="${v}" aria-pressed="${qn.unit === v}">${l}</button>`).join('')}</div></div>
    <div class="field"><span>Main muscle</span><div class="chips" role="group" aria-label="Main muscle">${MUSCLES.map(m => `<button class="mini" data-act="qn-muscle" data-v="${m}" aria-pressed="${qn.muscle === m}">${m}</button>`).join('')}</div></div>
    <p class="fine">${expertWording() ? 'It starts with a calibration set' : 'First time, you find a weight that suits you'}, then it progresses like any other lift. Helper muscles, rest time and more can be set later under More → Exercises.</p>
    <div class="row2"><button class="btn ghost" data-act="qn-full">More options</button><button class="btn" data-act="qn-save" style="--c:var(--up)">Add to workout</button></div>`, { label: 'New exercise' });
}
const qnName = () => { const el = document.getElementById('qn-name'); if (el) qn.name = el.value.trim(); };
