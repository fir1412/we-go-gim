import { loadMeta } from '../set-units.js';
import { S, load, saveSettings, saveProgram, withUniqueDays, MAX_TEMPLATES, saveExercise, deleteExercise, exportAll, importAll, validateBackup, resetAll, removeSeedData, todayIso, uid, refresh, cleanPauses, SESSION_CAP } from '../state.js';
import * as db from '../db.js';
import { MUSCLES, isKg, unitsFor, unitLong, exposures, toDisp, fromDisp, getUnits, estimateDay, MAX_KG, MAX_REPS, cleanText } from '../engine.js';
import { esc, pill, ICON, toast, confirmSheet, openSheet, closeSheet, cvar, kstyle, COLORS, dowName, fmtDate, MONTHS, T, helpTip, isHex, hexOf, langPicker, isIOS, standalone } from '../ui.js';
import { LANGS, getLang, syncRawNames } from '../i18n.js';
import { trainingIcs, googleCalendarUrl } from '../calendar.js';
import { reminderText } from '../reminders.js';
import { displayText } from '../plain.js';
import { toCSV, sessionsFromCSV, parseLogText, pdfToText, download, shareFile, readFile, matchExercise, routeFile, decodeBytes, importFile, guessMuscles, guessNewExercise, EQUIP_UNIT, sessionNameFromFile, dedupeSessions, nameKey, nameOverlap, importExtras, loadForeignNames } from '../io.js';
import { searchText, CARDIO_WORDS } from '../seed.js';
import { filterList } from '../search.js';
import { learnProgress } from '../learn.js';
import { PALETTES, okMine, paletteFor, fitSurface } from '../palette.js';
import { go, showTour, APP_VERSION, canInstall, promptInstall, checkForUpdates } from '../app.js';
import { openFeedback } from '../feedback.js';
import { parseSplitText, weeklyVolume, moveDay, blankWeek, WEEK_ORDER } from '../split.js';

export function render(route) {
  syncRawNames(S);
  switch (route.name) {
    case 'program': return program(route.args);
    case 'paste': return pasteSplit();
    case 'exercises': return exercises();
    case 'exercise': return exerciseEdit(route.args[0]);
    case 'gyms': return gyms();
    case 'equip': return equip();
    case 'data': return data();
    case 'import': return importer();
    case 'settings': return settings();
    case 'help': return help();
    default: return home();
  }
}

const daysAgo = iso => Math.round((Date.parse(todayIso()) - Date.parse(iso)) / 864e5);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const agoTxt = iso => { const n = daysAgo(iso); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };

// ---- home -----------------------------------------------------------------------------

function home() {
  const row = (href, icon, title, sub, k) => `<a class="li mrow" href="#/${href}" style="--k:var(--${k})"><i class="mic">${icon}</i><span><b>${title}</b><small>${sub}</small></span>${ICON.chev}</a>`;
  const st = S.settings;
  const gym = st.gyms.find(g => g.id === st.gymId);
  const nDays = S.program.days.filter(d => d.slots.length).length;
  const own = S.sessions.filter(s => !s.seed).length;
  const lb = st.lastBackup;
  const backupSub = lb ? `Last backup ${agoTxt(lb)}` : own ? '<span class="due">No backup yet</span>' : 'Share to Drive, restore, CSV';
  let h = '';
  // Getting started: three steps that matter most on day one. Disappears once done or hidden.
  if (!st.hideSetup) {
    const steps = [
      ['program', 'Check your weekly split', !!st.progChecked],
      ['import', 'Import your old logs', S.sessions.some(s => s.imported)],
      ['data', 'Save a first backup', !!lb],
    ];
    if (steps.some(s => !s[2])) {
      h += `<section class="box pad setup"><div class="rrow"><p class="lbl">Get set up · ${steps.filter(s => s[2]).length} of 3</p><button class="linkbtn" data-act="setup-hide">Hide</button></div>
        ${steps.map(([href, t, done], i) => `<a class="sstep ${done ? 'done' : ''}" href="#/${href}"><i>${done ? ICON.check : i + 1}</i><span>${t}</span>${ICON.chev}</a>`).join('')}</section>`;
    }
  }
  h += `<div class="list box">
    ${row('program', ICON.list, 'Programme', `${nDays} training days · sets and rep ranges`, 'push')}
    ${row('exercises', ICON.workout, 'Exercises', `${S.exercises.length} in your library`, 'pull')}
    ${row('atlas', ICON.levels, '3D muscle map: see every muscle', 'Tap a muscle to see the exercises that train it', 'upper')}
    ${row('gyms', ICON.pin, 'Gyms', `Training at ${esc(gym?.name || '—')}`, 'legs')}
    ${row('equip', ICON.plate, 'Equipment', 'Dumbbells, plates, bars', 'arms')}
    </div><div class="list box">
    ${row('import', ICON.upload, 'Import old logs', 'PDFs, pasted notes or CSV', 'legsb')}
    ${row('data', ICON.save, 'Backup and export', backupSub, 'upper')}
    ${row('settings', ICON.gear, 'Settings', 'Theme, kg or lb, wording, rest timer, goal', 'rest')}
    ${canInstall() ? `<button class="li mrow" data-act="install" style="--k:var(--up)"><i class="mic">${ICON.phone}</i><span><b>Install the app</b><small>Home-screen icon, full screen, works offline</small></span>${ICON.chev}</button>` : ''}
    ${row('learn', ICON.levels, 'Learn the app', `What each feature does · ${learnProgress(S.settings).n} of ${learnProgress(S.settings).total} missions`, 'push')}
    ${row('help', ICON.help, 'Help', 'How do I…? Answers to common questions', 'legs')}
    <button class="li mrow" data-act="feedback" style="--k:var(--push)"><i class="mic">${ICON.chat || ICON.more}</i><span><b>Send feedback</b><small>Report a bug or suggest an idea</small></span>${ICON.chev}</button>
    </div>
    <details class="box pad help"><summary class="lbl">How suggestions work</summary>
    <p>Each exercise keeps its load and adds a rep per set until every set reaches the top of its range, then adds the smallest step. New exercises or machines ask you to <b>${esc(T('calibrate').toLowerCase())}</b>${helpTip('calibrate')}; bad sleep or pain keeps the load the same (<b>${esc(T('hold').toLowerCase())}</b>${helpTip('hold')}); three sessions without progress are flagged as <b>${esc(T('plateau').toLowerCase())}</b>${helpTip('plateau')}.</p></details>
    <p class="fine center-t">we go gim ${APP_VERSION} · everything stays on this phone</p>`;
  return { title: 'More', sub: 'Programme, data and settings', html: h, color: 'rest' };
}

// ---- programme editor --------------------------------------------------------------------
// Edits save as you go. The week as it was when you opened the editor is kept so "Undo changes" can put it back.
// The same editor changes one of your saved templates (#/program/t/<id>) without touching the programme.
const pOrigs = new Map();
let tplId = null;
const openDays = new Set();
const DOW_ORDER = WEEK_ORDER;
const range = s => `${s.sets} × ${s.lo === s.hi ? s.lo : `${s.lo}–${s.hi}`}`;
const myTemplates = () => S.settings.templates || [];
const tplOf = id => myTemplates().find(t => t.id === id);
/** The week being edited: a template's, or the programme. */
const P = () => (tplId && tplOf(tplId)?.program) || S.program;
const sameWeek = (a, b) => JSON.stringify(a.days) === JSON.stringify(b.days);
const trainDays = p => p.days.filter(d => d.slots.length);
const tdays = p => `<p class="tdays">${trainDays(p).map(d => `<span style="${kstyle(d.color)}"><b>${dowName(d.dow)}</b> ${esc(d.name)}</span>`).join('') || '<span>No training days yet</span>'}</p>`;

function program(args = []) {
  tplId = args[0] === 't' ? args[1] || null : null;
  const tpl = tplId && tplOf(tplId);
  if (tplId && !tpl) return { title: 'Template not found', sub: 'My templates', back: 'program', html: `<div class="empty"><b>This template was deleted.</b><p><a class="btn" href="#/program">Back to Programme</a></p></div>`, color: 'push' };
  const key = tplId || '';
  if (!pOrigs.has(key)) {
    pOrigs.set(key, structuredClone(P()));
    openDays.clear();
    openDays.add(new Date(todayIso() + 'T12:00').getDay());
    if (!tpl && !S.settings.progChecked) saveSettings({ progChecked: true });
  }
  const p = P();
  // One counting rule everywhere: the main muscle counts a full set, helper muscles half.
  const wv = weeklyVolume(p, S.exById), ws = Object.fromEntries(Object.entries(wv).map(([m, v]) => [m, Math.round(v * 2) / 2]));
  let h = tpl
    ? `<div class="box pad stack"><label class="field"><span>Template name</span><input class="inp" id="t-rename" value="${esc(tpl.name)}" data-input="t-rename" maxlength="40" enterkeyhint="done"></label>
      <p class="fine">Changes save to this template only. Your programme stays as it is until you tap Use this template.</p>
      <button class="btn" data-act="t-use" data-id="${esc(tpl.id)}">Use this template</button></div>`
    : `<div class="row2"><a class="btn ghost" href="#/setup/templates">${ICON.list} Ready-made plans</a><a class="btn ghost" href="#/paste">${ICON.upload} Paste a split</a></div>`;
  h += `<p class="fine">Tap a day to edit it. Drag a day by its handle to move it up or down the week. The days in between shift along.${tpl ? '' : ' Changes save as you go and apply to future sessions; past sessions stay as they were.'}</p>
    <div class="box pad vsum"><p class="lbl">Weekly ${esc(T('sets'))} per muscle · helpers count half · green is 10 or more</p><div class="chips">${MUSCLES.filter(m => ws[m]).map(m => pill(`${m} ${ws[m]}`, ws[m] >= 10 ? 'up' : ws[m] >= 6 ? 'flat' : 'mute')).join('')}</div></div>
    <div class="pdays">`;
  for (const dow of DOW_ORDER) {
    const di = p.days.findIndex(d => d.dow === dow);
    if (di < 0) continue;
    const d = p.days[di], open = openDays.has(dow);
    const nSets = d.slots.reduce((a, s) => a + (+s.sets || 0), 0);
    h += `<section class="box pday2" data-dow="${dow}" style="${kstyle(d.color)}"><div class="pdrow">
      <button class="pdh" data-act="p-open" data-dow="${dow}" aria-expanded="${open}"><b class="dlab">${dowName(dow)}</b><span class="grow"><b>${esc(d.name)}</b><small>${d.slots.length ? `${d.slots.length === 1 ? '1 exercise' : d.slots.length + ' exercises'} · ${nSets} sets${d.sub ? ' · ' + esc(d.sub) : ''}` : esc(d.sub || 'Rest day')}</small></span>${ICON.chev}</button>
      <button class="dragh" id="dh-${dow}" data-dow="${dow}" aria-label="Move ${esc(d.name)} (${dowName(dow, true)}): drag up or down, or use the arrow keys">${ICON.grip}</button></div>`;
    if (open) {
      h += `<div class="pdb"><div class="pdn"><input class="inp" id="pn-${di}" value="${esc(d.name)}" data-input="p-day" data-d="${di}" data-f="name" aria-label="Name for ${dowName(dow, true)}" enterkeyhint="done">
        <button class="sw big" data-act="p-color" data-d="${di}" style="${kstyle(d.color)}" aria-label="Change colour for ${dowName(dow, true)}"></button></div>
        <input class="inp" id="ps-${di}" value="${esc(d.sub || '')}" placeholder="Subtitle, e.g. Chest emphasis" data-input="p-day" data-d="${di}" data-f="sub" aria-label="Subtitle for ${dowName(dow, true)}" enterkeyhint="done">`;
      h += d.slots.length ? `<ul class="pslots">${d.slots.map((s, si) => `<li><button class="pslot2" data-act="p-slot" data-d="${di}" data-s="${si}">${s.group ? `<i class="grp">${esc(s.group)}</i>` : `<i class="grp n">${si + 1}</i>`}<span class="grow">${esc(S.exById[s.exId]?.name || 'Missing exercise')}${s.note ? `<small>${esc(s.note)}</small>` : ''}</span><b class="num">${range(s)}</b></button></li>`).join('')}</ul>`
        : `<p class="fine">Rest day. Add an exercise to make it a training day.</p>`;
      h += `<div class="pdacts"><button class="mini addx" data-act="p-add" data-d="${di}">${ICON.plus} Add exercise</button>
        <button class="mini" data-act="p-moveday" data-dow="${dow}">${ICON.today} Swap with another day</button></div></div>`;
    }
    h += `</section>`;
  }
  h += `</div>`;
  if (!sameWeek(pOrigs.get(key), p)) h += `<button class="btn ghost" data-act="p-undo">Undo changes made on this screen</button>`;
  if (tpl) h += `<button class="btn ghost danger-t" data-act="t-del" data-id="${esc(tpl.id)}">Delete this template</button>`;
  else {
    const list = myTemplates();
    h += `<section class="box pad mytpl"><p class="lbl">My templates</p>
      <p class="fine">Save this week to come back to later, or build a new plan without changing the one you train with.</p>
      ${list.length ? `<div class="list box">${list.map(t => `<button class="li" data-act="t-open" data-id="${esc(t.id)}"><span class="grow"><b>${esc(t.name)}</b><small>${plural(trainDays(t.program).length, 'training day')}${sameWeek(t.program, S.program) ? ' · same as your programme' : ''}</small></span>${ICON.chev}</button>`).join('')}</div>` : ''}
      <div class="row2"><button class="btn ghost" data-act="t-save">${ICON.save} Save as template</button><button class="btn ghost" data-act="t-new">${ICON.plus} New template</button></div></section>`;
  }
  return { title: tpl ? tpl.name : 'Programme', sub: tpl ? 'Editing a template' : 'Your weekly split', back: tpl ? 'program' : 'more', html: h, color: 'push', after: wireDayDrag };
}

/** Change the week being edited (the programme, or the open template) and save straight away. */
async function editProgram(fn) {
  const p = structuredClone(P());
  if (fn(p) === false) return;
  if (tplId && tplOf(tplId)) return saveTemplate(tplId, { program: cleanWeek(p) });
  await saveProgram(p);
}
function cleanWeek(p) {
  p = withUniqueDays(p);
  for (const d of p.days) { d.name = cleanText(d.name, 40); d.sub = cleanText(d.sub, 80); }
  return { days: p.days };
}
async function saveTemplate(id, patch) {
  await saveSettings({ templates: myTemplates().map(t => (t.id === id ? { ...t, ...patch } : t)) });
}
async function addTemplate(name, program) {
  const t = { id: uid('t'), name: cleanText(name, 40) || 'My plan', saved: todayIso(), program: cleanWeek(structuredClone(program)) };
  await saveSettings({ templates: [...myTemplates(), t] });
  return t;
}
const nextTplName = () => { let n = myTemplates().length + 1; while (myTemplates().some(t => t.name === `My plan ${n}`)) n++; return `My plan ${n}`; };

/** Move a day to another place in the week (drag or arrow keys). Open days stay open where they land. */
async function shiftDay(from, to) {
  if (from === to) return;
  const src = P().days.find(d => d.dow === from);
  const order = [...DOW_ORDER];
  order.splice(DOW_ORDER.indexOf(to), 0, order.splice(DOW_ORDER.indexOf(from), 1)[0]);
  const open = new Set(openDays);
  openDays.clear();
  order.forEach((old, k) => { if (open.has(old)) openDays.add(DOW_ORDER[k]); });
  await editProgram(p => { p.days = moveDay(p, from, to).days; });
  toast(`${src?.slots.length ? `${src.name} moved to` : 'The rest day moved to'} ${dowName(to, true)}. The days in between shifted along.`, 'up');
}

/** Drag a day by its handle; the other days slide out of the way. Arrow keys on the handle move it one day. */
function wireDayDrag(root) {
  const sc = document.getElementById('screen');
  root.querySelectorAll('.dragh').forEach(h => h.addEventListener('keydown', async ev => {
    const k = { ArrowUp: -1, ArrowDown: 1 }[ev.key];
    if (!k) return;
    ev.preventDefault();
    const from = +h.dataset.dow, i = DOW_ORDER.indexOf(from) + k;
    if (i < 0 || i >= DOW_ORDER.length) return;
    await shiftDay(from, DOW_ORDER[i]);
    document.getElementById('dh-' + DOW_ORDER[i])?.focus();
  }));
  root.querySelectorAll('.dragh').forEach(h => h.addEventListener('pointerdown', ev => {
    if (ev.button != null && ev.button !== 0) return;
    ev.preventDefault();
    const card = h.closest('.pday2'), list = [...root.querySelectorAll('.pday2')], from = list.indexOf(card);
    const rects = list.map(c => c.getBoundingClientRect());
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 8;
    const shift = rects[from].height + gap;
    const y0 = ev.clientY, s0 = sc?.scrollTop || 0;
    let y = y0, to = from, raf = 0;
    try { h.setPointerCapture(ev.pointerId); } catch {}
    card.classList.add('dragging');
    root.classList.add('dragmode');
    navigator.vibrate?.(10);
    const place = () => {
      const dy = y - y0 + ((sc?.scrollTop || 0) - s0);
      card.style.transform = `translateY(${dy}px)`;
      // Where the finger is decides the drop, so a tall open day moves as easily as a closed one.
      const mid = y + ((sc?.scrollTop || 0) - s0);
      to = from;
      for (let k = 0; k < list.length; k++) {
        const c = rects[k].top + rects[k].height / 2;
        if (k < from && mid < c) { to = k; break; }
        if (k > from && mid > c) to = k;
      }
      list.forEach((c, k) => { if (c !== card) c.style.transform = k >= to && k < from ? `translateY(${shift}px)` : k <= to && k > from ? `translateY(${-shift}px)` : ''; });
    };
    // Near the top or bottom edge the list scrolls, so a day can travel the whole week on a small phone.
    const tick = () => {
      if (sc) {
        const r = sc.getBoundingClientRect(), e = 56;
        const v = y < r.top + e ? -Math.ceil((r.top + e - y) / 5) : y > r.bottom - e ? Math.ceil((y - r.bottom + e) / 5) : 0;
        if (v) { const was = sc.scrollTop; sc.scrollTop += v; if (sc.scrollTop !== was) place(); }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const move = e => { y = e.clientY; place(); };
    const end = e => {
      cancelAnimationFrame(raf);
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', end);
      h.removeEventListener('pointercancel', end);
      card.classList.remove('dragging');
      root.classList.remove('dragmode');
      list.forEach(c => { c.style.transform = ''; });
      if (e.type === 'pointerup' && to !== from) shiftDay(+list[from].dataset.dow, +list[to].dataset.dow).catch(err => toast(err.message || 'Could not move the day', 'down'));
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', end);
    h.addEventListener('pointercancel', end);
  }));
}

/** Bottom sheet for one exercise slot: steppers instead of number fields, so no keyboard. */
function slotSheet(di, si) {
  const d = P().days[di], s = d?.slots[si];
  if (!s) return closeSheet();
  const ex = S.exById[s.exId];
  const step = (f, label, v) => `<div class="rrow"><span>${label}</span><div class="stepper"><button data-act="p-step" data-d="${di}" data-s="${si}" data-f="${f}" data-v="-1" aria-label="${label} down">−</button><b class="num" aria-live="polite">${v}</b><button data-act="p-step" data-d="${di}" data-s="${si}" data-f="${f}" data-v="1" aria-label="${label} up">+</button></div></div>`;
  const html = `<div class="pss"><p class="lbl">${esc(d.name)} · exercise ${si + 1} of ${d.slots.length}</p><h2 class="sh-title">${esc(ex?.name || 'Missing exercise')}</h2>
    ${step('sets', 'Sets', s.sets)}${step('lo', 'Reps from', s.lo)}${step('hi', 'Reps to', s.hi)}
    <label class="field"><span>Note (optional), e.g. @ 80%, RPE 8, last set AMRAP</span><input class="inp" id="p-note-${di}-${si}" value="${esc(s.note || '')}" data-input="p-note" data-d="${di}" data-s="${si}" enterkeyhint="done" maxlength="80"></label>
    <div class="rrow"><span>${esc(T('superset'))} with others marked ${helpTip('superset')}</span><div class="seg" role="group" aria-label="${esc(T('superset'))}">${['', 'A', 'B', 'C'].map(g => `<button data-act="p-grp" data-d="${di}" data-s="${si}" data-v="${g}" aria-pressed="${(s.group || '') === g}">${g || '—'}</button>`).join('')}</div></div>
    <div class="row3"><button class="btn ghost" data-act="p-move" data-d="${di}" data-s="${si}" data-v="-1" ${si === 0 ? 'disabled' : ''}>↑ Earlier</button><button class="btn ghost" data-act="p-move" data-d="${di}" data-s="${si}" data-v="1" ${si === d.slots.length - 1 ? 'disabled' : ''}>↓ Later</button><button class="btn ghost" data-act="p-swap" data-d="${di}" data-s="${si}">Swap</button></div>
    <div class="row2"><button class="btn ghost danger-t" data-act="p-del" data-d="${di}" data-s="${si}">Remove</button><button class="btn" data-act="sheet-close" autofocus>Done</button></div></div>`;
  const cur = document.querySelector('.scrim .pss');
  if (cur) {
    // Repaint in place and keep focus on the control that was used.
    const f = document.activeElement?.closest('.pss [data-act]');
    const sel = f && `[data-act="${f.dataset.act}"][data-f="${f.dataset.f || ''}"][data-v="${f.dataset.v}"]`;
    cur.outerHTML = html;
    if (sel) (document.querySelector('.pss ' + sel.replace('[data-f=""]', '')) || document.querySelector('.pss [autofocus]'))?.focus({ preventScroll: true });
  }
  else openSheet(html, { label: `Edit ${ex?.name || 'exercise'}` });
}

/** Filter a list as you type: every word must match the name, muscles or another name for it ("bicep curl" finds DB curl),
 *  best matches first. Cardio words ("treadmill", "walk") show a pointer to the cardio log instead. */
function searchList(root, raw, sel) {
  const q = raw.trim().toLowerCase();
  const shown = filterList(root, raw, sel);
  const none = root.querySelector('.searchnone');
  if (none) none.hidden = !q || shown > 0;
  const hint = root.querySelector('.cardiohint');
  if (hint) hint.hidden = !CARDIO_WORDS.test(q);
  return shown;
}
const cardioHint = `<p class="searchnone fine" hidden>No exercise matches. Try fewer words, or add it with New exercise.</p><p class="cardiohint fine" hidden>Walking, running, bikes and other cardio are logged under <a href="#/cardio">Insights → Cardio</a>, not as an exercise.</p>`;

// "New exercise" from a programme picker: after saving, come back and use it there (add to the day, or swap).
let pendingPick = null, pendingAt = 'program';

/** Searchable exercise list in a sheet. Calls onPick(id). */
function pickExercise(title, onPick, cur = null) {
  const inProg = new Set(P().days.flatMap(d => d.slots.map(s => s.exId)));
  const el = openSheet(`<h2 class="sh-title" tabindex="-1" autofocus>${esc(title)}</h2><input class="inp" id="pick-q" type="search" placeholder="Search ${S.exercises.length} exercises" aria-label="Search exercises" autocomplete="off">
    ${cardioHint}
    <ul class="picklist">${S.exercises.map(x => `<li data-name="${esc(searchText(x))}"><button data-pick="${esc(x.id)}" ${x.id === cur ? 'aria-current="true"' : ''}><b>${esc(x.name)}</b><small>${esc((x.muscles || []).slice(0, 2).join(', ') || 'No muscles set')}${inProg.has(x.id) ? ' · in programme' : ''}</small></button></li>`).join('')}</ul>
    <a class="btn ghost" href="#/exercise/new">${ICON.plus} New exercise</a>`, { label: title });
  el.querySelector('#pick-q').addEventListener('input', ev => searchList(el, ev.target.value, '.picklist li'));
  el.addEventListener('click', async ev => {
    if (ev.target.closest('.cardiohint a')) { closeSheet(); return; }
    if (ev.target.closest('a[href="#/exercise/new"]')) { pendingPick = onPick; pendingAt = location.hash.replace(/^#\/?/, '') || 'program'; return; }
    const b = ev.target.closest('[data-pick]');
    if (b) { closeSheet(); onPick(b.dataset.pick); }
  });
}

// ---- exercise library -----------------------------------------------------------------------
function exercises() {
  pendingPick = null;
  const inProg = new Set(S.program.days.flatMap(d => d.slots.map(s => s.exId)));
  let h = `<input class="inp" id="exq" type="search" placeholder="Search exercises" aria-label="Search exercises" autocomplete="off">${cardioHint}
    <a class="btn ghost" href="#/exercise/new">${ICON.plus} New exercise</a>`;
  // Exercises imported before the muscle guesser improved: offer the better guess, never change it silently.
  const recheck = muscleRechecks();
  if (recheck.length) h += `<div class="box pad"><p><b>Check muscles on ${recheck.length} imported exercise${recheck.length === 1 ? '' : 's'}</b></p><p class="fine">The app now reads exercise names better. These may count toward the wrong muscles on your levels and the 3D view.</p><ul class="recheck">${recheck.slice(0, 12).map(({ x, g }) => `<li><span class="grow" data-raw><b>${esc(x.name)}</b></span><small>${(x.muscles || []).map(m => `<span>${esc(m)}</span>`).join(', ') || '—'} → ${g.map(m => `<span>${esc(m)}</span>`).join(', ')}</small><span class="row2"><button class="mini go" data-act="mus-fix" data-id="${esc(x.id)}">Use suggested</button><button class="mini" data-act="mus-keep" data-id="${esc(x.id)}">Keep</button></span></li>`).join('')}</ul>${recheck.length > 1 ? `<button class="btn ghost" data-act="mus-fix-all">Use suggested for all ${recheck.length}</button>` : ''}</div>`;
  h += `<ul class="box mus" id="exl">`;
  for (const x of S.exercises) {
    h += `<li data-name="${esc(searchText(x))}"><a href="#/exercise/${esc(x.id)}"><span class="t">${esc(x.name)} ${inProg.has(x.id) ? pill('in programme', 'up') : ''}${x.unitUnclear ? pill('unit unclear', 'flat') : ''}${!(x.muscles || []).length ? pill('set muscles', 'down') : ''}</span><span class="d">${esc((x.muscles || []).join(', '))} · ${unitLong(x)}</span></a></li>`;
  }
  h += `</ul>`;
  return {
    title: 'Exercises', sub: 'Your library', back: 'more', html: h, color: 'pull',
    after: root => root.querySelector('#exq').addEventListener('input', ev => searchList(root, ev.target.value, '#exl li')),
  };
}

let ed = null, edFor = null;
const EQUIP = [['db', 'Dumbbells'], ['barbell', 'Barbell'], ['smith', 'Smith machine'], ['machine', 'Machine'], ['cable', 'Cable'], ['bw', 'Bodyweight']];
const UNITS = [['kg/DB', 'kg per dumbbell'], ['kg', 'kg total'], ['L', 'Level / pin'], ['bw', 'Bodyweight (+kg)']];
function exerciseEdit(id) {
  if (edFor !== id) {
    edFor = id;
    // A new exercise starts as a barbell lift; typing its name fills in the likely equipment and muscles until you pick them yourself.
    ed = id === 'new' ? { id: '', name: '', unit: 'kg', equip: 'barbell', inc: 2.5, rest: 90, muscles: [], perGym: false, caution: '', _auto: true } : structuredClone(S.exById[id] || null);
  }
  if (!ed) return { title: 'Not found', back: 'exercises', html: `<div class="empty"><b>This exercise doesn't exist.</b></div>` };
  const isNew = id === 'new';
  const n = isNew ? 0 : exposures(S.sessions, ed).length;
  let h = `<label class="field"><span>Name</span><input class="inp" id="ex-name" value="${esc(ed.name)}" data-input="ed" data-f="name" placeholder="e.g. Hack squat" autofocus></label>
    <div class="field"><span>Load is logged as</span><div class="chips" role="group" aria-label="Unit">${UNITS.map(([v, l]) => `<button class="mini" data-act="ed-set" data-f="unit" data-v="${v}" aria-pressed="${ed.unit === v}">${l.replace(/\bkg\b/, unitsFor(ed))}</button>`).join('')}</div></div>
    ${isKg(ed.unit) ? `<div class="field"><span>Weights shown in</span><div class="chips" role="group" aria-label="Weights shown in">${[['', 'App setting'], ['kg', 'kg'], ['lb', 'lb']].map(([v, l]) => `<button class="mini" data-act="ed-set" data-f="disp" data-v="${v}" aria-pressed="${(ed.disp || '') === v}">${l}</button>`).join('')}</div></div>` : ''}
    ${ed.unitUnclear ? `<div class="warn"><b>Unit unclear.</b><span>Old logs mixed per-side and total. Choosing a unit above clears this flag.</span></div>` : ''}
    <div class="field"><span>Equipment</span><div class="chips" role="group" aria-label="Equipment">${EQUIP.map(([v, l]) => `<button class="mini" data-act="ed-set" data-f="equip" data-v="${v}" aria-pressed="${ed.equip === v}">${l}</button>`).join('')}</div></div>
    <div class="row2"><label class="field"><span>Weight jump ${ed.unit === 'L' ? '(levels)' : ed.unit === 'kg/DB' ? `(${unitsFor(ed)} per dumbbell)` : `(${unitsFor(ed)})`}</span><input class="inp" id="ex-inc" type="text" inputmode="decimal" autocomplete="off" step="0.25" min="0.25" value="${ed.unit === 'L' ? ed.inc : toDisp(ed.inc, ed)}" data-input="ed" data-f="inc" aria-describedby="inc-help"></label>
    <label class="field"><span>Rest between sets (s)</span><input class="inp" id="ex-rest" type="number" inputmode="numeric" step="15" min="15" max="600" value="${ed.rest}" data-input="ed" data-f="rest"></label></div>
    <p class="fine" id="inc-help">How much weight gets added when every set reaches the top of its rep range. Use the smallest increase your gym allows: e.g. 2.5 kg for dumbbells, the plate size on a machine, 1 level on a cable.</p>
    <div class="field"><span>Muscles · tap in order, first is the main one</span><div class="chips" role="group" aria-label="Muscles">${MUSCLES.map(m => { const i = (ed.muscles || []).indexOf(m); return `<button class="mini" data-act="ed-muscle" data-v="${m}" aria-pressed="${i >= 0}">${i === 0 ? '★ ' : ''}${m}</button>`; }).join('')}</div></div>
    <label class="toggle"><input type="checkbox" id="ex-pergym" data-input="ed" data-f="perGym" ${ed.perGym ? 'checked' : ''}><span><b>Compare per gym</b><small>For machines and cables whose loads differ between gyms</small></span></label>
    <label class="field"><span>Caution note (shown with suggestions)</span><input class="inp" id="ex-caution" value="${esc(ed.caution || '')}" data-input="ed" data-f="caution" placeholder="e.g. Lower back has flared here"></label>
    <button class="btn" data-act="ed-save" style="--c:var(--up)">${isNew ? 'Create exercise' : 'Save exercise'}</button>`;
  if (!isNew) h += `<a class="btn ghost" href="#/ex/${esc(ed.id)}">History and records (${n} session${n === 1 ? '' : 's'})</a><button class="linkbtn danger center" data-act="ed-del">Delete exercise</button>`;
  return { title: isNew ? 'New exercise' : 'Edit exercise', sub: isNew ? 'Add to your library' : esc(ed.name), back: isNew && pendingPick ? pendingAt : 'exercises', html: h, color: 'pull' };
}

// ---- gyms & equipment ---------------------------------------------------------------------------
function gyms() {
  let h = `<p class="fine">Machine and cable exercises marked "compare per gym" only use history from the gym you're at, so level 9 at one gym is never compared with level 9 at another.</p><ul class="box hist small">`;
  for (const g of S.settings.gyms) {
    const cur = g.id === S.settings.gymId;
    const n = S.sessions.filter(s => s.gymId === g.id).length;
    h += `<li><div class="rowi">${ICON.pin}<span class="grow"><input class="inp" id="gym-${esc(g.id)}" value="${esc(g.name)}" data-input="gym-name" data-id="${esc(g.id)}" aria-label="Gym name"><small>${n} session${n === 1 ? '' : 's'}</small></span>
      ${cur ? pill('Current', 'up') : `<button class="mini" data-act="gym-use" data-id="${esc(g.id)}">Use</button><button class="iconbtn sm" data-act="gym-del" data-id="${esc(g.id)}" aria-label="Delete ${esc(g.name)}">×</button>`}</div></li>`;
  }
  h += `</ul><button class="btn ghost" data-act="gym-add">${ICON.plus} Add gym</button>`;
  return { title: 'Gyms', sub: 'Where you train', back: 'more', html: h, color: 'legs' };
}

function equip() {
  const e = S.settings.equip, u = getUnits(), d = kg => toDisp(kg);
  const h = `<label class="field"><span>Dumbbells available (${u}, comma separated)</span><textarea class="inp" id="eq-db" rows="3">${esc(e.dumbbells.map(d).join(', '))}</textarea></label>
    <p class="fine">Load increases jump to the next dumbbell you actually have; the workout screen warns when a weight isn't on your rack.</p>
    <label class="field"><span>Plates per side (${u})</span><input class="inp" id="eq-pl" value="${esc(e.plates.map(d).join(', '))}"></label>
    <div class="row2"><label class="field"><span>Barbell (${u})</span><input class="inp" id="eq-bar" type="text" inputmode="decimal" autocomplete="off" step="0.5" value="${d(e.barKg)}"></label>
    <label class="field"><span>Smith bar (${u})</span><input class="inp" id="eq-smith" type="text" inputmode="decimal" autocomplete="off" step="0.5" value="${d(e.smithBarKg ?? e.barKg)}"></label></div>
    <p class="fine">Smith bars are often counterbalanced to 5–15 kg. Check the label on yours.</p>
    <label class="field"><span>EZ bar (${u})</span><input class="inp" id="eq-ez" type="text" inputmode="decimal" autocomplete="off" step="0.5" placeholder="Not sure" value="${e.ezBarKg ? d(e.ezBarKg) : ''}" aria-describedby="ez-help"></label>
    <p class="fine" id="ez-help">The curvy bar for curls and skull crushers, often 7–10 kg. Leave it blank if you don't know: the app then skips the empty-bar warm-up and plate maths for it.</p>
    <button class="btn" data-act="eq-save" style="--c:var(--up)">Save equipment</button>`;
  return { title: 'Equipment', sub: 'For load and plate suggestions', back: 'more', html: h, color: 'upper' };
}


// ---- data: backup / export -----------------------------------------------------------------------
let undoMeta; // undefined: not read yet; null: none; else {at, what, n}
function data() {
  if (undoMeta === undefined) {
    undoMeta = null;
    db.getKv('undo').then(u => { if (u?.data) { undoMeta = { at: u.at, what: u.what, n: u.data.sessions?.length || 0 }; refresh(); } }).catch(() => {});
  }
  const n = S.sessions.length, lb = S.settings.lastBackup, nSeed = S.sessions.filter(s => s.seed).length;
  const WHAT = { restore: 'restoring a backup', erase: 'erasing everything', undo: 'the last undo' };
  let h = `<div class="kpis"><div class="kpi"><b>${n}</b><span>sessions</span></div><div class="kpi"><b>${S.body.length}</b><span>weigh-ins</span></div><div class="kpi"><b>${S.cardio.length}</b><span>cardio</span></div></div>
    <section class="box pad stack"><div class="rrow"><p class="lbl">Backup</p>${lb ? pill(`Last: ${agoTxt(lb)}`, daysAgo(lb) > 14 ? 'flat' : 'up') : S.sessions.some(s => !s.seed) ? pill('Never backed up', 'down') : ''}</div>
      <p class="fine">One file with everything: sessions, programme, exercises, weigh-ins, cardio and settings. If the phone is lost or the browser data is cleared, this file is the only copy. The file isn't encrypted, so keep it somewhere private; progress photos aren't included.${isIOS() ? ' On iPhone, choose Save to Files, then iCloud Drive, to keep a copy in iCloud.' : ''}</p>
      <button class="btn" data-act="backup-share">${ICON.upload} Share backup (Drive, WhatsApp, email)</button>
      <button class="btn ghost" data-act="backup-dl">${ICON.save} Save backup file</button>
      <label class="btn ghost filebtn">Restore from backup<input type="file" id="restore-file" accept=".json,application/json" data-input="restore"></label></section>`;
  if (undoMeta) h += `<div class="warn" style="--k:var(--upper)"><b>Undo copy</b><span>Your data from before ${WHAT[undoMeta.what] || 'the last change'} (${fmtDate(undoMeta.at, { year: true })}, ${plural(Number(undoMeta.n), 'session')}) is kept on this phone. <button class="linkbtn" data-act="undo-restore">Put it back</button></span></div>`;
  h += `<section class="box pad stack"><p class="lbl">Spreadsheet</p><p class="fine">One row per set. Opens in Google Sheets or Excel.</p>
      <div class="row2"><button class="btn ghost" data-act="csv-dl">Export CSV</button>
      <label class="btn ghost filebtn">Import CSV<input type="file" id="csv-file" accept=".csv,.tsv,.txt,text/csv,text/plain" data-input="csv-in"></label></div></section>
    <section class="box pad stack"><p class="lbl">Start fresh</p>
      ${nSeed ? `<button class="btn ghost" data-act="rm-seed">Remove the ${nSeed} sample sessions</button>` : ''}
      <button class="btn danger" data-act="reset">Erase everything</button></section>`;
  return { title: 'Backup and export', sub: 'Your data, your files', back: 'more', html: h, color: 'upper' };
}

/** Copy of all data saved before a destructive step, so the step can be undone (even one that failed half-way). */
async function withUndo(what, fn) {
  const snap = structuredClone(await exportAll());
  await db.setKv('undo', { at: todayIso(), what, data: snap });
  await fn();
  undoMeta = { at: todayIso(), what, n: snap.sessions.length };
  refresh();
}

// ---- importer --------------------------------------------------------------------------------------
// imp: {sessions, skipped, source, dropped, sameFiles, groups, gOf: {gk(entry): groupIndex}, filter, show, sessShow, replaceSeed, raw}
// Spellings of one lift ("Pullup", "Pull ups", "pull-up") form one group, matched and imported together.
let imp = null;
let impText = ''; // pasted text kept for "Start over"
let impBusy = null; // {file, i, n, page, pages} while files are being read
const COLOR_WORDS = [[/push|chest/i, 'push'], [/pull|back/i, 'pull'], [/leg.*b\b|hinge|glute/i, 'legsb'], [/leg|squat/i, 'legs'], [/arm|bicep|tricep/i, 'arms'], [/upper|shoulder/i, 'upper']];
const progIds = () => new Set(S.program.days.flatMap(d => d.slots.map(s => s.exId)));
function prepImport(r, source, raw = '', dropped = 0) {
  const prefer = progIds(), groups = [], byKey = new Map();
  for (const s of r.sessions) {
    for (const e of s.entries) {
      // Cable levels and kilos logged under one name are kept apart: "L9" and "30 kg" can't share an exercise.
      const key = (nameKey(e.exName) || e.exName.toLowerCase()) + (e.unit === 'L' ? ' ·L' : '');
      let g = byKey.get(key);
      if (!g) { g = { key, names: Object.create(null), sess: 0, sets: 0, units: {}, last: null }; byKey.set(key, g); groups.push(g); }
      g.names[e.exName] = (g.names[e.exName] || 0) + 1;
      g.sets += e.sets.length;
      const u = e.unit === '' ? '?' : e.unit || 'kg'; // '' = a CSV without a unit column: could be either
      g.units[u] = (g.units[u] || 0) + 1;
      if (g.last !== s) { g.sess++; g.last = s; }
    }
    const day = S.program.days.find(d => d.slots.length && d.name.toLowerCase() === s.name.toLowerCase());
    s.color = day?.color || COLOR_WORDS.find(([re]) => re.test(s.name))?.[1] || 'upper';
    // Already in the app: logged there on that date, or imported before under the same name.
    s.dupOwn = S.sessions.some(x => x.date === s.date && !x.seed && (!x.imported || x.name === s.name));
    s.dupSeed = S.sessions.some(x => x.date === s.date && x.seed);
    s.skip = s.dupOwn; // off by default so nothing doubles up
    s.notes = s.notes || [];
  }
  for (const g of groups) {
    delete g.last;
    g.variants = Object.keys(g.names).sort((a, b) => g.names[b] - g.names[a]);
    g.label = g.variants[0];
    g.unit = Object.keys(g.units).filter(u => u !== '?').sort((a, b) => g.units[b] - g.units[a])[0] || null;
    let best = null;
    // Only exercises measured the same way: cable levels with levels, kilos (or bodyweight) with kilos.
    const lib = g.unit ? S.exercises.filter(x => unitClass(x.unit) === unitClass(g.unit)) : S.exercises;
    for (const n of g.variants) { const m = matchExercise(n, lib, { prefer, unit: g.unit }); if (m && (!best || m.score > best.score)) best = m; }
    g.suggested = best?.ex.id || '';
    g.target = g.suggested;
    // If it becomes a new exercise: equipment, unit and muscles guessed from the name and how it was logged.
    const loaded = r.sessions.some(s => s.entries.some(e => g.names[e.exName] && e.sets.some(x => +x.w > 0)));
    g.meta = guessNewExercise(g.label, { loaded, unit: g.unit });
    // Same lift in the library but measured the other way (kilos vs cable levels): said so, and the new one is named apart.
    if (!best && g.unit) {
      const other = S.exercises.filter(x => unitClass(x.unit) !== unitClass(g.unit));
      g.twin = g.variants.map(n => matchExercise(n, other)?.ex).find(Boolean)?.name || null;
    }
  }
  groups.sort((a, b) => b.sets - a.sets);
  const gOf = Object.create(null); // keyed by names from the file: "constructor" or "__proto__" are plain keys
  groups.forEach((g, i) => { for (const n of g.variants) gOf[n + (g.unit === 'L' ? '|L' : '')] = i; });
  // The level-based twin of a lift logged in kilos too gets its own name.
  for (const g of groups) if (g.unit === 'L' && byKey.has(g.key.replace(/ ·L$/, ''))) g.label += ' (levels)';
  imp = { sessions: r.sessions, skipped: r.skipped || 0, future: r.future || 0, impossible: r.impossible || 0, badYears: r.badYears || [], source, dropped, sameFiles: 0, groups, gOf, filter: groups.some(g => !g.target) ? 'new' : 'all', show: 40, sessShow: 25, replaceSeed: true, raw };
}
const gk = e => e.exName + (e.unit === 'L' ? '|L' : '');
const unitClass = u => (u === 'L' ? 'L' : 'w'); // cable levels vs weights (bodyweight counts as a weight)
const setTxt = e => e.sets.map(x => `${x.w ?? '?'}×${x.r ?? '?'}`).join(' · ');
const exNameOf = id => S.exercises.find(x => x.id === id)?.name || id;
const targetTxt = t => (t === 'skip' ? 'Not imported' : t ? exNameOf(t) : 'New exercise');

function importer() {
  let h = '';
  if (impBusy) {
    const b = impBusy, pct = Math.round(100 * ((b.i + (b.pages ? b.page / b.pages : 0)) / b.n));
    h = `<div class="box pad impbusy" role="status" aria-live="polite"><b>Reading file ${b.i + 1} of ${b.n}</b><small>${esc(b.file)}${b.pages ? ` · page ${b.page} of ${b.pages}` : ''}</small>
      <div class="impbar" role="progressbar" aria-label="Reading files" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i></div>
      <p class="fine">Big PDFs take a little while. Keep the app open.</p></div>`;
    return { title: 'Import logs', sub: 'Reading…', back: 'more', html: h, color: 'legsb' };
  }
  if (!imp) {
    h = `<p class="fine">Bring in old workouts from PDFs, notes, or a Hevy, Strong or spreadsheet CSV. You check everything before it's saved.</p>
      <label class="btn filebtn">${ICON.upload} Choose files<input type="file" id="imp-file" multiple accept=".pdf,.csv,.tsv,.txt,.md,.json,.html,.htm,.xml,.rtf,application/pdf,text/*,application/json" data-input="imp-file"></label>
      <details class="box pad help"><summary class="lbl">What formats work?</summary>
        <p>Dates, exercise names and sets written like <b>25kg x 8 x 4</b>, <b>25 kg 8,8,6</b>, <b>15kg 8 8 7</b>, <b>3x8 @ 25</b>, <b>L9 x 12</b> or <b>BW 6,6,6</b>. Remarks about pain, sleep and effort are kept as notes, never as exercises.</p>
        <p>Pick several files at once if you like. Older and newer copies of the same log are fine: repeated sessions are removed.</p></details>
      ${impOptions()}
      <label class="field"><span>Or paste text</span><textarea class="inp mono" id="imp-text" rows="7" placeholder="21/9/2026 Push&#10;Flat DB bench&#10;25kg x 8 x 4&#10;Incline DB press 25 kg 8,8,6&#10;left shoulder pinged on the last set">${esc(impText)}</textarea></label>
      <div class="row2"><label class="field"><span>Year for dates without one</span><input class="inp" id="imp-year" type="number" inputmode="numeric" value="${todayIso().slice(0, 4)}"></label><button class="btn ghost" data-act="imp-parse">Read pasted text</button></div>
      <p class="fine">Reading a PDF needs internet the first time.</p>
      <section class="box pad stack impres"><p class="lbl">Moving from another phone?</p><p class="fine">A backup file from this app brings back everything at once: sessions, programme, exercises and settings.</p>
      <label class="btn ghost filebtn">${ICON.save} Restore a backup<input type="file" id="imp-restore" accept=".json,application/json" data-input="restore"></label></section>`;
    return { title: 'Import logs', sub: 'PDFs, notes or CSV', back: 'more', html: h, color: 'legsb' };
  }
  const sel = imp.sessions.filter(s => !s.skip);
  const G = imp.groups;
  const nSets = sel.reduce((a, s) => a + s.entries.reduce((b, e) => b + (G[imp.gOf[gk(e)]]?.target === 'skip' ? 0 : e.sets.length), 0), 0);
  const nNew = G.filter(g => !g.target).length, nMatched = G.filter(g => g.target && g.target !== 'skip').length, nSkip = G.filter(g => g.target === 'skip').length;
  h += `<div class="kpis"><div class="kpi"><b>${sel.length}</b><span>sessions</span></div><div class="kpi"><b>${nSets}</b><span>sets</span></div><div class="kpi"><b>${nNew}</b><span>new exercise${nNew === 1 ? '' : 's'}</span></div></div>`;
  const facts = [];
  if (imp.dropped) facts.push(`<b>${imp.dropped}</b> duplicate session${imp.dropped === 1 ? '' : 's'} removed (the same session in more than one file)`);
  if (imp.sameFiles) facts.push(`<b>${imp.sameFiles}</b> identical cop${imp.sameFiles === 1 ? 'y' : 'ies'} of a file skipped`);
  const fixed = imp.sessions.filter(s => s.dateWas);
  if (fixed.length) facts.push(`<b>${fixed.length}</b> date${fixed.length === 1 ? '' : 's'} looked mistyped and ${fixed.length === 1 ? 'was' : 'were'} moved to fit the log's order: ${fixed.slice(0, 5).map(s => `${esc(fmtDate(s.dateWas, { year: true }))} → ${esc(fmtDate(s.date, { year: true }))}`).join(', ')}${fixed.length > 5 ? '…' : ''}`);
  const nOwn = imp.sessions.filter(s => s.dupOwn).length;
  if (nOwn) facts.push(`<b>${nOwn}</b> session${nOwn === 1 ? ' is' : 's are'} already in the app and left unticked`);
  if (imp.skipped) facts.push(`${imp.skipped} line${imp.skipped === 1 ? '' : 's'} before the first date skipped`);
  if (imp.future) facts.push(`<b>${imp.future}</b> line${imp.future === 1 ? '' : 's'} dated after tomorrow left out`);
  if (imp.badYears?.length && imp.sessions.length) facts.push(`<b>${imp.badYears.length}</b> date${imp.badYears.length === 1 ? '' : 's'} with an impossible year skipped (${esc(imp.badYears[0])})`);
  if (imp.impossible) facts.push(`<b>${imp.impossible}</b> line${imp.impossible === 1 ? '' : 's'} left out because the weight or reps can't be real (over ${MAX_KG} kg or ${MAX_REPS} reps)`);
  if (facts.length) h += `<ul class="impfacts">${facts.map(f => `<li>${f}</li>`).join('')}</ul>`;
  if (!imp.sessions.length) {
    h += `<div class="warn"><b>Nothing found.</b><span>No dated lines with sets were recognised. Each workout needs a date line (e.g. 21/9/2026 or 21 Sep) followed by sets (e.g. 25kg x 8).</span></div>`;
    if (imp.badYears.length) h += `<div class="warn"><b>Check the year.</b><span>${imp.badYears.length === 1 ? 'A date' : `${imp.badYears.length} dates`} with an impossible year (${esc(imp.badYears[0])}) ${imp.badYears.length === 1 ? 'was' : 'were'} skipped: only years from 1991 to 2099 are read. Fix the year and read the text again.</span></div>`;
    if (imp.raw) h += `<details class="box pad"><summary class="lbl">Text that was read</summary><pre class="rawtxt">${esc(imp.raw.slice(0, 4000))}${imp.raw.length > 4000 ? '\n…' : ''}</pre></details>`;
  } else {
    // Exercises: one row per lift (all its spellings), busiest first. Tap a row to change what it becomes.
    const prog = progIds();
    const shown = G.map((g, i) => ({ g, i })).filter(({ g }) => imp.filter === 'all' || (imp.filter === 'new' ? !g.target : imp.filter === 'skip' ? g.target === 'skip' : g.target && g.target !== 'skip'));
    h += `<p class="lbl">Exercises · ${G.length} lift${G.length === 1 ? '' : 's'}</p>
      <p class="fine">Lifts matched to an exercise in your programme (★) feed its suggestions and levels. The rest are added as new exercises, one per lift however it was spelled. Tap a lift to change it.</p>
      <div class="seg impseg" role="group" aria-label="Show lifts">${[['new', `New ${nNew}`], ['matched', `Matched ${nMatched}`], ...(nSkip ? [['skip', `Skipped ${nSkip}`]] : []), ['all', `All ${G.length}`]].map(([v, t]) => `<button data-act="imp-filter" data-v="${v}" aria-pressed="${imp.filter === v}">${t}</button>`).join('')}</div>
      <input class="inp" id="imp-q" type="search" placeholder="Search lifts" aria-label="Search lifts" autocomplete="off">
      <ul class="box impg" id="imp-gl">`;
    shown.forEach(({ g, i }, k) => {
      const t = targetTxt(g.target);
      h += `<li data-q="${esc((g.variants.join(' ') + ' ' + t).toLowerCase())}" ${k >= imp.show ? 'hidden data-more' : ''}><button data-act="imp-pickg" data-g="${i}" class="${g.target === 'skip' ? 'skip' : g.target ? 'ok' : 'new'}">
        <span class="t"><b>${esc(g.label)}</b>${!g.target && g.meta ? `<small class="newmeta">New · ${esc(metaTxt(g.meta))}</small>` : ''}<small>${g.sess} session${g.sess === 1 ? '' : 's'} · ${plural(g.sets, 'set')}${g.variants.length > 1 ? ` · ${g.variants.length} spellings` : ''}${!g.target && g.twin ? ` · logged in ${g.unit === 'L' ? 'levels' : 'kg'}; ${esc(g.twin)} uses ${g.unit === 'L' ? 'kg' : 'levels'}` : g.unit === 'L' && !/\(levels\)$/.test(g.label) ? ' · levels' : ''}</small></span>
        <span class="to">${g.target && g.target !== 'skip' ? '→ ' : ''}${esc(t)}${prog.has(g.target) ? ' ★' : ''}</span></button></li>`;
    });
    if (!shown.length) h += `<li class="fine impnone">Nothing here.</li>`;
    h += `</ul>`;
    if (shown.length > imp.show) h += `<button class="linkbtn center" id="imp-gmore" data-act="imp-gmore">Show all ${shown.length}</button>`;
    h += `<div class="row2 impbulk">${imp.filter === 'new' && nNew ? `<button class="btn ghost" data-act="imp-bulk" data-v="skip">Skip these ${nNew}</button>` : ''}<button class="btn ghost" data-act="imp-bulk" data-v="reset">Reset all to suggestions</button></div>`;

    const nSeedDup = sel.filter(s => s.dupSeed).length;
    if (imp.sessions.some(s => s.dupSeed)) h += `<label class="toggle"><input type="checkbox" id="imp-seed" data-input="imp-seed" ${imp.replaceSeed ? 'checked' : ''}><span><b>Replace sample data on the same dates</b><small>${nSeedDup} selected session${nSeedDup === 1 ? ' is on a date' : 's are on dates'} that also have sample data, which only holds a few lifts</small></span></label>`;
    // Sessions, newest first, a page at a time so hundreds of them stay quick on a phone.
    const order = imp.sessions.map((s, si) => ({ s, si })).sort((a, b) => b.s.date.localeCompare(a.s.date));
    const years = [...new Set(order.map(o => o.s.date.slice(0, 4)))];
    h += `<div class="rrow"><p class="lbl">Sessions · ${sel.length} of ${imp.sessions.length} selected</p><button class="linkbtn" data-act="imp-all">${sel.length === imp.sessions.length ? 'Select none' : 'Select all'}</button></div>`;
    if (years.length > 1) h += `<div class="chips impyears" role="group" aria-label="Select by year">${years.map(y => { const n = order.filter(o => o.s.date.startsWith(y)); const on = n.filter(o => !o.s.skip).length; return `<button class="mini" data-act="imp-yr" data-y="${y}" aria-pressed="${on === n.length}">${y} · ${on}/${n.length}</button>`; }).join('')}</div>`;
    h += `<div class="box impsessl">`;
    order.slice(0, imp.sessShow).forEach(({ s, si }) => {
      const pain = s.pain || s.entries.some(e => e.pain);
      h += `<div class="impsess2" style="${kstyle(s.color)}"><div class="rrow"><label class="toggle sm"><input type="checkbox" id="imp-on-${si}" data-input="imp-on" data-s="${si}" ${s.skip ? '' : 'checked'}><span><b>${fmtDate(s.date, { dow: true, year: true })} · ${esc(s.name)}</b><small>${s.entries.length} exercise${s.entries.length === 1 ? '' : 's'} · ${plural(s.entries.reduce((a, e) => a + e.sets.length, 0), 'set')}${s.dateWas ? ` · written as ${esc(fmtDate(s.dateWas, { year: true }))}` : ''}</small></span></label>
        <span class="chips">${s.dupOwn ? pill('already in app', 'flat') : ''}${s.dupSeed && !s.dupOwn ? pill('sample', 'mute') : ''}${pain ? pill('pain', 'down') : ''}</span></div>
        <details><summary>Show sets</summary><ul class="impents">${s.entries.map(e => { const g = G[imp.gOf[gk(e)]]; const to = g?.target === 'skip' ? 'not imported' : g?.target ? `→ ${exNameOf(g.target)}` : 'new exercise'; return `<li><b>${esc(e.exName)}</b> <span class="num">${esc(setTxt(e))}</span><small class="to">${esc(to)}</small>${e.note ? `<small class="${e.pain ? 'painn' : ''}">${esc(e.note)}</small>` : ''}</li>`; }).join('')}</ul>${s.notes.length ? `<p class="enote">${esc(s.notes.join(' · '))}</p>` : ''}</details></div>`;
    });
    h += `</div>`;
    if (order.length > imp.sessShow) h += `<button class="linkbtn center" data-act="imp-smore">Show ${Math.min(50, order.length - imp.sessShow)} more (${order.length - imp.sessShow} left)</button>`;
  }
  h += `<div class="cta"><div class="row2"><button class="btn ghost" data-act="imp-cancel">Start over</button><button class="btn" data-act="imp-save" style="--c:var(--up)" ${sel.length ? '' : 'disabled'}>Import ${sel.length} session${sel.length === 1 ? '' : 's'}</button></div></div>`;
  return {
    title: 'Review import', sub: esc(imp.source), back: 'more', html: h, color: 'legsb',
    after: root => root.querySelector('#imp-q')?.addEventListener('input', ev => {
      const q = ev.target.value.trim().toLowerCase();
      for (const li of root.querySelectorAll('#imp-gl li[data-q]')) li.hidden = q ? !li.dataset.q.includes(q) : li.hasAttribute('data-more');
      const more = root.querySelector('#imp-gmore');
      if (more) more.hidden = !!q;
    }),
  };
}

// How numbers in the files are read: kilos or pounds, day or month first. Kept while the app is open.
const impOpt = { lb: null, order: 'auto' };
const impLb = () => (impOpt.lb ?? getUnits() === 'lb');
function impOptions() {
  return `<div class="box pad stack impopts"><div class="rrow"><span>Weights in the logs</span><div class="seg" role="group" aria-label="Weights in the logs">${[['kg', 'kg'], ['lb', 'lb']].map(([v, l]) => `<button data-act="imp-opt" data-f="lb" data-v="${v}" aria-pressed="${(v === 'lb') === impLb()}">${l}</button>`).join('')}</div></div>
    <div class="rrow"><span>Dates like 3/4</span><div class="seg" role="group" aria-label="Date order">${[['auto', 'Auto'], ['dmy', orderLabel('dmy')], ['mdy', orderLabel('mdy')]].map(([v, l]) => `<button data-act="imp-opt" data-f="order" data-v="${v}" aria-pressed="${impOpt.order === v}">${l}</button>`).join('')}</div></div>
    <p class="fine">Pounds are converted to kg. "lb" or "kg" written in the log always wins. Auto reads dates day first unless the file can only be month first (like 9/21/2026).</p></div>`;
}
/** The two readings of "3/4" as dates in the app's language: 3 April (day first) and March 4 (month first). */
function orderLabel(order) {
  const cjk = /^(zh|ja)/.test(getLang());
  if (order === 'dmy') return fmtDate('2026-04-03') + (cjk ? '（日/月）' : '');
  return cjk ? fmtDate('2026-03-04') + '（月/日）' : `${MONTHS[2]} 4`;
}
const EQ_LABEL = { db: 'Dumbbells', barbell: 'Barbell', smith: 'Smith', machine: 'Machine', cable: 'Cable', bw: 'Bodyweight' };
/** One line for a new exercise's guessed set-up: "Barbell · kg total · Glutes". */
const metaTxt = m => `${EQ_LABEL[m.equip] || m.equip} · ${unitLong(m.unit)} · ${m.muscles[0] || 'muscle not set'}`;
/** Sheet to set a new exercise's equipment and main muscle before it's saved. onSet() repaints. */
function metaSheet(title, m, act, key) {
  const chips = (f, list, on) => `<div class="chips" role="group" aria-label="${f === 'equip' ? 'Equipment' : 'Main muscle'}">${list.map(([v, l]) => `<button class="mini" data-act="${act}" data-k="${esc(key)}" data-f="${f}" data-v="${esc(v)}" aria-pressed="${on(v)}">${esc(l)}</button>`).join('')}</div>`;
  const html = `<div class="metas"><h2 class="sh-title" tabindex="-1" autofocus>${esc(title)}</h2><p class="sh-body">New exercise. Check how it's set up; change more later under More → Exercises.</p>
    <p class="lbl">Equipment</p>${chips('equip', Object.entries(EQ_LABEL), v => m.equip === v)}
    <p class="fine">Logged as ${esc(unitLong(m.unit))}.</p>
    <p class="lbl">Main muscle</p>${chips('muscle', MUSCLES.map(x => [x, x]), v => m.muscles[0] === v)}
    <button class="btn" data-act="sheet-close">Done</button></div>`;
  const cur = document.querySelector('.scrim .metas');
  if (cur) cur.outerHTML = html; else openSheet(html, { label: title });
}
/** Apply one tap from metaSheet to a guessed set-up. */
function setMeta(m, f, v) {
  if (f === 'equip') {
    m.equip = v;
    m.unit = (v === 'machine' || v === 'cable') && ['kg', 'L'].includes(m.unit) ? m.unit : EQUIP_UNIT[v];
    m.perGym = v === 'machine' || v === 'cable';
    m.inc = m.unit === 'L' ? 1 : v === 'machine' ? 5 : v === 'db' ? 2 : 2.5;
  } else m.muscles = [v, ...m.muscles.filter(x => x !== v)].slice(0, 3);
}

/** Sheet to choose what one imported lift becomes: an existing exercise, a new one, or nothing. */
function impPicker(gi) {
  const g = imp.groups[gi], prog = progIds();
  const sugg = [];
  for (const n of g.variants) for (const x of S.exercises) { const m = matchExercise(n, [x], { prefer: prog, unit: g.unit }); if (m && !sugg.some(s => s.ex.id === x.id)) sugg.push(m); }
  sugg.sort((a, b) => b.score - a.score);
  const top = sugg.slice(0, 4).map(m => m.ex);
  // Nothing close enough to suggest outright: offer exercises that share a word ("Egyptian raises" -> lateral raises).
  if (top.length < 4) {
    const loose = S.exercises.filter(x => !top.includes(x)).map(x => ({ x, n: Math.max(...g.variants.map(v => nameOverlap(v, x.name))) + (prog.has(x.id) ? 0.5 : 0) })).filter(o => o.n >= 1).sort((a, b) => b.n - a.n);
    top.push(...loose.slice(0, 4 - top.length).map(o => o.x));
  }
  const row = (id, t, sub, x = null) => `<li data-name="${esc(x ? searchText(x) : t.toLowerCase())}"><button data-act="imp-pick" data-g="${gi}" data-id="${esc(id)}" ${g.target === id ? 'aria-current="true"' : ''}><b>${esc(t)}</b><small>${esc(sub)}</small></button></li>`;
  const exRow = x => row(x.id, x.name, `${(x.muscles || []).slice(0, 2).join(', ') || 'No muscles set'} · ${unitLong(x)}${prog.has(x.id) ? ' · in programme' : ''}`, x);
  const el = openSheet(`<h2 class="sh-title" tabindex="-1" autofocus>${esc(g.label)}</h2>
    <p class="sh-body">${g.sess} session${g.sess === 1 ? '' : 's'} · ${plural(g.sets, 'set')}${g.variants.length > 1 ? ` · also written ${g.variants.slice(1, 5).map(v => `“${esc(v)}”`).join(', ')}${g.variants.length > 5 ? '…' : ''}` : ''}</p>
    <ul class="picklist">${row('', 'Add as a new exercise', `Named “${g.label}” · ${g.meta ? metaTxt(g.meta) : ''}`)}${top.map(exRow).join('')}${row('skip', "Don't import this lift", 'Its sets are left out')}</ul>
    ${g.meta ? `<button class="btn ghost" data-act="imp-meta-open" data-g="${gi}">Set up the new exercise (equipment, main muscle)</button>` : ''}
    <input class="inp" id="imp-pq" type="search" placeholder="Search all ${S.exercises.length} exercises" aria-label="Search exercises" autocomplete="off">
    <ul class="picklist" id="imp-pl">${S.exercises.filter(x => !top.includes(x)).map(exRow).join('')}</ul>`, { label: `Match ${g.label}` });
  el.querySelector('#imp-pq').addEventListener('input', ev => searchList(el, ev.target.value, '#imp-pl li'));
}

// ---- settings --------------------------------------------------------------------------------------------
const themeNow = () => document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
/** App colours: the presets, then your own. Each swatch shows the background and cards of the theme on screen. */
function paletteRow(st) {
  const mode = themeNow(), mine = st.appPalette === 'mine' && okMine(st.myPalette);
  const cur = mine ? 'mine' : Object.hasOwn(PALETTES, st.appPalette) ? st.appPalette : 'default';
  const sw = (id, name, s) => `<button class="palsw" data-act="st-palette" data-v="${id}" aria-pressed="${cur === id}"><i aria-hidden="true" style="background:${s[0]}"><b style="background:${s[1]}"></b></i><span>${name}</span></button>`;
  const own = okMine(st.myPalette) ? paletteFor({ appPalette: 'mine', myPalette: st.myPalette }) : paletteFor(st);
  const pick = (i, label) => `<label class="rrow"><span>${label}</span><input type="color" data-input="st-mine" data-i="${i}" value="${st.myPalette[mode][i].toLowerCase()}"></label>`;
  return `<div class="stack"><span class="lbl">Colours</span><div class="pals" role="group" aria-label="Colours">
    ${Object.entries(PALETTES).map(([id, p]) => sw(id, p.name, p[mode])).join('')}${sw('mine', 'Mine', own[mode])}</div>
    ${mine ? `${pick(0, 'Background')}${pick(1, 'Cards')}<p class="fine">${mode === 'dark' ? 'These are for the dark theme. Switch the theme to Light to set its colours too.' : 'These are for the light theme. Switch the theme to Dark to set its colours too.'} Text stays readable on whatever you pick.</p>` : ''}</div>`;
}
function settings() {
  const st = S.settings;
  const tg = (f, title, sub) => `<label class="toggle"><input type="checkbox" id="st-${f}" data-input="st-toggle" data-f="${f}" ${st[f] ? 'checked' : ''}><span><b>${title}</b><small>${sub}</small></span></label>`;
  const seg = (label, act, cur, opts) => `<div class="rrow"><span>${label}</span><div class="seg" role="group" data-ctx="${act}" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div></div>`;
  const wording = st.wording || (st.setupAnswers?.experience === 'experienced' ? 'expert' : 'plain');
  const u = getUnits();
  const en = getLang() === 'en';
  const h = `<div class="box pad stack">${langPicker(getLang(), LANGS)}
      ${seg('Theme', 'theme', st.theme, [['system', 'Auto'], ['dark', 'Dark'], ['light', 'Light']])}
      ${paletteRow(st)}
      ${seg('Weights', 'st-units', st.units === 'lb' ? 'lb' : 'kg', [['kg', 'kg'], ['lb', 'lb']])}
      ${seg('Text size', 'st-text', st.textSize || 'normal', [['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']])}
      ${en ? seg('Words', 'st-wording', wording, [['plain', 'Plain'], ['expert', 'Gym terms']]) : ''}
      <p class="fine">${!en ? '' : wording === 'expert' ? 'Gym terms: RIR, e1RM, calibrate, deload. ' : 'Plain words: “reps left” instead of RIR, “find your weight” instead of calibrate. '}Weights are always stored in kg, so switching units never changes your history.</p></div>
    <div class="box pad stack">
      ${tg('timerSound', 'Rest timer sound', 'Two short beeps when rest is over')}
      ${tg('timerVibrate', 'Rest timer vibration', 'Buzz when rest is over')}
      ${tg('restNotify', 'Notify when rest is over', 'A notification if the app is in the background or the screen is off. Some phones pause web apps after a while, so it can arrive late')}
      ${tg('wakeLock', 'Keep screen on during workouts', 'So you can glance at the next set')}
      ${seg('New day starts at', 'st-daystart', String(st.dayStart || 0), [['0', 'Midnight'], ['3', '3:00'], ['5', '5:00']])}
      <p class="fine">For night shifts: a workout after midnight counts for the day before.</p>
    </div>
    <div class="box pad stack">
      <label class="toggle"><input type="checkbox" id="st-pause" data-input="st-pause" ${(st.streakPauses || []).some(p => !p.to) ? 'checked' : ''}><span><b>Pause my streak</b><small>Travel, illness, Ramadan or a busy stretch: weeks while paused never count against it</small></span></label>
    </div>
    <div class="box pad stack">
      <p class="lbl">Training reminders</p>
      ${globalThis.gimNative ? `${tg('trainingReminders', 'Workout notifications', 'Optional reminders on your planned training days. Each app visit schedules the next four weeks. Android may delay delivery while saving battery.')}
      <label class="field"><span>Notification message (optional)</span><input class="inp" maxlength="180" data-input="st-reminder-text" value="${esc(st.trainingReminderText || '')}" placeholder="Use a varied reminder"></label>` : ''}
      <button class="btn ghost" data-act="reminder-write">Write or share a gym reminder</button>
      <p class="fine">Adds your training days to your phone's calendar, which reminds you 10 minutes before. Works even when the app is closed. Nothing is sent anywhere.</p>
      <div class="rrow"><label for="st-remind">Reminder time</label><input class="inp sm" id="st-remind" type="time" value="${esc(st.remindAt || '18:00')}" data-input="st-remind"></div>
      <button class="btn ghost" data-act="cal-export">${ICON.clock || ''} Add training days to my calendar</button>
      <label class="toggle"><input type="checkbox" id="st-game" data-input="st-game" ${st.gamify === false ? '' : 'checked'}><span><b>Streaks, quests and badges</b><small>Turn off for a plain log: no streak, daily quests or badges. Levels and your progress stay</small></span></label>
      <label class="toggle"><input type="checkbox" id="st-missed" data-input="st-missed" ${st.missedReminders === false ? '' : 'checked'}><span><b>Missed-workout reminders</b><small>Offer to do a missed day today. Turn off if you train on whatever days suit you</small></span></label>
      ${seg('Warm-up sets', 'st-warm', st.autoWarmup === true ? 'all' : st.autoWarmup === 'barbell' ? 'barbell' : 'off', [['off', 'Off'], ['barbell', 'Barbell'], ['all', 'All lifts']])}
      <p class="fine">Ramp-up sets added before your first working set. Barbell: only barbell and Smith lifts, with plates per side shown for each.</p></div>
    <div class="box pad stack"><div class="row2"><label class="field"><span>Goal body weight (${u}, optional)</span><input class="inp" id="st-goal" type="text" inputmode="decimal" autocomplete="off" step="0.5" placeholder="Not set" value="${st.goalKg == null ? '' : esc(toDisp(st.goalKg))}"></label>
      <label class="field"><span>Height (cm, optional)</span><input class="inp" id="st-height" type="number" inputmode="numeric" placeholder="Not set" value="${st.heightCm == null ? '' : esc(st.heightCm)}"></label></div>
      <button class="btn ghost" data-act="st-save">Save</button></div>
    <div class="row2"><button class="btn ghost" data-act="check-update">Check for updates</button><a class="btn ghost" href="#/setup">Rebuild my split</a></div>
    <button class="btn ghost" data-act="tour">Replay the quick tour</button>
    <div class="list box">
      <button class="li mrow" data-act="data-kept" style="--k:var(--up)"><i class="mic">${ICON.save}</i><span><b>How your data is kept</b><small>Where your workouts live, and what can delete them</small></span>${ICON.chev}</button>
      <button class="li mrow" data-act="net-check" style="--k:var(--upper)"><i class="mic">${ICON.check}</i><span><b>Check it yourself</b><small>Every website this page has contacted since it opened</small></span>${ICON.chev}</button>
    </div>
    <section class="box pad about"><p class="lbl">About and legal</p>
      <p><b>Not medical advice.</b> Suggestions are general training guidance from your own logs. Stop and see a doctor for chest pain, fainting, unusual breathlessness, palpitations, numbness, or sharp or radiating pain.</p>
      <p><b>Privacy.</b> No accounts, analytics or trackers. Your workouts stay on this phone; nobody else can see them. Feedback you choose to send goes to the developer. The privacy page lists the few other times the app goes online.</p>
      <p><b>Credits.</b> Fonts: Barlow Condensed and DM Sans (SIL Open Font License). PDF import: pdf.js by Mozilla (Apache 2.0).</p>
      <p>3D view: three.js (MIT). 3D muscle model: Z-Anatomy, from BodyParts3D (© The Database Center for Life Science), adapted by the FitMitWith anatomy atlas, CC BY-SA 4.0. Details in anatomy/ATTRIBUTION.txt.</p>
      <p class="links"><a href="privacy.html" target="_blank" rel="noopener">Privacy</a> · <a href="terms.html" target="_blank" rel="noopener">Terms of use</a> · <a href="https://github.com/fir1412/we-go-gim/blob/main/LICENSE" target="_blank" rel="noopener">License (MIT)</a> · <a href="https://github.com/fir1412/we-go-gim/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">Notices</a></p></section>
    <p class="fine"><a href="https://github.com/fir1412/we-go-gim/commits/main" target="_blank" rel="noopener">Every change, with its code</a></p>
    <p class="fine">we go gim ${APP_VERSION}. Heart-rate and weight sync with Health Connect needs the Android app wrapper; for now, log them here.</p>`;
  return { title: 'Settings', sub: 'Make it yours', back: 'more', html: h, color: 'rest' };
}


// ---- help ----------------------------------------------------------------------------------------------------
const FAQ = [
  ['Why is it free? Who makes it?', 'It is a free, open-source hobby project by one developer, fir1412, with no ads, no account and nothing to sell. The code is public on GitHub, so anyone can check that the app never uploads your workouts. Contact: fir1412dev@gmail.com.'],
  ['Is there a watch app?', 'Not yet. Heart-rate and weight sync with Health Connect needs the Android app, which is not out yet. For now, log them here.'],
  ['Does it work with a screen reader?', 'Buttons and controls are labelled, changes are announced, and text goes up to extra large (More → Settings, or on the welcome screen). It has not been tested with every screen reader, so tell us through Send feedback if something can’t be reached.'],
  ['Can I use it on two phones?', 'Not at the same time: there is no cloud copy, on purpose. To move, back up on one phone and restore on the other. Using two, like a phone and an iPad? Restore with Merge to combine them without losing either side.'],
  ['How do I start a workout?', 'Open Today and tap the Start button at the bottom. Every set is filled in from your last session. Do the set, then tap the tick.'],
  ['What do the coloured tags mean?', 'They say what changed since last time: +1 rep, a heavier weight, find your weight (a new lift), or an easy day. Tap the tag during a workout to see why.'],
  ['What weight should I use for a new exercise?', 'Tap Light, Medium or Heavy on the new lift and a starting weight is filled in. Pick one you could do for the target reps with about 2 reps to spare. Next time builds on it.'],
  ['How does the app decide my weights?', 'Each exercise keeps its weight and adds a rep per set until every set hits the top of its range, then adds the smallest step. Poor sleep or pain holds the weight the same. Tap 3+ reps left on the last set and it goes up faster: weight straight away, or a double step at the top of the range.'],
  ['How do I change my split or plan?', 'More → Programme. Tap a day to add, remove or reorder exercises. Drag a day by its handle to move it up or down the week. You can also pick a ready-made plan, paste your own, or rebuild it with the questions.'],
  ['Can I keep more than one plan?', 'Yes. More → Programme → My templates. Save as template keeps a copy of your week; New template builds a plan without changing the one you train with. Tap a template to use, edit or delete it. Templates are in your backup file.'],
  ['How do I do a superset?', 'In a workout, tap ⋮ on an exercise and choose Pair with the next exercise. The rest timer then runs after both.'],
  ['Can I log cardio?', 'Yes. Tap Add cardio in a workout, or open Progress → Cardio this week for cardio on its own.'],
  ['I missed a workout. What now?', 'Today offers to do the missed day today or skip it. Either way your plan carries on; nothing breaks.'],
  ['How do I switch between kg and lb?', 'More → Settings → Weights. Your history is stored in kg, so switching never changes it.'],
  ['What is RIR / reps left?', 'How many more reps you could have done before failing. 2 reps left means you had 2 more in you. Most sets should end with 1 to 3 left.'],
  ['What is a deload or lighter week?', 'A week with about half the sets and a bit less weight, to recover. The app suggests one when several lifts stall or you log poor sleep, low energy or pain.'],
  ['How do I back up my data?', 'More → Backup and export → Share backup. Save the file to Drive or send it to yourself. Restore it on any phone from the same screen.'],
  ['How do I move to a new phone?', 'Back up on the old phone, open the app on the new one, and choose Restore from backup. Everything comes across: sessions, programme and settings.'],
  ['Where is my data stored?', 'Only on this phone. There are no accounts and nothing is uploaded, which is why backups matter.'],
  ['How do I install the app?', 'Android: More → Install the app, or the browser menu → Add to Home screen. iPhone: Share → Add to Home Screen in Safari.'],
  ['How do I change a day\'s colour?', 'More → Programme → tap a day → tap the colour dot. Pick a quick colour, any colour from the colour wheel, or type a hex code like #3FA7D6.'],
  ['Can I import from Hevy, Strong or other apps?', 'Yes. Export a CSV from the app, then More → Import old logs → Choose files. Notes, WhatsApp chats, Notion or Evernote exports, PDFs and spreadsheets saved as CSV work too.'],
  ['I train on different days each week. Can I stop the missed-workout banner?', 'Yes: More → Settings → Missed-workout reminders.'],
  ['What are levels and XP?', 'XP means experience points. Every set you finish gives points to the muscles it works, and beating your best gives extra. More points take a muscle to a higher level. See them in Progress → Levels.'],
];
function help() {
  let h = `<input class="inp" id="faqsearch" type="search" placeholder="Search help, e.g. superset, backup, kg" autocomplete="off" aria-label="Search help">
    <div class="box faq" id="faqlist">${FAQ.map(([q, a]) => `<details data-q="${esc((q + ' ' + a).toLowerCase())}"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>
    <p class="fine" id="faqnone" hidden>Nothing matches. Try another word, or send feedback below.</p>
    <div class="row2"><button class="btn ghost" data-act="tour">Replay the tour</button><button class="btn ghost" data-act="feedback">Ask a question</button></div>`;
  return {
    title: 'Help', sub: 'How do I…?', back: 'more', html: h, color: 'legs',
    after: root => root.querySelector('#faqsearch').addEventListener('input', ev => {
      const q = ev.target.value.trim().toLowerCase();
      let n = 0;
      for (const d of root.querySelectorAll('#faqlist details')) { const hit = !q || q.split(/\s+/).every(w => d.dataset.q.includes(w)); d.hidden = !hit; if (hit) n++; if (q && hit && n === 1) d.open = true; }
      root.querySelector('#faqnone').hidden = n > 0;
    }),
  };
}

// ---- actions -----------------------------------------------------------------------------------------------
const num = (v, d = null) => (v === '' || v == null || !isFinite(+v) ? d : +v);
async function markBackup() { if (S.settings.lastBackup !== todayIso()) await saveSettings({ lastBackup: todayIso() }); }
const backupName = () => `wegogim-backup-${todayIso()}.json`;

export const actions = {
  'reminder-write'() {
    openSheet(`<h2>A gym reminder, in your words</h2><p class="fine">Edit this draft, then copy it or choose an app to share it.</p><label class="field"><span>Message</span><textarea class="inp" id="gym-reminder-message" maxlength="1000">${esc(reminderText())}</textarea></label><div class="row2"><button class="btn ghost" data-act="reminder-shuffle">Another idea</button><button class="btn ghost" data-act="reminder-copy">Copy message</button></div><button class="btn" data-act="reminder-share">Choose where to share</button>`);
  },
  'reminder-shuffle'() { const field = document.getElementById('gym-reminder-message'); if (field) field.value = reminderText(); },
  async 'reminder-copy'() { const text = document.getElementById('gym-reminder-message')?.value.trim(); if (!text) return toast('Write a message first', 'flat'); await navigator.clipboard.writeText(text); toast('Message copied', 'up'); },
  async 'reminder-share'() {
    const text = document.getElementById('gym-reminder-message')?.value.trim();
    if (!text) return toast('Write a message first', 'flat');
    if (globalThis.gimNative) await globalThis.gimNative.shareText(text);
    else if (navigator.share) await navigator.share({ title: 'we go gim', text });
    else { await navigator.clipboard.writeText(text); toast('Message copied. Paste it into your chosen app.', 'up'); }
  },
  async 'mus-fix'(el) { const x = S.exById[el.dataset.id]; if (x) await saveExercise({ ...x, muscles: guessMuscles(x.name), musclesKept: true }); },
  async 'mus-keep'(el) { const x = S.exById[el.dataset.id]; if (x) await saveExercise({ ...x, musclesKept: true }); },
  async 'mus-fix-all'() { for (const { x, g } of muscleRechecks()) await saveExercise({ ...x, muscles: g, musclesKept: true }); toast('Muscles updated', 'up'); },
  'setup-hide': () => saveSettings({ hideSetup: true }),
  install() { promptInstall(); },
  'sheet-close': () => closeSheet(),
  // programme
  'p-open'(el) { const d = +el.dataset.dow; openDays.has(d) ? openDays.delete(d) : openDays.add(d); refresh(); },
  async 'p-day'(el) {
    const di = +el.dataset.d, f = el.dataset.f, v = el.value.trim();
    if (f === 'name' && !v) { toast('A day needs a name', 'down'); return refresh(); }
    await editProgram(p => { if (p.days[di][f] === v) return false; p.days[di][f] = v; });
  },
  'p-slot'(el) { slotSheet(+el.dataset.d, +el.dataset.s); },
  async 'p-step'(el) {
    const di = +el.dataset.d, si = +el.dataset.s, f = el.dataset.f, dv = +el.dataset.v;
    await editProgram(p => {
      const s = p.days[di].slots[si];
      const lim = f === 'sets' ? [1, 10] : [1, 50];
      const v = Math.min(lim[1], Math.max(lim[0], (+s[f] || 0) + dv));
      if (v === s[f]) return false;
      s[f] = v;
      // Keep the range the right way round.
      if (f === 'lo' && s.hi < v) s.hi = v;
      if (f === 'hi' && s.lo > v) s.lo = v;
    });
    slotSheet(di, si);
  },
  async 'p-note'(el) {
    const di = +el.dataset.d, si = +el.dataset.s, v = el.value.trim().slice(0, 80);
    await editProgram(p => { const s = p.days[di].slots[si]; if (!s || (s.note || '') === v) return false; if (v) s.note = v; else delete s.note; });
  },
  async 'p-grp'(el) {
    const di = +el.dataset.d, si = +el.dataset.s;
    await editProgram(p => { p.days[di].slots[si].group = el.dataset.v; });
    slotSheet(di, si);
  },
  async 'p-move'(el) {
    const di = +el.dataset.d, i = +el.dataset.s, j = i + +el.dataset.v;
    await editProgram(p => { const a = p.days[di].slots; if (j < 0 || j >= a.length) return false; [a[i], a[j]] = [a[j], a[i]]; });
    slotSheet(di, Math.max(0, Math.min(j, P().days[di].slots.length - 1)));
  },
  async 'p-del'(el) {
    const di = +el.dataset.d, si = +el.dataset.s;
    const name = S.exById[P().days[di].slots[si]?.exId]?.name || 'Exercise';
    closeSheet();
    await editProgram(p => { p.days[di].slots.splice(si, 1); });
    toast(`${name} removed. "Undo changes" puts it back.`);
  },
  'p-swap'(el) {
    const di = +el.dataset.d, si = +el.dataset.s;
    pickExercise('Swap for…', async id => {
      await editProgram(p => { p.days[di].slots[si].exId = id; });
      slotSheet(di, si);
    }, P().days[di].slots[si]?.exId);
  },
  'p-add'(el) {
    const di = +el.dataset.d;
    pickExercise(`Add to ${P().days[di].name}`, async id => {
      await editProgram(p => {
        const d = p.days[di];
        if (!d.slots.length && /^rest$/i.test(d.name)) Object.assign(d, { name: 'Workout', sub: '', color: d.color === 'rest' ? 'push' : d.color });
        d.slots.push({ exId: id, sets: 3, lo: 8, hi: 12, group: '' });
      });
      slotSheet(di, P().days[di].slots.length - 1);
    });
  },
  // Any colour: quick picks, the phone's full colour picker, or a hex code typed in.
  'p-color'(el) {
    const d = +el.dataset.d, day = P().days[d], cur = hexOf(day.color);
    const sheet = openSheet(`<h2 class="sh-title">Colour for ${esc(day.name)}</h2>
      <div class="colprev" id="col-prev" style="--k:${cur}"><b>${esc(day.name)}</b><span id="col-hexlbl">${cur.toUpperCase()}</span></div>
      <p class="lbl">Quick picks</p>
      <div class="chips">${COLORS.filter(c => c !== 'rest').map(c => `<button class="sw big" data-act="p-color-set" data-d="${d}" data-v="${c}" style="${kstyle(c)}" aria-label="${c} (${hexOf(c)})" aria-pressed="${day.color === c}"></button>`).join('')}</div>
      <p class="lbl">Any colour</p>
      <div class="colrow"><input type="color" id="col-pick" value="${cur}" aria-label="Pick any colour">
        <label class="field grow"><span>Hex code</span><input class="inp mono" id="col-hex" value="${cur.toUpperCase()}" maxlength="7" autocomplete="off" spellcheck="false" placeholder="#3FA7D6"></label></div>
      <button class="btn" data-act="p-color-custom" data-d="${d}">Use this colour</button>`, { label: 'Pick a colour' });
    const pick = sheet.querySelector('#col-pick'), hex = sheet.querySelector('#col-hex'), prev = sheet.querySelector('#col-prev'), lbl = sheet.querySelector('#col-hexlbl');
    const show = v => { prev.style.setProperty('--k', v); lbl.textContent = v.toUpperCase(); };
    pick.addEventListener('input', () => { hex.value = pick.value.toUpperCase(); show(pick.value); });
    hex.addEventListener('input', () => {
      let v = hex.value.trim(); if (v && v[0] !== '#') v = '#' + v;
      const m = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i); if (m) v = `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
      hex.classList.toggle('bad', !isHex(v));
      if (isHex(v)) { pick.value = v.toLowerCase(); show(v); }
    });
  },
  async 'p-color-set'(el) { closeSheet(); await editProgram(p => { p.days[+el.dataset.d].color = el.dataset.v; }); },
  async 'p-color-custom'(el) {
    let v = (document.getElementById('col-hex')?.value || '').trim();
    if (v && v[0] !== '#') v = '#' + v;
    const m = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i); if (m) v = `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
    if (!isHex(v)) return toast('Enter a hex code like #3FA7D6', 'flat');
    closeSheet();
    await editProgram(p => { p.days[+el.dataset.d].color = v.toLowerCase(); });
    toast(`Colour set to ${v.toUpperCase()}`, 'up');
  },
  // Move a day's workout to another weekday: the two days trade places (a rest day just swaps in).
  'p-moveday'(el) {
    const from = +el.dataset.dow, src = P().days.find(d => d.dow === from);
    const rows = DOW_ORDER.filter(d => d !== from).map(dow => {
      const d = P().days.find(x => x.dow === dow);
      const what = d?.slots.length ? `swap with ${esc(d.name)}` : 'rest day';
      return `<button class="li" data-act="p-moveday-to" data-from="${from}" data-to="${dow}" style="${kstyle(d?.color || 'rest')}"><i class="sw"></i><span><b>${dowName(dow, true)}</b><small>${what}</small></span>${ICON.chev}</button>`;
    }).join('');
    openSheet(`<h2 class="sh-title">Move ${esc(src.name)} to…</h2><p class="sh-body">The two days trade places. Your logged sessions don't change.</p><div class="list box">${rows}</div>`, { label: `Move ${src.name}` });
  },
  async 'p-moveday-to'(el) {
    const from = +el.dataset.from, to = +el.dataset.to;
    const a = P().days.find(d => d.dow === from), b = P().days.find(d => d.dow === to);
    const aName = a.name, bName = b?.slots.length ? b.name : null;
    closeSheet();
    await editProgram(p => {
      const x = p.days.find(d => d.dow === from);
      let y = p.days.find(d => d.dow === to);
      if (!y) { y = { dow: to, name: 'Rest', sub: '', color: 'rest', slots: [] }; p.days.push(y); }
      for (const k of ['name', 'sub', 'color', 'slots']) [x[k], y[k]] = [y[k], x[k]];
    });
    openDays.clear(); openDays.add(to);
    toast(bName ? `${aName} is now on ${dowName(to, true)}, ${bName} on ${dowName(from, true)}` : `${aName} moved to ${dowName(to, true)}. ${dowName(from, true)} is now a rest day.`, 'up');
  },
  async 'p-undo'() {
    const orig = pOrigs.get(tplId || '');
    if (!orig) return;
    await editProgram(p => { p.days = structuredClone(orig.days); });
    toast(tplId ? 'Template put back as it was' : 'Programme put back as it was', 'up');
  },
  // My templates
  't-open'(el) {
    const t = tplOf(el.dataset.id);
    if (!t) return;
    openSheet(`<h2 class="sh-title">${esc(t.name)}</h2>${t.saved ? `<p class="fine">Saved ${fmtDate(t.saved, { year: true })}</p>` : ''}${tdays(t.program)}
      <button class="btn" data-act="t-use" data-id="${esc(t.id)}">Use this template</button>
      <div class="row2"><a class="btn ghost" href="#/program/t/${encodeURIComponent(t.id)}">Edit</a><button class="btn ghost danger-t" data-act="t-del" data-id="${esc(t.id)}">Delete</button></div>`, { label: t.name });
  },
  't-save'() {
    if (myTemplates().length >= MAX_TEMPLATES) return toast(`You can keep up to ${MAX_TEMPLATES} templates. Delete one first.`, 'flat');
    const same = myTemplates().find(t => sameWeek(t.program, S.program));
    openSheet(`<h2 class="sh-title">Save as template</h2><p class="sh-body">Keeps a copy of this week's split: days, exercises, sets and rep ranges.${same ? ` It matches ${esc(same.name)} right now.` : ''}</p>
      <label class="field"><span>Name</span><input class="inp" id="t-name" value="${esc(nextTplName())}" maxlength="40" enterkeyhint="done"></label>
      <div class="row2"><button class="btn ghost" data-act="sheet-close">Cancel</button><button class="btn" data-act="t-save-go">Save</button></div>`, { label: 'Save as template' });
    document.getElementById('t-name')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); actions['t-save-go'](); } });
  },
  async 't-save-go'() {
    const name = cleanText(document.getElementById('t-name')?.value || '', 40);
    if (!name) return toast('Give the template a name', 'down');
    const old = myTemplates().find(t => t.name.toLowerCase() === name.toLowerCase());
    closeSheet();
    if (old) {
      if (!(await confirmSheet({ title: `Replace ${old.name}?`, body: 'A template with this name exists. Its week is replaced with your current programme.', ok: 'Replace' }))) return;
      await saveTemplate(old.id, { program: cleanWeek(structuredClone(S.program)), saved: todayIso() });
    } else await addTemplate(name, S.program);
    toast(`Saved as ${name}. Find it under My templates.`, 'up');
  },
  't-new'() {
    if (myTemplates().length >= MAX_TEMPLATES) return toast(`You can keep up to ${MAX_TEMPLATES} templates. Delete one first.`, 'flat');
    openSheet(`<h2 class="sh-title">New template</h2><p class="sh-body">Build a plan here without changing the programme you train with. Use it when it's ready.</p>
      <label class="field"><span>Name</span><input class="inp" id="t-name" value="${esc(nextTplName())}" maxlength="40" enterkeyhint="done"></label>
      <div class="list box"><button class="li" data-act="t-new-go" data-from="blank"><span class="grow"><b>Start with an empty week</b><small>Seven rest days to fill in</small></span>${ICON.chev}</button>
      <button class="li" data-act="t-new-go" data-from="copy"><span class="grow"><b>Start from a copy of my programme</b><small>Change what you like; your programme stays as it is</small></span>${ICON.chev}</button></div>`, { label: 'New template' });
  },
  async 't-new-go'(el) {
    const name = cleanText(document.getElementById('t-name')?.value || '', 40) || nextTplName();
    const t = await addTemplate(name, el.dataset.from === 'copy' ? S.program : blankWeek());
    closeSheet();
    go('program/t/' + encodeURIComponent(t.id));
  },
  async 't-rename'(el) {
    const t = tplOf(tplId), v = cleanText(el.value, 40);
    if (!t) return;
    if (!v) { toast('A template needs a name', 'down'); return refresh(); }
    if (v !== t.name) await saveTemplate(t.id, { name: v });
  },
  async 't-use'(el) {
    const t = tplOf(el.dataset.id);
    if (!t) return;
    closeSheet();
    const kept = sameWeek(t.program, S.program) || myTemplates().some(x => sameWeek(x.program, S.program)) || !trainDays(S.program).length;
    const how = await confirmSheet({ title: `Use ${t.name}?`, body: `Your programme becomes this template's week. Logged sessions, levels and bests stay.${kept ? '' : ' <b>Your current week isn\'t saved as a template.</b>'}`, ok: kept ? 'Use this template' : 'Use without saving', alt: kept ? null : 'Save my current week first' });
    if (!how) return;
    if (how === 'alt') {
      if (myTemplates().length >= MAX_TEMPLATES) return toast(`You can keep up to ${MAX_TEMPLATES} templates. Delete one first.`, 'flat');
      await addTemplate(`Before ${t.name}`.slice(0, 40), S.program);
    }
    // Exercises deleted since the template was saved are left out.
    const week = structuredClone(t.program);
    for (const d of week.days) d.slots = d.slots.filter(s => S.exById[s.exId]);
    await saveProgram(week);
    pOrigs.delete('');
    go('program');
    toast(`${t.name} is now your programme${how === 'alt' ? '. Your old week is under My templates' : ''}.`, 'up');
  },
  async 't-del'(el) {
    const t = tplOf(el.dataset.id);
    if (!t) return;
    closeSheet();
    if (!(await confirmSheet({ title: `Delete ${t.name}?`, body: 'Only the template is deleted. Your programme and logged sessions stay.', ok: 'Delete', danger: true }))) return;
    await saveSettings({ templates: myTemplates().filter(x => x.id !== t.id) });
    pOrigs.delete(t.id);
    if (tplId === t.id) go('program');
    toast('Template deleted');
  },
  // exercise editor
  ed(el) {
    const f = el.dataset.f;
    if (f === 'perGym') ed.perGym = el.checked;
    else if (f === 'rest') ed.rest = num(el.value, ed.rest);
    else if (f === 'inc') { const v = num(el.value, toDisp(ed.inc, ed)); ed.inc = ed.unit === 'L' ? v : v === toDisp(ed.inc, ed) ? ed.inc : fromDisp(v, ed); }
    else ed[f] = el.value.trim();
    if (f === 'name' && ed._auto && ed.name) { autoFill(); refresh(); }
  },
  'ed-set'(el) {
    keepEd();
    delete ed._auto;
    ed[el.dataset.f] = el.dataset.v;
    if (el.dataset.f === 'unit') delete ed.unitUnclear;
    if (el.dataset.f === 'equip') {
      const v = el.dataset.v;
      ed.perGym = ['machine', 'cable'].includes(v);
      // Machines and cables can use kilos or pin levels; everything else has one way to log it.
      ed.unit = (v === 'machine' || v === 'cable') && ['kg', 'L'].includes(ed.unit) ? ed.unit : EQUIP_UNIT[v] || ed.unit;
    }
    refresh();
  },
  'ed-muscle'(el) {
    keepEd();
    delete ed._auto;
    const m = el.dataset.v, a = ed.muscles || (ed.muscles = []);
    const i = a.indexOf(m);
    i >= 0 ? a.splice(i, 1) : a.push(m);
    refresh();
  },
  async 'ed-save'() {
    keepEd();
    if (!ed.name) return toast('Give the exercise a name', 'down');
    if (!ed.muscles?.length) return toast('Pick at least one muscle', 'down');
    if (!(ed.inc > 0)) return toast('Weight jump must be above 0', 'down');
    if (ed.inc > (ed.unit === 'L' ? 10 : 50)) return toast(ed.unit === 'L' ? 'Weight jump can be at most 10 levels' : `Weight jump can be at most ${toDisp(50, ed)} ${unitsFor(ed)}`, 'down');
    if (!(ed.rest >= 15 && ed.rest <= 600)) return toast('Choose a rest time from 15 to 600 seconds', 'down');
    if (S.exercises.some(x => x.name.toLowerCase() === ed.name.toLowerCase() && x.id !== ed.id)) return toast('An exercise with that name exists', 'down');
    const isNew = !ed.id;
    const was = !isNew && S.exById[ed.id];
    if (was && was.unit !== ed.unit) {
      const n = S.sessions.filter(s => s.entries.some(e => e.exId === ed.id)).length;
      if (n && !(await confirmSheet({ title: 'Change how the load is logged?', body: `This exercise is in ${n} logged workout${n === 1 ? '' : 's'}. Their numbers stay the same but are read the new way, so charts and levels can jump. To keep old records apart, create a new exercise instead.`, ok: 'Change it' }))) return;
    }
    if (isNew) ed.id = ed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6);
    delete ed.imported; delete ed._auto;
    await saveExercise(structuredClone(ed));
    toast(isNew ? 'Exercise created' : 'Exercise saved', 'up');
    edFor = null;
    if (isNew && pendingPick) {
      // Back to the programme, where the new exercise goes straight into the day it was made for.
      const use = pendingPick, id = ed.id;
      pendingPick = null;
      go(pendingAt);
      setTimeout(() => use(id), 0);
      return;
    }
    go(isNew ? 'exercises' : 'ex/' + ed.id);
  },
  async 'ed-del'() {
    const used = S.program.days.filter(d => d.slots.some(s => s.exId === ed.id)).map(d => d.name);
    if (used.length) return toast(`Remove it from ${used.join(', ')} in the programme first`, 'flat');
    const n = exposures(S.sessions, ed).length;
    if (!(await confirmSheet({ title: `Delete ${ed.name}?`, body: n ? `Its ${n} logged session${n === 1 ? '' : 's'} stay in history as "Deleted exercise".` : 'It has no logged sessions.', ok: 'Delete', danger: true }))) return;
    await deleteExercise(ed.id);
    edFor = null;
    go('exercises');
  },
  // gyms
  async 'gym-name'(el) {
    const v = el.value.trim();
    if (!v) { toast('Gym name can\'t be empty', 'down'); return refresh(); }
    await saveSettings({ gyms: S.settings.gyms.map(g => (g.id === el.dataset.id ? { ...g, name: v } : g)) });
  },
  'gym-use': el => saveSettings({ gymId: el.dataset.id }),
  async 'gym-add'() {
    const id = uid('g');
    await saveSettings({ gyms: [...S.settings.gyms, { id, name: `Gym ${S.settings.gyms.length + 1}` }] });
    setTimeout(() => document.getElementById('gym-' + id)?.select(), 50);
  },
  async 'gym-del'(el) {
    const n = S.sessions.filter(s => s.gymId === el.dataset.id).length;
    if (!(await confirmSheet({ title: 'Delete this gym?', body: n ? `${n} session${n === 1 ? '' : 's'} logged there keep their history but lose the gym label.` : '', ok: 'Delete', danger: true }))) return;
    await saveSettings({ gyms: S.settings.gyms.filter(g => g.id !== el.dataset.id) });
  },
  // equipment
  async 'eq-save'() {
    // Typed in the display unit. A number left as shown keeps its exact stored kg (no drift from kg -> lb -> kg).
    const old = S.settings.equip, known = [...old.dumbbells, ...old.plates, old.barKg, old.smithBarKg].filter(x => x != null);
    const back = v => known.find(k => toDisp(k) === v) ?? fromDisp(v);
    const list = id => document.getElementById(id).value.split(/[,\s]+/).map(Number).filter(x => x > 0).map(back).sort((a, b) => a - b);
    const dumbbells = [...new Set(list('eq-db'))], plates = [...new Set(list('eq-pl'))].sort((a, b) => b - a);
    const barKg = back(num(document.getElementById('eq-bar').value, toDisp(20))), smithBarKg = back(num(document.getElementById('eq-smith').value, toDisp(barKg)));
    const ezRaw = document.getElementById('eq-ez').value.trim(), ezBarKg = ezRaw === '' ? null : back(num(ezRaw, 0));
    if (!plates.length) return toast('Add at least one plate size', 'down');
    const u = getUnits(), lim = kg => toDisp(kg);
    if (!(barKg >= 4.5 && barKg <= 50)) return toast(`Barbell must be between ${lim(4.5)} and ${lim(50)} ${u}`, 'down');
    if (!(smithBarKg >= 0 && smithBarKg <= 50)) return toast(`Smith bar must be between 0 and ${lim(50)} ${u}`, 'down');
    if (ezBarKg != null && !(ezBarKg >= 2 && ezBarKg <= 40)) return toast(`EZ bar must be between ${lim(2)} and ${lim(40)} ${u}, or blank`, 'down');
    if (dumbbells.some(x => x > 150)) return toast(`Dumbbells can be at most ${lim(150)} ${u}`, 'down');
    if (plates.some(x => x > 50)) return toast(`Plates can be at most ${lim(50)} ${u}`, 'down');
    await saveSettings({ equip: { dumbbells, plates, barKg, smithBarKg, ...(ezBarKg != null ? { ezBarKg } : {}) } });
    toast('Equipment saved', 'up');
  },
  // data
  async 'backup-share'() {
    const name = backupName(), text = JSON.stringify(await exportAll());
    try {
      if (await shareFile(name, text)) { await markBackup(); return; }
      await download(name, text, 'application/json');
      await markBackup();
      toast('Sharing isn\'t available here, so the file was saved to Downloads', 'flat');
    } catch (e) { if (e.name !== 'AbortError') throw e; }
  },
  async 'backup-dl'() { await download(backupName(), JSON.stringify(await exportAll()), 'application/json'); await markBackup(); toast(globalThis.gimNative ? 'Backup saved' : 'Backup saved to Downloads', 'up'); },
  async 'csv-dl'() { await download(`wegogim-${todayIso()}.csv`, toCSV(S.sessions, S.exById, S.settings.gyms), 'text/csv'); toast(globalThis.gimNative ? 'Spreadsheet saved' : 'CSV saved to Downloads', 'up'); },
  async restore(el) {
    const f = el.files?.[0]; el.value = '';
    if (!f) return;
    // The picker shows every file (a type filter makes Android grey out backups saved from Drive or WhatsApp),
    // so the content decides: anything that isn't one of our backups is turned away here.
    const notBackup = `That isn't a we go gim backup file${/\.(pdf|csv|txt|md)$/i.test(f.name) ? '. Old logs go in through More → Import old logs' : ''}.`;
    if (f.size > 200 * 1024 * 1024) return toast(notBackup, 'down');
    let d;
    try { d = JSON.parse(await readFile(f)); } catch { return toast(notBackup, 'down'); }
    if (!d || typeof d !== 'object' || d.app !== 'setlist' || !Array.isArray(d.sessions)) return toast(notBackup, 'down');
    try { validateBackup(d); } catch (e) { return toast(e.message, 'down'); }
    const dates = d.sessions.map(s => s.date).sort();
    const cnt = a => Number(Array.isArray(a) ? a.length : 0);
    const saved = typeof d.exported === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d.exported) ? `, saved ${fmtDate(d.exported.slice(0, 10), { year: true })}` : '';
    const body = `<b>${esc(f.name)}</b>${saved}: ${plural(cnt(d.sessions), 'session')}${dates.length ? ` (${fmtDate(dates[0], { year: true })} to ${fmtDate(dates[dates.length - 1], { year: true })})` : ''}, ${plural(cnt(d.exercises), 'exercise')}, ${plural(cnt(d.body), 'weigh-in')}.<br><br>${S.sessions.length ? `Merge keeps the ${plural(S.sessions.length, 'session')} on this phone and adds the ones in the file (handy with two phones). Replace swaps everything for the file.` : 'It replaces what is on this phone.'} ${S.draft ? '<b>Your workout in progress will be discarded.</b> ' : ''}An undo copy of your current data is kept.`;
    const how = await confirmSheet({ title: 'Restore this backup?', body, ok: S.sessions.length ? 'Replace' : 'Restore', danger: true, alt: S.sessions.length ? 'Merge (keep both)' : null });
    if (!how) return;
    await withUndo('restore', () => importAll(d, { merge: how === 'alt' }));
    pOrigs.clear();
    toast('Backup restored', 'up');
    if (location.hash.startsWith('#/import')) go('today');
  },
  async 'undo-restore'() {
    const u = await db.getKv('undo');
    if (!u?.data) { undoMeta = null; refresh(); return toast('No undo copy found', 'flat'); }
    try { validateBackup(u.data); } catch (e) { return toast(e.message, 'down'); }
    if (!(await confirmSheet({ title: 'Put back your earlier data?', body: `Brings back the ${Number(u.data.sessions.length)} sessions from ${fmtDate(u.at, { year: true })}. What's on the phone now becomes the undo copy${S.draft ? ', and the workout in progress is discarded' : ''}.`, ok: 'Put it back' }))) return;
    await withUndo('undo', () => importAll(u.data));
    pOrigs.clear();
    toast('Earlier data restored', 'up');
  },
  async 'csv-in'(el) {
    const f = el.files?.[0]; el.value = '';
    if (!f) return;
    // Same size cap and decoding as Import logs: Excel in Japan and China saves CSVs as Shift-JIS or GBK, and
    // "Unicode text" is UTF-16.
    if (f.size > 25 * 1024 * 1024) return toast(`${f.name} is too big to import (${Math.round(f.size / 1048576)} MB). Split it into smaller files.`, 'down');
    let text;
    try { text = decodeBytes(new Uint8Array(await f.arrayBuffer())); } catch { return toast(`Could not read ${f.name}.`, 'down'); }
    if (/^\s*\{/.test(text)) return toast('That looks like a backup file. Use "Restore from backup" above.', 'flat');
    // Chinese, Japanese and Malay lift names are matched once their dictionaries are in (loaded on first import).
    await (await import('../io.js')).loadForeignNames();
    let sessions;
    try { sessions = sessionsFromCSV(text, { lb: impLb(), dateOrder: impOpt.order, lang: S.settings.lang, today: todayIso() }); }
    catch (e) { return toast(e.message, 'down'); }
    // Rows dated after tomorrow are left out and counted with the skipped lines.
    prepImport({ sessions, future: sessions.future || 0 }, f.name);
    go('import');
  },
  'rm-seed': async () => {
    if (!(await confirmSheet({ title: 'Remove the sample data?', body: 'Deletes the made-up sample workouts and weigh-ins. Your own workouts and imports stay.', ok: 'Remove', danger: true }))) return;
    await removeSeedData(); toast('Sample data removed');
  },
  async reset() {
    if (!(await confirmSheet({ title: 'Erase everything?', body: `All ${S.sessions.length} sessions, weigh-ins, cardio, programme changes and settings are deleted and the app starts over empty. ${S.settings.lastBackup ? `Your last backup file is from ${fmtDate(S.settings.lastBackup, { year: true })}.` : '<b>You have never saved a backup file.</b>'} An undo copy is kept on this phone.`, ok: 'Erase everything', danger: true }))) return;
    await withUndo('erase', () => resetAll());
    pOrigs.clear(); imp = null;
    toast('Everything erased. Undo it under More → Backup.');
    go('setup');
  },
  // import
  async 'imp-file'(el) {
    const files = [...(el.files || [])]; el.value = '';
    if (!files.length || impBusy) return;
    const year = +document.getElementById('imp-year')?.value || +todayIso().slice(0, 4);
    const src = files.length > 2 ? `${files.length} files` : files.map(f => f.name).join(', ');
    // No type filter on the picker (Android hides files shared from Drive or WhatsApp otherwise), so look inside.
    // Same routing as the import tests: PDFs, CSVs from other apps, notes, chats, HTML and RTF exports; photos,
    // spreadsheets and archives are turned away with what to do instead.
    const kinds = new Map();
    // A huge file would freeze the phone while it's read; real logs are far smaller.
    const big = files.find(f => f.size > (/\.pdf$/i.test(f.name) ? 60 : 25) * 1024 * 1024);
    if (big) return toast(`${big.name} is too big to import (${Math.round(big.size / 1048576)} MB). Split it into smaller files.`, 'down');
    for (const f of files) {
      const b = new Uint8Array(await f.slice(0, 4096).arrayBuffer());
      const r = routeFile(f.name, b.subarray(0, 16), decodeBytes(b));
      if (r.kind === 'reject') return toast(r.message, 'down');
      if (r.kind === 'backup') return toast('That looks like a backup file. Use "Restore a backup" below.', 'flat');
      kinds.set(f, r.kind);
    }
    // Each file is parsed on its own and named after it ("Monday Push 1"); copies of the same log
    // exported twice collapse to one session per date. An exact copy (same name and size) isn't read twice.
    const seen = new Set();
    const todo = files.filter(f => { const k = sessionNameFromFile(f.name) + '|' + f.size; if (seen.has(k)) return false; seen.add(k); return true; });
    let text = '', all = [], skipped = 0, future = 0, impossible = 0, badYears = [], last = 0;
    const paint = force => { const now = Date.now(); if (force || now - last > 120) { last = now; refresh(); } };
    try {
      for (let i = 0; i < todo.length; i++) {
        const f = todo[i];
        impBusy = { file: f.name, i, n: todo.length, page: 0, pages: 0 };
        paint(true);
        const opts = { year, sessionName: sessionNameFromFile(f.name), lb: impLb(), dateOrder: impOpt.order, today: todayIso() };
        let r;
        if (kinds.get(f) === 'pdf') {
          const t = await pdfToText(f, (page, pages) => { impBusy.page = page; impBusy.pages = pages; paint(); });
          if (text.length < 20000) text += '\n' + t;
          r = parseLogText(t, S.exercises, opts);
        } else {
          const bytes = new Uint8Array(await f.arrayBuffer());
          if (text.length < 20000) text += '\n' + decodeBytes(bytes).slice(0, 20000);
          r = importFile(f.name, bytes, S.exercises, opts);
          if (r.kind === 'reject') throw new Error(r.message);
          r.skipped ||= 0;
        }
        for (const s of r.sessions) { s.fileTime = f.lastModified; s.file = f.name; }
        all.push(...r.sessions); skipped += r.skipped; future += r.future || 0; impossible += r.impossible || 0; badYears.push(...(r.badYears || []));
      }
    } catch (err) {
      impBusy = null; refresh();
      throw err;
    }
    impBusy = null;
    const { sessions, dropped } = dedupeSessions(all);
    prepImport({ sessions, skipped, future, impossible, badYears }, src, text, dropped);
    imp.sameFiles = files.length - todo.length;
    refresh();
  },
  async 'imp-parse'() {
    const text = document.getElementById('imp-text').value;
    if (!text.trim()) return toast('Paste some text first', 'flat');
    const year = +document.getElementById('imp-year').value || +todayIso().slice(0, 4);
    impText = text;
    // Chinese, Japanese and Malay lift names are matched once their dictionaries are in (the first paste loads them).
    await loadForeignNames();
    // Sessions dated after tomorrow are left out and counted, as in CSV files.
    prepImport(parseLogText(text, S.exercises, { year, lb: impLb(), dateOrder: impOpt.order, today: todayIso() }), 'Pasted text', text);
    refresh();
  },
  'imp-on'(el) { imp.sessions[+el.dataset.s].skip = !el.checked; refresh(); },
  'imp-all'() { const all = imp.sessions.every(s => !s.skip); for (const s of imp.sessions) s.skip = all; refresh(); },
  'imp-yr'(el) {
    const ss = imp.sessions.filter(s => s.date.startsWith(el.dataset.y));
    const on = ss.every(s => !s.skip);
    for (const s of ss) s.skip = on;
    refresh();
  },
  'imp-seed'(el) { imp.replaceSeed = el.checked; },
  'imp-filter'(el) { imp.filter = el.dataset.v; imp.show = 40; refresh(); },
  'imp-gmore'() { imp.show = Infinity; refresh(); },
  'imp-smore'() { imp.sessShow += 50; refresh(); },
  'imp-pickg'(el) { impPicker(+el.dataset.g); },
  'imp-opt'(el) { if (el.dataset.f === 'lb') impOpt.lb = el.dataset.v === 'lb'; else impOpt.order = el.dataset.v; refresh(); },
  'imp-meta-open'(el) { const g = imp.groups[+el.dataset.g]; g.target = ''; closeSheet(); setTimeout(() => metaSheet(g.label, g.meta, 'imp-meta', el.dataset.g), 0); refresh(); },
  'imp-meta'(el) { const g = imp.groups[+el.dataset.k]; setMeta(g.meta, el.dataset.f, el.dataset.v); metaSheet(g.label, g.meta, 'imp-meta', el.dataset.k); refresh(); },
  'imp-pick'(el) {
    const g = imp.groups[+el.dataset.g];
    g.target = el.dataset.id;
    closeSheet();
    refresh();
    toast(`${g.label}: ${targetTxt(g.target)}`);
  },
  'imp-bulk'(el) {
    if (el.dataset.v === 'skip') { for (const g of imp.groups) if (!g.target) g.target = 'skip'; }
    else for (const g of imp.groups) g.target = g.suggested;
    refresh();
  },
  // The pasted text stays in the box, so it can be fixed and read again.
  'imp-cancel'() { impText = imp?.source === 'Pasted text' ? imp.raw : ''; imp = null; refresh(); },
  async 'imp-save'() {
    const sel = imp.sessions.filter(s => !s.skip);
    if (!sel.length) return toast('Select at least one session', 'flat');
    // New exercises: one per unmatched lift that's actually used, named after its most used spelling,
    // with muscles guessed from the name.
    const G = imp.groups, gid = new Map(), newEx = [];
    const used = new Set(sel.flatMap(s => s.entries.map(e => imp.gOf[gk(e)])));
    for (const gi of used) {
      const g = G[gi];
      if (g.target === 'skip') continue;
      if (g.target) { gid.set(gi, g.target); continue; }
      const ents = sel.flatMap(s => s.entries.filter(e => imp.gOf[gk(e)] === gi));
      const m = g.meta || guessNewExercise(g.label, { loaded: ents.some(e => e.sets.some(x => +x.w > 0)), unit: g.unit });
      const unit = m.unit;
      let name = g.label.charAt(0).toUpperCase() + g.label.slice(1);
      if (g.twin && !/\((levels|kg)\)$/.test(name)) name += unit === 'L' ? ' (levels)' : ' (kg)';
      const ex = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6), name, unit, equip: m.equip, inc: m.inc, rest: m.rest, muscles: m.muscles.length ? m.muscles : guessMuscles(name), perGym: m.perGym, imported: true };
      newEx.push(ex); gid.set(gi, ex.id);
    }
    const sessions = sel.map(s => ({
      // A heart rate and gym from the log are kept (the gym when one here has that name).
      id: uid('imp'), date: s.date, name: s.name, color: s.color || 'upper', gymId: S.settings.gymId, hr: null, ...importExtras(s, S.settings.gyms),
      // Trimmed to what a restore keeps, so a backup of this brings back exactly what's shown.
      entries: s.entries.filter(e => gid.has(imp.gOf[gk(e)])).slice(0, SESSION_CAP).map(e => ({ exId: gid.get(imp.gOf[gk(e)]), sets: e.sets.slice(0, SESSION_CAP).map(x => ({ w: x.w, r: x.r, done: x.done !== false, ...loadMeta(x), ...(x.warm ? { warm: true } : {}) })), rir: e.rir ?? null, pain: !!e.pain, note: e.note || '' })),
      readiness: null, feel: null, note: [...(s.dateWas ? [`Date written as ${s.dateWas} in the log.`] : []), ...s.notes].join(' · '), imported: true,
    })).filter(s => s.entries.length);
    const dates = new Set(sessions.map(s => s.date));
    const seedIds = imp.replaceSeed ? S.sessions.filter(x => x.seed && dates.has(x.date)).map(x => x.id) : [];
    // Written in bulk, then reloaded once: much faster than one save per session for years of logs.
    await db.putMany('exercises', newEx);
    await db.putMany('sessions', sessions);
    for (const id of seedIds) await db.del('sessions', id);
    await load();
    const noMuscle = newEx.filter(x => !x.muscles.length).length;
    imp = null; impText = '';
    toast(`Imported ${sessions.length} session${sessions.length === 1 ? '' : 's'}${newEx.length ? ` and ${newEx.length} new exercise${newEx.length === 1 ? '' : 's'}${noMuscle ? `; ${noMuscle === 1 ? '1 needs its' : `${noMuscle} need their`} muscles set under Exercises` : ''}` : ''}`, 'up');
    go('history');
  },
  // settings
  theme: el => saveSettings({ theme: el.dataset.v }),
  'st-palette'(el) {
    const v = el.dataset.v;
    if (v !== 'mine' || okMine(S.settings.myPalette)) return saveSettings({ appPalette: v });
    // "Mine" starts as a copy of the colours on screen.
    const p = paletteFor(S.settings);
    return saveSettings({ appPalette: 'mine', myPalette: { dark: p.dark.slice(0, 2), light: p.light.slice(0, 2) } });
  },
  'st-mine'(el) {
    if (!isHex(el.value) || !okMine(S.settings.myPalette)) return;
    const mode = themeNow(), p = { dark: [...S.settings.myPalette.dark], light: [...S.settings.myPalette.light] };
    p[mode][+el.dataset.i] = fitSurface(el.value.toUpperCase(), mode);
    return saveSettings({ myPalette: p });
  },
  tour: () => showTour(),
  feedback: () => openFeedback(APP_VERSION),
  'close-sheet': () => closeSheet(),
  async 'check-update'() {
    if (!navigator.onLine) return toast("You're offline. Connect and try again.", 'flat');
    toast('Checking for updates…');
    const r = await checkForUpdates().catch(() => 'error');
    toast(r === 'updating' ? 'Update found. The app reloads when it is ready.' : r === 'latest' ? `You're on the latest version (${APP_VERSION})` : r === 'unsupported' ? 'Updates work once the app is opened from its website' : "Couldn't check right now. Try again later.", r === 'error' ? 'down' : 'up');
  },
  async 'st-toggle'(el) {
    if (el.dataset.f === 'trainingReminders') {
      if (!globalThis.gimNative || !await globalThis.gimNative.trainingPermission(el.checked)) { el.checked = false; return toast('Notifications are blocked. Allow them in Android settings, then try again.', 'flat'); }
    }
    // Notifications need the phone's permission first; without it the switch stays off.
    if (el.dataset.f === 'restNotify' && el.checked) {
      const p = globalThis.gimNative ? (await globalThis.gimNative.notificationPermission() ? 'granted' : 'denied') : 'Notification' in window ? await Notification.requestPermission().catch(() => 'denied') : 'unsupported';
      if (p !== 'granted') { el.checked = false; return toast(p === 'unsupported' ? 'This browser cannot show notifications' : 'Notifications are blocked. Allow them in your phone settings for this app.', 'flat'); }
    }
    await saveSettings({ [el.dataset.f]: el.checked });
    if (el.dataset.f === 'restNotify') (await import('../app.js')).restNotice();
  },
  'st-missed': el => saveSettings({ missedReminders: el.checked }),
  'st-game': el => saveSettings({ gamify: el.checked }),
  'st-pause'(el) {
    const t = todayIso(), list = cleanPauses(S.settings.streakPauses || []);
    if (el.checked && !list.some(p => !p.to)) list.push({ from: t, to: null });
    if (!el.checked) for (const p of list) if (!p.to) p.to = t;
    return saveSettings({ streakPauses: cleanPauses(list) });
  },
  'st-text': el => saveSettings({ textSize: ['large', 'xl'].includes(el.dataset.v) ? el.dataset.v : 'normal' }),
  'st-daystart': el => saveSettings({ dayStart: +el.dataset.v || 0 }),
  'st-remind': el => { if (/^\d{2}:\d{2}$/.test(el.value)) saveSettings({ remindAt: el.value }); },
  'st-reminder-text': el => saveSettings({ trainingReminderText: el.value.trim().slice(0, 180) }),
  'cal-export'() { exportCalendar(); },
  'st-warm': el => saveSettings({ autoWarmup: el.dataset.v === 'all' ? true : el.dataset.v === 'barbell' ? 'barbell' : false }),
  // Units and wording apply straight away: saving settings repaints every screen.
  'st-units': el => saveSettings({ units: el.dataset.v === 'lb' ? 'lb' : 'kg' }),
  'st-wording': el => saveSettings({ wording: el.dataset.v === 'expert' ? 'expert' : 'plain' }),
  async 'st-save'() {
    // Both are optional: a blank field clears it.
    const gv = document.getElementById('st-goal').value.trim(), hv = document.getElementById('st-height').value.trim();
    const g = gv === '' ? null : fromDisp(num(gv)), h = hv === '' ? null : num(hv);
    if (g != null && !(g > 20 && g < 300)) return toast(`Goal must be between ${Math.round(toDisp(20))} and ${Math.round(toDisp(300))} ${getUnits()}`, 'down');
    if (h != null && !(h > 100 && h < 250)) return toast('Height must be between 100 and 250 cm', 'down');
    await saveSettings({ goalKg: g, heightCm: h });
    toast('Saved', 'up');
  },
};

/** New exercise: equipment, unit, weight jump and muscles guessed from the name (until the user sets them). */
function autoFill() {
  const g = guessNewExercise(ed.name, { loaded: true });
  Object.assign(ed, { equip: g.equip, unit: g.unit, inc: g.inc, rest: g.rest, perGym: g.perGym, muscles: g.muscles });
}
// Pull typed values into the exercise draft before a click re-renders.
function keepEd() {
  for (const [id, f] of [['ex-name', 'name'], ['ex-caution', 'caution']]) { const el = document.getElementById(id); if (el) ed[f] = el.value.trim(); }
  for (const [id, f] of [['ex-inc', 'inc'], ['ex-rest', 'rest']]) { const el = document.getElementById(id); if (el) ed[f] = num(el.value, ed[f]); }
}

// Leaving a screen drops its draft state.
window.addEventListener('hashchange', () => {
  if (!location.hash.startsWith('#/program')) pOrigs.clear();
  if (!location.hash.startsWith('#/exercise/')) edFor = null;
  if (!location.hash.startsWith('#/data')) undoMeta = undefined;
});

// ---- paste a written split -------------------------------------------------------------------
let pst = null; // {text, days, map: {itemKey: exId | ''}}
/** Best exercise for a split line: a good name match, preferring the one with the most logged history
 *  (so "Lat Pulldown" finds your main pulldown, not a rarely used variant). Burnouts stay separate. */
export function splitMatch(name, exercises, sessions) {
  const count = {}, last = {};
  for (const s of sessions) for (const e of s.entries) { count[e.exId] = (count[e.exId] || 0) + 1; if (!last[e.exId] || s.date > last[e.exId]) last[e.exId] = s.date; }
  const recentFrom = sessions.reduce((m, s) => (s.date > m ? s.date : m), '').replace(/^(\d{4})/, y => String(+y - 1)); // a year before the newest log
  const burn = /burn.?out|drop.?set|finisher/i.test(name);
  let best = null;
  for (const ex of exercises) {
    if (burn !== /burn.?out|drop.?set|finisher/i.test(ex.name)) continue;
    const m = matchExercise(name, [ex]);
    if (!m) continue;
    const v = m.score + 0.15 * Math.log10(1 + (count[ex.id] || 0)) + (last[ex.id] && last[ex.id] >= recentFrom ? 0.1 : 0);
    if (!best || v > best.v) best = { id: ex.id, v };
  }
  return best?.id || '';
}
// New exercises from a pasted split, keyed by lower-case name: guessed set-up the user can change on the review.
const pstMeta = name => {
  const k = name.toLowerCase();
  return (pst.meta[k] ||= guessNewExercise(name, { loaded: !/\b(push.?ups?|pull.?ups?|chin.?ups?|dips?|plank|nordic|frog|hanging|bodyweight|bw)\b/i.test(name) }));
};
function pasteSplit() {
  if (!pst) pst = { text: '', days: null, map: {} };
  if (!pst.days) {
    const h = `<p class="fine">Paste your plan as text: one line per day like <b>Monday – Chest</b>, then one line per exercise like <b>Bench Press – 4 × 6–8</b>. Numbering, "Finish with:", "Optional:" and cardio lines are fine.</p>
      <textarea class="inp mono" id="split-text" rows="14" aria-label="Your split, one day per heading" placeholder="Monday – Chest&#10;1. Bench Press – 4 × 6–8&#10;2. Incline Dumbbell Press – 3 × 8–10&#10;15 min incline walk&#10;&#10;Tuesday – Back&#10;1. Lat Pulldown – 3 × 8–10">${esc(pst.text)}</textarea>
      <button class="btn" data-act="split-read">Read my split</button>`;
    return { title: 'Paste a split', sub: 'Turn your plan into the programme', back: 'program', html: h, color: 'push' };
  }
  const opts = sel => `<option value="">+ Add as a new exercise</option>${S.exercises.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  const n = pst.days.reduce((a, d) => a + d.items.length, 0), nNew = Object.values(pst.map).filter(v => !v).length;
  let h = `<div class="kpis"><div class="kpi"><b>${pst.days.length}</b><span>training days</span></div><div class="kpi"><b>${n}</b><span>exercises</span></div><div class="kpi"><b>${nNew}</b><span>new to the app</span></div></div>
    <p class="fine">Check each match. Your logged history stays; it just follows the matched exercises. Days not listed become rest days.</p>`;
  if (pst.notAdded?.length) h += `<div class="warn" style="--k:var(--flat)"><b>Not added (${pst.notAdded.length})</b><span>These lines aren't sets × reps, so they can't be programme exercises. Distance, time and conditioning work can go under Insights → Cardio.</span><ul class="notadded">${pst.notAdded.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  pst.days.forEach((d, di) => {
    h += `<section class="box pad wz-day" style="${kstyle(d.color)}"><header><b>${dowName(d.dow)}</b><span>${esc(d.name)}</span></header>${d.sub ? `<p class="fine">${esc(d.sub)}</p>` : ''}<div class="stack">`;
    d.items.forEach((it, ii) => {
      const key = `${di}:${ii}`;
      const m = !pst.map[key] && pstMeta(it.name);
      h += `<div class="impent"><div class="rowt"><b>${it.group ? `<i class="grp">${esc(it.group)}</i> ` : ''}${esc(it.name)}</b><small>${it.sets} × ${it.lo === it.hi ? it.lo : `${it.lo}–${it.hi}`}${it.note ? ' · ' + esc(it.note) : ''}</small></div>
        <select class="inp" id="sp-${di}-${ii}" data-input="split-map" data-k="${key}" aria-label="Match ${esc(it.name)}">${opts(pst.map[key])}</select>
        ${m ? `<button class="newmeta linkbtn" data-act="split-meta-open" data-k="${esc(it.name.toLowerCase())}" data-n="${esc(it.name)}" aria-label="New exercise ${esc(it.name)}: ${esc(metaTxt(m))}. Change">New: ${esc(metaTxt(m))} · <u>Change</u></button>` : ''}</div>`;
    });
    h += `</div></section>`;
  });
  const ignored = (pst.skipped || []).filter(l => !pst.notAdded?.includes(l));
  if (ignored.length) h += `<p class="fine">Also ignored: ${ignored.map(esc).join(' · ')}</p>`;
  h += `<div class="cta"><div class="row2"><button class="btn ghost" data-act="split-edit">Edit text</button><button class="btn" data-act="split-use" style="--c:var(--up)">Use this split</button></div></div>`;
  return { title: 'Your split', sub: 'Check the matches', back: 'program', html: h, color: 'up' };
}
Object.assign(actions, {
  'split-read'() {
    const text = document.getElementById('split-text').value;
    const r = parseSplitText(text);
    if (!r.days.length) return toast('No days found. Start each day with its name, e.g. "Monday – Chest".', 'flat');
    pst = { text, days: r.days, skipped: r.skipped, notAdded: r.notAdded || [], map: {}, meta: {} };
    r.days.forEach((d, di) => d.items.forEach((it, ii) => { pst.map[`${di}:${ii}`] = splitMatch(it.name, S.exercises, S.sessions); }));
    refresh(); document.getElementById('screen').scrollTop = 0;
  },
  'split-edit'() { pst.days = null; refresh(); },
  'split-map'(el) { pst.map[el.dataset.k] = el.value; refresh(); },
  'split-meta-open'(el) { metaSheet(el.dataset.n, pstMeta(el.dataset.n), 'split-meta', el.dataset.k); },
  'split-meta'(el) { const m = pst.meta[el.dataset.k]; if (!m) return; setMeta(m, el.dataset.f, el.dataset.v); metaSheet(el.closest('.metas')?.querySelector('.sh-title')?.textContent || '', m, 'split-meta', el.dataset.k); refresh(); },
  async 'split-use'() {
    const nDays = pst.days.length;
    if (!(await confirmSheet({ title: 'Replace your programme with this split?', body: `${nDays} training day${nDays === 1 ? '' : 's'}; the other days become rest. Your logged workouts are kept.`, ok: 'Use this split' }))) return;
    const created = {};
    const days = [];
    for (let di = 0; di < pst.days.length; di++) {
      const d = pst.days[di], slots = [];
      for (let ii = 0; ii < d.items.length; ii++) {
        const it = d.items[ii];
        let id = pst.map[`${di}:${ii}`];
        if (!id) {
          const key = it.name.toLowerCase();
          if (!created[key]) {
            const m = pstMeta(it.name);
            const ex = { id: key.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6), name: it.name, unit: m.unit, equip: m.equip, inc: m.inc, rest: m.rest, muscles: [...m.muscles], perGym: m.perGym };
            await saveExercise(ex);
            created[key] = ex.id;
          }
          id = created[key];
        }
        slots.push({ exId: id, sets: it.sets, lo: it.lo, hi: it.hi, group: it.group || '', ...(it.note ? { note: it.note } : {}) });
      }
      days.push({ dow: d.dow, name: d.name, sub: d.sub, color: d.color, slots });
    }
    for (let dow = 0; dow < 7; dow++) if (!days.some(x => x.dow === dow)) days.push({ dow, name: 'Rest', sub: 'Rest or easy cardio', color: 'rest', slots: [] });
    await saveProgram({ ...S.program, days: days.sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7)) });
    pst = null; pOrigs.clear();
    toast('Your split is now the programme', 'up');
    go('program');
  },
});

/** Training days as a calendar file: the phone's calendar app takes over the reminders. */
export function exportCalendar() {
  // Event text in the app's language: it is read later inside the calendar app, outside this screen.
  const days = S.program.days.filter(d => d.slots.length).map(d => ({ dow: d.dow, name: d.name, title: displayText(d.name), minutes: Math.round(estimateDay(d, S.exById, S.sessions) / 60) }));
  if (!days.length) return toast('No training days in your programme yet', 'flat');
  const url = location.href.split('#')[0] + '#/start';
  const time = S.settings.remindAt || '18:00';
  const words = { train: displayText('Time to train') };
  const links = days.map(d => `<a class="btn ghost" href="${esc(googleCalendarUrl(d, time, { title: `we go gim: ${d.title}`, details: `${words.train} · ${url}` }))}" target="_blank" rel="noopener noreferrer">${esc(dowName(d.dow, true))} · ${esc(d.name)}</a>`).join('');
  const google = `<p class="fine">Google Calendar (most Android phones): tap each day and save. It repeats every week at ${esc(time)}.</p><div class="callist">${links}</div>`;
  const file = `<p class="fine">Any other calendar (iPhone, Samsung, Huawei, Xiaomi, OPPO, vivo, Outlook): download one file with every day, then open it.</p><button class="btn ghost" data-x="ics">Download calendar file</button>`;
  const el = openSheet(`<h2 class="sh-title">Add training days to my calendar</h2>${getLang() === 'zh' ? file + google : google + file}`, { label: 'Training reminders' });
  el.addEventListener('click', async ev => {
    if (ev.target.closest('a[href^="https://calendar.google.com"]')) saveSettings({ calAdded: true });
    if (!ev.target.closest('[data-x="ics"]')) return;
    await download('we-go-gim-training.ics', trainingIcs(days, time, url, new Date(), words), 'text/calendar');
    saveSettings({ calAdded: true });
    toast('Open the downloaded file to add the reminders to your calendar', 'up');
  });
}

/** Imported exercises whose stored muscles differ from what the name now suggests (and not already kept). */
function muscleRechecks() {
  const out = [];
  for (const x of S.exercises) {
    if (!x.imported || x.musclesKept) continue;
    const g = guessMuscles(x.name);
    if (g.length && JSON.stringify([...g].sort()) !== JSON.stringify([...(x.muscles || [])].sort())) out.push({ x, g });
  }
  return out;
}
