import { S, saveDraft, refresh, commitDraft, discardDraft, newEntry, startWorkout, todayIso, uid, deloadActive, saveExercise } from '../state.js';
import { guessMuscles } from '../io.js';
import { fmtLoad, unitShort, unitLong, nextFor, volume, warmup, platesPerSide, nearestDumbbell, exposures, personalBests, e1rm, isKg, workSets, topLoad, muscleXP, levelFor, estimateRemaining, suggest, addDays, MUSCLES } from '../engine.js';
import { esc, fmtDate, chip, pill, ICON, openSheet, closeSheet, confirmSheet, toast, cvar, num, kfmt } from '../ui.js';
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

/** A finished exercise folds to one line once you've moved on (ticked something else) or logged its RIR. */
function folded(e) {
  if (openDone.has(e.uid) || !e.sets.length || e.sets.some(s => !s.done)) return false;
  return e.rir != null || S.draft.entries.some(o => o !== e && lastAt(o) > lastAt(e));
}

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
  if (d.deload) h += `<div class="warn" style="--k:var(--legs)"><b>Deload.</b><span>Fewer sets, lighter loads, 3–4 reps in reserve.</span></div>`;
  else if (d.readiness?.sleep === '<6' || d.readiness?.pain) h += `<div class="warn"><b>Hold day.</b><span>Loads held at last session's numbers. Stop 2–3 reps short of failure.</span></div>`;

  const groups = groupLabels(d.entries.map(e => e.slot || {}));
  const focus = focusSet();
  d.entries.forEach((e, ei) => { h += card(e, ei, groups[ei], focus?.e === e ? focus.si : -1); });
  if (!d.entries.length) h += `<div class="empty"><b>No exercises yet.</b><p>Add the first one below.</p></div>`;

  h += `<button class="btn ghost" data-act="add-ex">${ICON.plus} Add exercise</button>`;
  h += `<section class="box notesbox"><p class="lbl">Session notes</p>
    <div class="rrow"><span>How did it feel?</span><div class="seg" role="group" aria-label="Feel">${FEEL.map(([v, l]) => `<button data-act="feel" data-v="${v}" aria-pressed="${d.feel === v}" title="${l}">${v}</button>`).join('')}</div></div>
    <div class="rrow"><label for="hr">Peak heart rate</label><input class="inp sm" id="hr" type="number" inputmode="numeric" placeholder="bpm" value="${d.hr ?? ''}" data-input="hr"></div>
    <textarea class="inp" id="snote" rows="2" placeholder="Anything worth remembering: sleep, energy, technique" data-input="snote">${esc(d.note || '')}</textarea></section>`;
  h += `<button class="btn" data-act="finish" style="--c:var(--up)">Finish workout</button>
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
  h += days.map(d => `<button class="li" data-act="start-day" data-dow="${d.dow}" style="--k:${cvar(d.color)}"><i class="sw"></i><span><b>${esc(d.name)}</b><small>${esc(d.sub || '')} · ${d.slots.length} exercises</small></span>${ICON.chev}</button>`).join('');
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
      <span class="ok">${ICON.check}</span><span class="grow"><b>${g}${esc(ex.name)}</b><small>${esc(ws.length ? setsText(ex, ws) : 'No work sets')}${e.rir != null ? ` · RIR ${esc(e.rir)}` : ''}</small></span>${e.pain ? pill('pain', 'down') : ''}${ICON.chev}</button></article>`;
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
      <div class="step"><button data-act="bump" data-e="${ei}" data-s="${si}" data-f="w" data-d="-1" aria-label="${who}: less weight">−</button><input id="w-${e.uid}-${si}" data-input="set" data-e="${ei}" data-s="${si}" data-f="w" type="number" inputmode="decimal" step="any" value="${bw && !+s.w ? '' : s.w ?? ''}" placeholder="${bw ? 'BW' : ex.unit === 'L' ? 'lvl' : 'kg'}" aria-label="${who}: ${bw ? 'added weight' : 'weight'}"><button data-act="bump" data-e="${ei}" data-s="${si}" data-f="w" data-d="1" aria-label="${who}: more weight">+</button></div>
      <div class="step"><button data-act="bump" data-e="${ei}" data-s="${si}" data-f="r" data-d="-1" aria-label="${who}: one rep fewer">−</button><input id="r-${e.uid}-${si}" data-input="set" data-e="${ei}" data-s="${si}" data-f="r" type="number" inputmode="numeric" value="${s.r ?? ''}" placeholder="reps" aria-label="${who}: reps"><button data-act="bump" data-e="${ei}" data-s="${si}" data-f="r" data-d="1" aria-label="${who}: one rep more">+</button></div>
      <button class="check" data-act="done" data-e="${ei}" data-s="${si}" aria-label="${who} done" aria-pressed="${!!s.done}">${ICON.check}</button></div>`;
  }).join('');
  const whyOpen = openWhy.has(e.uid);
  // The suggestion chip doubles as the "why" toggle, so the reason costs no space until asked for.
  const tag = e.sg?.why ? `<button class="whybtn" data-act="why" data-uid="${e.uid}" aria-expanded="${whyOpen}" aria-label="Why this target">${chip(e.sg, ex)}<i aria-hidden="true">?</i></button>` : chip(e.sg, ex);
  return `<article class="box exc" id="ex-${e.uid}">
    <header><div><h3>${g}<a href="#/ex/${esc(ex.id)}">${esc(ex.name)}</a></h3>
      <p>${slot ? `${e.sg?.reps?.length || slot.sets}×${slot.lo}–${slot.hi} · ` : ''}${esc(lastTxt)}</p></div>
      <span class="hdr-r">${tag}<button class="iconbtn sm" data-act="menu" data-e="${ei}" aria-label="Options for ${esc(ex.name)}">${ICON.dots}</button></span></header>
    ${whyOpen ? `<p class="whyp">${esc(e.sg.why)} Target ${esc(e.sg.rir)} RIR.</p>` : ''}
    ${helper(e, ex)}
    <div class="sets">${rows}</div>
    ${e.note ? `<p class="enote">${esc(e.note)}</p>` : ''}
    <div class="exf"><div class="seg sm" role="group" aria-label="Reps left in the tank on the last set">${['0', '1', '2', '3+'].map(v => `<button data-act="rir" data-e="${ei}" data-v="${v}" aria-pressed="${e.rir === v}">${v}</button>`).join('')}</div><span class="fine grow">RIR last set</span>
      <button class="mini" data-act="add-set" data-e="${ei}">+ Set</button><button class="mini" data-act="pain" data-e="${ei}" aria-pressed="${!!e.pain}">Pain</button></div>
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
    if (!p.ok) return `<p class="helper">${w < bar ? `Below the ${bar} kg bar.` : `Can't make ${w} kg exactly with your plates (${num(p.rem, 2)} kg/side short).`}</p>`;
    return `<p class="helper">${w} kg: <b>${p.plates.length ? p.plates.join(' + ') : 'empty bar'}</b>${p.plates.length ? ' per side' : ''} on the ${bar} kg bar</p>`;
  }
  if (ex.unit === 'kg/DB' && eq.dumbbells?.length && !eq.dumbbells.includes(w)) {
    return `<p class="helper">No ${w} kg dumbbell in your list. Nearest: <b>${nearestDumbbell(w, eq.dumbbells)} kg</b></p>`;
  }
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
  let vol = 0, v = 0, lv = 0, done = 0, tot = 0; // vol: this workout; v/lv: like-for-like with last time
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
      if (pb.best && bestNow > pb.best.v + 1e-6) prs.push(`${ex.name}: best estimated max, ${num(bestNow)} kg`);
      else if (pb.heavy && heavyNow > pb.heavy.w && ex.unit !== 'bw') prs.push(`${ex.name}: heaviest load, ${fmtLoad(ex, heavyNow)}${ex.unit === 'L' ? '' : ' ' + unitShort(ex.unit)}`);
    }
    const nx = nextFor(e, e.slot, ex);
    if (!ws.length || !e.slot) return `<div class="nt"><span>${esc(ex.name)}${e.pain ? ' ' + pill('pain', 'down') : ''}</span><b class="t-${nx.t}">${esc(nx.text)}</b></div>`;
    const sg = suggest(e.slot, ex, ctx), u = sg.w == null || ex.unit === 'bw' ? '' : unitShort(ex.unit);
    return `<div class="nt"><span>${esc(ex.name)} ${e.pain ? pill('pain', 'down') : chip(sg, ex)}</span><b class="num">${sg.w == null ? (ex.unit === 'bw' ? 'BW' : '?') : esc(fmtLoad(ex, sg.w))}${u ? `<small> ${u}</small>` : ''} × ${sg.reps.join('·')}</b></div>`;
  }).join('');
  const pct = lv ? Math.round((v / lv - 1) * 100) : null;
  const mins = d.past ? d.minutes : Math.max(1, Math.round((Date.now() - d.start) / 60000));
  const planned = d.plannedSec ? Math.round(d.plannedSec / 60) : null;
  let h = `<div class="hero" style="--c:var(--up)"><div><h2>Nice work</h2><p>${esc(d.name)}${d.past ? ` · ${fmtDate(d.date, { dow: true })}` : ''}${mins ? ` · ${mins} min` : ''}${planned && !d.past ? ` (planned ~${planned})` : ''}</p></div></div>
    <div class="kpis"><div class="kpi"><b>${done}/${tot}</b><span>sets done</span></div><div class="kpi"><b>${kfmt(vol)}</b><span>kg volume*</span></div>
    <div class="kpi"><b style="color:var(--${pct == null ? 'mute' : pct >= 0 ? 'up' : 'down'})">${pct == null ? '—' : (pct >= 0 ? '+' : '') + pct + '%'}</b><span>vs last time*</span></div></div>`;
  if (prs.length) h += `<div class="box prbox"><p class="lbl">Personal bests</p>${prs.map(p => `<p>★ ${esc(p)}</p>`).join('')}</div>`;
  // XP earned by this workout, and any level-ups it causes
  const before = muscleXP(S.sessions, S.exById, d.date);
  const after = muscleXP([...S.sessions, { id: d.id, date: d.date, name: d.name, end: Date.now(), entries: d.entries }], S.exById, d.date);
  const gains = Object.entries(after.muscles).map(([m, r]) => ({ m, g: r.xp - (before.muscles[m]?.xp || 0), up: levelFor(r.xp).level > levelFor(before.muscles[m]?.xp || 0).level, L: levelFor(r.xp).level })).filter(x => x.g > 0).sort((a, b) => b.g - a.g);
  if (gains.length) h += `<a class="box prbox" href="#/levels"><p class="lbl">XP earned · +${gains.reduce((a, x) => a + x.g, 0)}</p><div class="xpgain">${gains.map(x => pill(`${x.up ? '▲ ' : ''}${x.m} +${x.g}${x.up ? ` · level ${x.L}` : ''}`, x.up ? 'push' : 'up')).join('')}</div></a>`;
  h += `<div class="box pad0"><p class="lbl in">Next time</p>${rows}</div>
    <div class="box ready"><div class="rrow"><span>How did it feel?</span><div class="seg" role="group" aria-label="Feel">${FEEL.map(([val, l]) => `<button data-act="feel" data-v="${val}" aria-pressed="${d.feel === val}" title="${l}">${val}</button>`).join('')}</div></div></div>
    <p class="fine">*Volume counts both dumbbells. "vs last time" compares the same number of sets on lifts logged in kg last time; cable levels and bodyweight are left out.</p>
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
    const e = E(el), ex = S.exById[e.exId], s = e.sets[+el.dataset.s], dir = +el.dataset.d;
    if (el.dataset.f === 'w') {
      const old = s.w;
      s.w = Math.max(0, +((+s.w || 0) + stepFor(ex) * dir).toFixed(2));
      carry(e, +el.dataset.s, old, s.w);
    } else s.r = Math.max(0, (+s.r || 0) + dir);
    commit();
  },
  // Typing never re-renders (that would close the phone keyboard); carried weights are patched in place.
  set(el) {
    const e = E(el), si = +el.dataset.s, s = e.sets[si], f = el.dataset.f;
    const v = el.value === '' || !Number.isFinite(+el.value) ? null : Math.max(0, +el.value);
    if (v != null && String(v) !== el.value) el.value = f === 'r' ? Math.round(v) : v;
    if (f === 'w') {
      const old = s.w; s.w = v; carry(e, si, old, v);
      e.sets.forEach((x, j) => { if (j > si) { const inp = document.getElementById(`w-${e.uid}-${j}`); if (inp && document.activeElement !== inp) inp.value = x.w ?? ''; } });
    } else s.r = v == null ? null : Math.round(v);
    saveDraft();
  },
  done(el) {
    const e = E(el), si = +el.dataset.s, s = e.sets[si], ex = S.exById[e.exId];
    if (!s.done) {
      if (ex.unit !== 'bw' && !(s.w > 0)) return toast('Enter the weight first', 'flat');
      if (!(s.r > 0)) return toast('Enter the reps first', 'flat');
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
    e.sets.pop(); commit();
  },
  move(el) {
    const i = +el.dataset.e, j = i + +el.dataset.d, a = S.draft.entries;
    closeSheet();
    if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]]; commit();
  },
  async remove(el) {
    const i = +el.dataset.e; closeSheet();
    const e = S.draft.entries[i];
    if (e.sets.some(s => s.done) && !(await confirmSheet({ title: 'Remove this exercise?', body: 'Its ticked sets will be lost.', ok: 'Remove', danger: true }))) return;
    S.draft.entries.splice(i, 1); commit();
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
    <p class="fine">It starts with a calibration set, then progresses like any other lift. Helper muscles, rest time and more can be set later under More → Exercises.</p>
    <div class="row2"><button class="btn ghost" data-act="qn-full">More options</button><button class="btn" data-act="qn-save" style="--c:var(--up)">Add to workout</button></div>`, { label: 'New exercise' });
}
const qnName = () => { const el = document.getElementById('qn-name'); if (el) qn.name = el.value.trim(); };
