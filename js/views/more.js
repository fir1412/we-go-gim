import { S, load, saveSettings, saveProgram, saveExercise, deleteExercise, exportAll, importAll, validateBackup, resetAll, removeSeedData, todayIso, uid, refresh } from '../state.js';
import * as db from '../db.js';
import { MUSCLES, unitLong, exposures, toDisp, fromDisp, getUnits } from '../engine.js';
import { esc, pill, ICON, toast, confirmSheet, openSheet, closeSheet, cvar, COLORS, dowName, fmtDate, T, helpTip } from '../ui.js';
import { toCSV, sessionsFromCSV, parseLogText, pdfToText, download, shareFile, readFile, matchExercise, guessMuscles, guessNewExercise, EQUIP_UNIT, sessionNameFromFile, dedupeSessions, nameKey, nameOverlap } from '../io.js';
import { searchText, CARDIO_WORDS } from '../seed.js';
import { go, showTour, APP_VERSION, canInstall, promptInstall, checkForUpdates } from '../app.js';
import { openFeedback } from '../feedback.js';
import { parseSplitText, weeklyVolume } from '../split.js';

export function render(route) {
  switch (route.name) {
    case 'program': return program();
    case 'paste': return pasteSplit();
    case 'exercises': return exercises();
    case 'exercise': return exerciseEdit(route.args[0]);
    case 'gyms': return gyms();
    case 'equip': return equip();
    case 'data': return data();
    case 'import': return importer();
    case 'settings': return settings();
    default: return home();
  }
}

const daysAgo = iso => Math.round((Date.parse(todayIso()) - Date.parse(iso)) / 864e5);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const agoTxt = iso => { const n = daysAgo(iso); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };

// ---- home -----------------------------------------------------------------------------
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

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
    ${row('gyms', ICON.pin, 'Gyms', `Training at ${esc(gym?.name || '—')}`, 'legs')}
    ${row('equip', ICON.plate, 'Equipment', 'Dumbbells, plates, bars', 'arms')}
    </div><div class="list box">
    ${row('import', ICON.upload, 'Import old logs', 'PDFs, pasted notes or CSV', 'legsb')}
    ${row('data', ICON.save, 'Backup and export', backupSub, 'upper')}
    ${row('settings', ICON.gear, 'Settings', 'Theme, kg or lb, wording, rest timer, goal', 'rest')}
    ${canInstall() ? `<button class="li mrow" data-act="install" style="--k:var(--up)"><i class="mic">${ICON.phone}</i><span><b>Install the app</b><small>Home-screen icon, full screen, works offline</small></span>${ICON.chev}</button>` : ''}
    ${isIOS() && !standalone() ? `<button class="li mrow" data-act="ios-install" style="--k:var(--up)"><i class="mic">${ICON.phone}</i><span><b>Add to Home Screen</b><small>Install on iPhone: full screen, works offline</small></span>${ICON.chev}</button>` : ''}
    <button class="li mrow" data-act="feedback" style="--k:var(--push)"><i class="mic">${ICON.chat || ICON.more}</i><span><b>Send feedback</b><small>Report a bug or suggest an idea</small></span>${ICON.chev}</button>
    </div>
    <details class="box pad help"><summary class="lbl">How suggestions work</summary>
    <p>Each exercise keeps its load and adds a rep per set until every set reaches the top of its range, then adds the smallest step. New exercises or machines ask you to <b>${esc(T('calibrate').toLowerCase())}</b>${helpTip('calibrate')}; bad sleep or pain keeps the load the same (<b>${esc(T('hold').toLowerCase())}</b>${helpTip('hold')}); three sessions without progress are flagged as <b>${esc(T('plateau').toLowerCase())}</b>${helpTip('plateau')}.</p></details>
    <p class="fine center-t">we go gim ${APP_VERSION} · everything stays on this phone</p>`;
  return { title: 'More', sub: 'Programme, data and settings', html: h, color: 'rest' };
}

// ---- programme editor --------------------------------------------------------------------
// Edits save as you go. The programme as it was when you opened the editor is kept so
// "Undo changes" can put it back.
let pOrig = null;
const openDays = new Set();
const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0];
const range = s => `${s.sets} × ${s.lo === s.hi ? s.lo : `${s.lo}–${s.hi}`}`;
function program() {
  if (!pOrig) {
    pOrig = structuredClone(S.program);
    openDays.clear();
    openDays.add(new Date(todayIso() + 'T12:00').getDay());
    if (!S.settings.progChecked) saveSettings({ progChecked: true });
  }
  const p = S.program;
  // One counting rule everywhere: the main muscle counts a full set, helper muscles half.
  const wv = weeklyVolume(p, S.exById), ws = Object.fromEntries(Object.entries(wv).map(([m, v]) => [m, Math.round(v * 2) / 2]));
  let h = `<a class="btn ghost" href="#/paste">${ICON.upload} Paste a written split</a>
    <p class="fine">Tap a day to edit it. Changes save as you go and apply to future sessions; past sessions stay as they were.</p>
    <div class="box pad vsum"><p class="lbl">Weekly ${esc(T('sets'))} per muscle · helpers count half · green is 10 or more</p><div class="chips">${MUSCLES.filter(m => ws[m]).map(m => pill(`${m} ${ws[m]}`, ws[m] >= 10 ? 'up' : ws[m] >= 6 ? 'flat' : 'mute')).join('')}</div></div>`;
  for (const dow of DOW_ORDER) {
    const di = p.days.findIndex(d => d.dow === dow);
    if (di < 0) continue;
    const d = p.days[di], open = openDays.has(dow);
    const nSets = d.slots.reduce((a, s) => a + (+s.sets || 0), 0);
    h += `<section class="box pday2" style="--k:${cvar(d.color)}">
      <button class="pdh" data-act="p-open" data-dow="${dow}" aria-expanded="${open}"><b class="dlab">${dowName(dow)}</b><span class="grow"><b>${esc(d.name)}</b><small>${d.slots.length ? `${d.slots.length} exercises · ${nSets} sets${d.sub ? ' · ' + esc(d.sub) : ''}` : esc(d.sub || 'Rest day')}</small></span>${ICON.chev}</button>`;
    if (open) {
      h += `<div class="pdb"><div class="pdn"><input class="inp" id="pn-${di}" value="${esc(d.name)}" data-input="p-day" data-d="${di}" data-f="name" aria-label="${dowName(dow, true)} name" enterkeyhint="done">
        <button class="sw big" data-act="p-color" data-d="${di}" style="--k:${cvar(d.color)}" aria-label="Colour for ${dowName(dow, true)}: ${esc(d.color)}"></button></div>
        <input class="inp" id="ps-${di}" value="${esc(d.sub || '')}" placeholder="Subtitle, e.g. Chest emphasis" data-input="p-day" data-d="${di}" data-f="sub" aria-label="${dowName(dow, true)} subtitle" enterkeyhint="done">`;
      h += d.slots.length ? `<ul class="pslots">${d.slots.map((s, si) => `<li><button class="pslot2" data-act="p-slot" data-d="${di}" data-s="${si}">${s.group ? `<i class="grp">${esc(s.group)}</i>` : `<i class="grp n">${si + 1}</i>`}<span class="grow">${esc(S.exById[s.exId]?.name || 'Missing exercise')}${s.note ? `<small>${esc(s.note)}</small>` : ''}</span><b class="num">${range(s)}</b></button></li>`).join('')}</ul>`
        : `<p class="fine">Rest day. Add an exercise to make it a training day.</p>`;
      h += `<div class="pdacts"><button class="mini addx" data-act="p-add" data-d="${di}">${ICON.plus} Add exercise</button>
        <button class="mini" data-act="p-moveday" data-dow="${dow}">${ICON.today} Move to another day</button></div></div>`;
    }
    h += `</section>`;
  }
  const changed = JSON.stringify(pOrig) !== JSON.stringify(p);
  if (changed) h += `<div class="cta"><button class="btn ghost" data-act="p-undo">Undo changes made on this screen</button></div>`;
  return { title: 'Programme', sub: 'Your weekly split', back: 'more', html: h, color: 'push' };
}

/** Change the programme and save straight away. */
async function editProgram(fn) {
  const p = structuredClone(S.program);
  if (fn(p) === false) return;
  await saveProgram(p);
}

/** Bottom sheet for one exercise slot: steppers instead of number fields, so no keyboard. */
function slotSheet(di, si) {
  const d = S.program.days[di], s = d?.slots[si];
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

/** Filter a list as you type: every word must match the name, muscles or another name for it ("bicep curl" finds DB curl).
 *  Cardio words ("treadmill", "walk") show a pointer to the cardio log instead. */
function searchList(root, raw, sel) {
  const q = raw.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
  let shown = 0;
  for (const li of root.querySelectorAll(sel)) { li.hidden = !!q && !words.every(w => li.dataset.name.includes(w)); if (!li.hidden) shown++; }
  const hint = root.querySelector('.cardiohint');
  if (hint) hint.hidden = !CARDIO_WORDS.test(q);
  return shown;
}
const cardioHint = `<p class="cardiohint fine" hidden>Walking, running, bikes and other cardio are logged under <a href="#/cardio">Insights → Cardio</a>, not as an exercise.</p>`;

/** Searchable exercise list in a sheet. Calls onPick(id). */
function pickExercise(title, onPick, cur = null) {
  const inProg = new Set(S.program.days.flatMap(d => d.slots.map(s => s.exId)));
  const el = openSheet(`<h2 class="sh-title" tabindex="-1" autofocus>${esc(title)}</h2><input class="inp" id="pick-q" type="search" placeholder="Search ${S.exercises.length} exercises" aria-label="Search exercises" autocomplete="off">
    ${cardioHint}
    <ul class="picklist">${S.exercises.map(x => `<li data-name="${esc(searchText(x))}"><button data-pick="${esc(x.id)}" ${x.id === cur ? 'aria-current="true"' : ''}><b>${esc(x.name)}</b><small>${esc((x.muscles || []).slice(0, 2).join(', ') || 'No muscles set')}${inProg.has(x.id) ? ' · in programme' : ''}</small></button></li>`).join('')}</ul>
    <a class="btn ghost" href="#/exercise/new">${ICON.plus} New exercise</a>`, { label: title });
  el.querySelector('#pick-q').addEventListener('input', ev => searchList(el, ev.target.value, '.picklist li'));
  el.addEventListener('click', ev => {
    if (ev.target.closest('.cardiohint a')) { closeSheet(); return; }
    const b = ev.target.closest('[data-pick]');
    if (b) { closeSheet(); onPick(b.dataset.pick); }
  });
}

// ---- exercise library -----------------------------------------------------------------------
function exercises() {
  const inProg = new Set(S.program.days.flatMap(d => d.slots.map(s => s.exId)));
  let h = `<input class="inp" id="exq" type="search" placeholder="Search exercises" aria-label="Search exercises" autocomplete="off">${cardioHint}
    <a class="btn ghost" href="#/exercise/new">${ICON.plus} New exercise</a><ul class="box mus" id="exl">`;
  for (const x of S.exercises) {
    h += `<li data-name="${esc(searchText(x))}"><a href="#/exercise/${esc(x.id)}"><span class="t">${esc(x.name)} ${inProg.has(x.id) ? pill('in programme', 'up') : ''}${x.unitUnclear ? pill('unit unclear', 'flat') : ''}${!(x.muscles || []).length ? pill('set muscles', 'down') : ''}</span><span class="d">${esc((x.muscles || []).join(', '))} · ${unitLong(x.unit)}</span></a></li>`;
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
    <div class="field"><span>Load is logged as</span><div class="chips" role="group" aria-label="Unit">${UNITS.map(([v, l]) => `<button class="mini" data-act="ed-set" data-f="unit" data-v="${v}" aria-pressed="${ed.unit === v}">${l}</button>`).join('')}</div></div>
    ${ed.unitUnclear ? `<div class="warn"><b>Unit unclear.</b><span>Old logs mixed per-side and total. Choosing a unit above clears this flag.</span></div>` : ''}
    <div class="field"><span>Equipment</span><div class="chips" role="group" aria-label="Equipment">${EQUIP.map(([v, l]) => `<button class="mini" data-act="ed-set" data-f="equip" data-v="${v}" aria-pressed="${ed.equip === v}">${l}</button>`).join('')}</div></div>
    <div class="row2"><label class="field"><span>Weight jump ${ed.unit === 'L' ? '(levels)' : ed.unit === 'kg/DB' ? '(kg per dumbbell)' : '(kg)'}</span><input class="inp" id="ex-inc" type="number" inputmode="decimal" step="0.25" min="0.25" value="${ed.inc}" data-input="ed" data-f="inc" aria-describedby="inc-help"></label>
    <label class="field"><span>Rest between sets (s)</span><input class="inp" id="ex-rest" type="number" inputmode="numeric" step="15" min="15" max="600" value="${ed.rest}" data-input="ed" data-f="rest"></label></div>
    <p class="fine" id="inc-help">How much weight gets added when every set reaches the top of its rep range. Use the smallest increase your gym allows: e.g. 2.5 kg for dumbbells, the plate size on a machine, 1 level on a cable.</p>
    <div class="field"><span>Muscles · tap in order, first is the main one</span><div class="chips" role="group" aria-label="Muscles">${MUSCLES.map(m => { const i = (ed.muscles || []).indexOf(m); return `<button class="mini" data-act="ed-muscle" data-v="${m}" aria-pressed="${i >= 0}">${i === 0 ? '★ ' : ''}${m}</button>`; }).join('')}</div></div>
    <label class="toggle"><input type="checkbox" id="ex-pergym" data-input="ed" data-f="perGym" ${ed.perGym ? 'checked' : ''}><span><b>Compare per gym</b><small>For machines and cables whose loads differ between gyms</small></span></label>
    <label class="field"><span>Caution note (shown with suggestions)</span><input class="inp" id="ex-caution" value="${esc(ed.caution || '')}" data-input="ed" data-f="caution" placeholder="e.g. Lower back has flared here"></label>
    <button class="btn" data-act="ed-save" style="--c:var(--up)">${isNew ? 'Create exercise' : 'Save exercise'}</button>`;
  if (!isNew) h += `<a class="btn ghost" href="#/ex/${esc(ed.id)}">History and records (${n} session${n === 1 ? '' : 's'})</a><button class="linkbtn danger center" data-act="ed-del">Delete exercise</button>`;
  return { title: isNew ? 'New exercise' : 'Edit exercise', sub: isNew ? 'Add to your library' : esc(ed.name), back: 'exercises', html: h, color: 'pull' };
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
  const e = S.settings.equip;
  const h = `<label class="field"><span>Dumbbells available (kg, comma separated)</span><textarea class="inp" id="eq-db" rows="3">${esc(e.dumbbells.join(', '))}</textarea></label>
    <p class="fine">Load increases jump to the next dumbbell you actually have; the workout screen warns when a weight isn't on your rack.</p>
    <label class="field"><span>Plates per side (kg)</span><input class="inp" id="eq-pl" value="${esc(e.plates.join(', '))}"></label>
    <div class="row2"><label class="field"><span>Barbell (kg)</span><input class="inp" id="eq-bar" type="number" inputmode="decimal" step="0.5" value="${e.barKg}"></label>
    <label class="field"><span>Smith bar (kg)</span><input class="inp" id="eq-smith" type="number" inputmode="decimal" step="0.5" value="${e.smithBarKg ?? e.barKg}"></label></div>
    <p class="fine">Smith bars are often counterbalanced to 5–15 kg. Check the label on yours.</p>
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
    <section class="box pad stack"><div class="rrow"><p class="lbl">Backup</p>${lb ? pill(`Last: ${agoTxt(lb)}`, daysAgo(lb) > 14 ? 'flat' : 'up') : pill('Never backed up', 'down')}</div>
      <p class="fine">One file with everything: sessions, programme, exercises, weigh-ins, cardio and settings. If the phone is lost or the browser data is cleared, this file is the only copy.</p>
      <button class="btn" data-act="backup-share">${ICON.upload} Share backup (Drive, WhatsApp, email)</button>
      <button class="btn ghost" data-act="backup-dl">${ICON.save} Save backup file</button>
      <label class="btn ghost filebtn">Restore from backup<input type="file" id="restore-file" data-input="restore"></label></section>`;
  if (undoMeta) h += `<div class="warn" style="--k:var(--upper)"><b>Undo copy</b><span>Your data from before ${WHAT[undoMeta.what] || 'the last change'} (${fmtDate(undoMeta.at, { year: true })}, ${plural(Number(undoMeta.n), 'session')}) is kept on this phone. <button class="linkbtn" data-act="undo-restore">Put it back</button></span></div>`;
  h += `<section class="box pad stack"><p class="lbl">Spreadsheet</p><p class="fine">One row per set. Opens in Google Sheets or Excel.</p>
      <div class="row2"><button class="btn ghost" data-act="csv-dl">Export CSV</button>
      <label class="btn ghost filebtn">Import CSV<input type="file" id="csv-file" data-input="csv-in"></label></div></section>
    <section class="box pad stack"><p class="lbl">Start fresh</p>
      ${nSeed ? `<button class="btn ghost" data-act="rm-seed">Remove the ${nSeed} sample sessions</button>` : ''}
      <button class="btn danger" data-act="reset">Erase everything</button></section>`;
  return { title: 'Backup and export', sub: 'Your data, your files', back: 'more', html: h, color: 'upper' };
}

/** Copy of all data taken before a destructive step, stored after it, so the step can be undone. */
async function withUndo(what, fn) {
  const snap = structuredClone(await exportAll());
  await fn();
  await db.setKv('undo', { at: todayIso(), what, data: snap });
  undoMeta = { at: todayIso(), what, n: snap.sessions.length };
  refresh();
}

// ---- importer --------------------------------------------------------------------------------------
// imp: {sessions, skipped, source, dropped, sameFiles, groups, gOf: {gk(entry): groupIndex}, filter, show, sessShow, replaceSeed, raw}
// Spellings of one lift ("Pullup", "Pull ups", "pull-up") form one group, matched and imported together.
let imp = null;
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
      if (!g) { g = { key, names: {}, sess: 0, sets: 0, units: {}, last: null }; byKey.set(key, g); groups.push(g); }
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
  const gOf = {};
  groups.forEach((g, i) => { for (const n of g.variants) gOf[n + (g.unit === 'L' ? '|L' : '')] = i; });
  // The level-based twin of a lift logged in kilos too gets its own name.
  for (const g of groups) if (g.unit === 'L' && byKey.has(g.key.replace(/ ·L$/, ''))) g.label += ' (levels)';
  imp = { sessions: r.sessions, skipped: r.skipped || 0, source, dropped, sameFiles: 0, groups, gOf, filter: groups.some(g => !g.target) ? 'new' : 'all', show: 40, sessShow: 25, replaceSeed: true, raw };
}
const gk = e => e.exName + (e.unit === 'L' ? '|L' : '');
const unitClass = u => (u === 'L' ? 'L' : 'w'); // cable levels vs weights (bodyweight counts as a weight)
const setTxt = e => e.sets.map(x => `${x.w ?? '?'}×${x.r ?? '?'}`).join(' ');
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
    h = `<p class="fine">Pick old workout PDFs or text files, or paste notes. Dates, exercise names and sets like <b>25kg x 8 x 4</b>, <b>25 kg 8,8,6</b>, <b>15kg 8 8 7</b>, <b>3x8 @ 25</b>, <b>L9 x 12</b> or <b>BW 6,6,6</b> are recognised. Remarks about pain, sleep and effort are kept as notes, never as exercises. You check everything before it's saved.</p>
      <label class="btn filebtn">${ICON.upload} Choose PDF, text or CSV files<input type="file" id="imp-file" multiple data-input="imp-file"></label>
      <p class="fine">Pick several files at once if you like. Older and newer copies of the same log are fine: repeated sessions are removed. CSV exports from Hevy and Strong work too.</p>
      ${impOptions()}
      <label class="field"><span>Or paste text</span><textarea class="inp mono" id="imp-text" rows="7" placeholder="21/9/2026 Push&#10;Flat DB bench&#10;25kg x 8 x 4&#10;Incline DB press 25 kg 8,8,6&#10;left shoulder pinged on the last set"></textarea></label>
      <div class="row2"><label class="field"><span>Year for dates without one</span><input class="inp" id="imp-year" type="number" inputmode="numeric" value="${todayIso().slice(0, 4)}"></label><button class="btn ghost" data-act="imp-parse">Read pasted text</button></div>
      <p class="fine">Reading a PDF needs internet the first time.</p>
      <section class="box pad stack impres"><p class="lbl">Moving from another phone?</p><p class="fine">A backup file from this app brings back everything at once: sessions, programme, exercises and settings.</p>
      <label class="btn ghost filebtn">${ICON.save} Restore a backup<input type="file" id="imp-restore" data-input="restore"></label></section>`;
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
  if (facts.length) h += `<ul class="impfacts">${facts.map(f => `<li>${f}</li>`).join('')}</ul>`;
  if (!imp.sessions.length) {
    h += `<div class="warn"><b>Nothing found.</b><span>No dated lines with sets were recognised. Each workout needs a date line (e.g. 21/9/2026 or 21 Sep) followed by sets (e.g. 25kg x 8).</span></div>`;
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
        <span class="t"><b>${esc(g.label)}</b>${!g.target && g.meta ? `<small class="newmeta">New: ${esc(metaTxt(g.meta))}</small>` : ''}<small>${g.sess} session${g.sess === 1 ? '' : 's'} · ${plural(g.sets, 'set')}${g.variants.length > 1 ? ` · ${g.variants.length} spellings` : ''}${!g.target && g.twin ? ` · logged in ${g.unit === 'L' ? 'levels' : 'kg'}; ${esc(g.twin)} uses ${g.unit === 'L' ? 'kg' : 'levels'}` : g.unit === 'L' && !/\(levels\)$/.test(g.label) ? ' · levels' : ''}</small></span>
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
      h += `<div class="impsess2" style="--k:${cvar(s.color)}"><div class="rrow"><label class="toggle sm"><input type="checkbox" id="imp-on-${si}" data-input="imp-on" data-s="${si}" ${s.skip ? '' : 'checked'}><span><b>${fmtDate(s.date, { dow: true, year: true })} · ${esc(s.name)}</b><small>${s.entries.length} exercise${s.entries.length === 1 ? '' : 's'} · ${plural(s.entries.reduce((a, e) => a + e.sets.length, 0), 'set')}${s.dateWas ? ` · written as ${esc(fmtDate(s.dateWas, { year: true }))}` : ''}</small></span></label>
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
    <div class="rrow"><span>Dates like 3/4</span><div class="seg" role="group" aria-label="Date order">${[['auto', 'Auto'], ['dmy', '3 Apr'], ['mdy', 'Mar 4']].map(([v, l]) => `<button data-act="imp-opt" data-f="order" data-v="${v}" aria-pressed="${impOpt.order === v}">${l}</button>`).join('')}</div></div>
    <p class="fine">Pounds are converted to kg. "lb" or "kg" written in the log always wins. Auto reads dates day first unless the file can only be month first (like 9/21/2026).</p></div>`;
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
  const exRow = x => row(x.id, x.name, `${(x.muscles || []).slice(0, 2).join(', ') || 'No muscles set'} · ${unitLong(x.unit)}${prog.has(x.id) ? ' · in programme' : ''}`, x);
  const el = openSheet(`<h2 class="sh-title" tabindex="-1" autofocus>${esc(g.label)}</h2>
    <p class="sh-body">${g.sess} session${g.sess === 1 ? '' : 's'} · ${plural(g.sets, 'set')}${g.variants.length > 1 ? ` · also written ${g.variants.slice(1, 5).map(v => `“${esc(v)}”`).join(', ')}${g.variants.length > 5 ? '…' : ''}` : ''}</p>
    <ul class="picklist">${row('', 'Add as a new exercise', `Named “${g.label}” · ${g.meta ? metaTxt(g.meta) : ''}`)}${top.map(exRow).join('')}${row('skip', "Don't import this lift", 'Its sets are left out')}</ul>
    ${g.meta ? `<button class="btn ghost" data-act="imp-meta-open" data-g="${gi}">Set up the new exercise (equipment, main muscle)</button>` : ''}
    <input class="inp" id="imp-pq" type="search" placeholder="Search all ${S.exercises.length} exercises" aria-label="Search exercises" autocomplete="off">
    <ul class="picklist" id="imp-pl">${S.exercises.filter(x => !top.includes(x)).map(exRow).join('')}</ul>`, { label: `Match ${g.label}` });
  el.querySelector('#imp-pq').addEventListener('input', ev => searchList(el, ev.target.value, '#imp-pl li'));
}

// ---- settings --------------------------------------------------------------------------------------------
function settings() {
  const st = S.settings;
  const tg = (f, title, sub) => `<label class="toggle"><input type="checkbox" id="st-${f}" data-input="st-toggle" data-f="${f}" ${st[f] ? 'checked' : ''}><span><b>${title}</b><small>${sub}</small></span></label>`;
  const seg = (label, act, cur, opts) => `<div class="rrow"><span>${label}</span><div class="seg" role="group" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div></div>`;
  const wording = st.wording || (st.setupAnswers?.experience === 'experienced' ? 'expert' : 'plain');
  const u = getUnits();
  const h = `<div class="box pad stack">${seg('Theme', 'theme', st.theme, [['system', 'Auto'], ['dark', 'Dark'], ['light', 'Light']])}
      ${seg('Weights', 'st-units', st.units === 'lb' ? 'lb' : 'kg', [['kg', 'kg'], ['lb', 'lb']])}
      ${seg('Words', 'st-wording', wording, [['plain', 'Plain'], ['expert', 'Gym terms']])}
      <p class="fine">${wording === 'expert' ? 'Gym terms: RIR, e1RM, calibrate, deload.' : 'Plain words: “reps left” instead of RIR, “find your weight” instead of calibrate.'} Weights are always stored in kg, so switching units never changes your history.</p></div>
    <div class="box pad stack">
      ${tg('timerSound', 'Rest timer sound', 'Two short beeps when rest is over')}
      ${tg('timerVibrate', 'Rest timer vibration', 'Buzz when rest is over')}
      ${tg('wakeLock', 'Keep screen on during workouts', 'So you can glance at the next set')}
      ${tg('autoWarmup', 'Add warm-up sets automatically', 'Ramp sets before the first working set of each exercise')}</div>
    <div class="box pad stack"><div class="row2"><label class="field"><span>Goal body weight (${u}, optional)</span><input class="inp" id="st-goal" type="number" inputmode="decimal" step="0.5" placeholder="Not set" value="${st.goalKg == null ? '' : esc(toDisp(st.goalKg))}"></label>
      <label class="field"><span>Height (cm, optional)</span><input class="inp" id="st-height" type="number" inputmode="numeric" placeholder="Not set" value="${st.heightCm == null ? '' : esc(st.heightCm)}"></label></div>
      <button class="btn ghost" data-act="st-save">Save</button></div>
    <div class="row2"><button class="btn ghost" data-act="check-update">Check for updates</button><a class="btn ghost" href="#/setup">Rebuild my split</a></div>
    <button class="btn ghost" data-act="tour">Replay the quick tour</button>
    <section class="box pad about"><p class="lbl">About and legal</p>
      <p><b>Not medical advice.</b> Suggestions are general training guidance from your own logs. Stop and see a doctor for chest pain, fainting, unusual breathlessness, palpitations, numbness, or sharp or radiating pain.</p>
      <p><b>Privacy.</b> No accounts, analytics or trackers. Your data stays on this phone; nobody else can see it. Only feedback you choose to send leaves the phone.</p>
      <p><b>Credits.</b> App icon: "we go gim" kitten artwork by rartcattos, used with credit; not covered by the app's license. Fonts: Barlow Condensed and DM Sans (SIL Open Font License). PDF import: pdf.js by Mozilla (Apache 2.0).</p>
      <p class="links"><a href="https://github.com/fir1412/we-go-gim/blob/main/PRIVACY.md" target="_blank" rel="noopener">Privacy</a> · <a href="https://github.com/fir1412/we-go-gim/blob/main/LICENSE" target="_blank" rel="noopener">License (MIT)</a> · <a href="https://github.com/fir1412/we-go-gim/blob/main/THIRD_PARTY_NOTICES.md" target="_blank" rel="noopener">Notices</a></p></section>
    <p class="fine">we go gim ${APP_VERSION}. Heart-rate and weight sync with Health Connect needs the Android app wrapper; for now, log them here.</p>`;
  return { title: 'Settings', sub: 'Make it yours', back: 'more', html: h, color: 'rest' };
}


// ---- actions -----------------------------------------------------------------------------------------------
const num = (v, d = null) => (v === '' || v == null || !isFinite(+v) ? d : +v);
async function markBackup() { if (S.settings.lastBackup !== todayIso()) await saveSettings({ lastBackup: todayIso() }); }
const backupName = () => `wegogim-backup-${todayIso()}.json`;

export const actions = {
  'setup-hide': () => saveSettings({ hideSetup: true }),
  async install() { if (!(await promptInstall())) toast('Use the browser menu → Add to Home screen', 'flat'); },
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
    slotSheet(di, Math.max(0, Math.min(j, S.program.days[di].slots.length - 1)));
  },
  async 'p-del'(el) {
    const di = +el.dataset.d, si = +el.dataset.s;
    const name = S.exById[S.program.days[di].slots[si]?.exId]?.name || 'Exercise';
    closeSheet();
    await editProgram(p => { p.days[di].slots.splice(si, 1); });
    toast(`${name} removed. "Undo changes" puts it back.`);
  },
  'p-swap'(el) {
    const di = +el.dataset.d, si = +el.dataset.s;
    pickExercise('Swap for…', async id => {
      await editProgram(p => { p.days[di].slots[si].exId = id; });
      slotSheet(di, si);
    }, S.program.days[di].slots[si]?.exId);
  },
  'p-add'(el) {
    const di = +el.dataset.d;
    pickExercise(`Add to ${S.program.days[di].name}`, async id => {
      await editProgram(p => { p.days[di].slots.push({ exId: id, sets: 3, lo: 8, hi: 12, group: '' }); });
      slotSheet(di, S.program.days[di].slots.length - 1);
    });
  },
  'p-color'(el) {
    const d = +el.dataset.d;
    openSheet(`<h2 class="sh-title">Colour for ${esc(S.program.days[d].name)}</h2><div class="chips">${COLORS.map(c => `<button class="sw big" data-act="p-color-set" data-d="${d}" data-v="${c}" style="--k:${cvar(c)}" aria-label="${c}" aria-pressed="${S.program.days[d].color === c}"></button>`).join('')}</div>`, { label: 'Pick a colour' });
  },
  async 'p-color-set'(el) { closeSheet(); await editProgram(p => { p.days[+el.dataset.d].color = el.dataset.v; }); },
  // Move a day's workout to another weekday: the two days trade places (a rest day just swaps in).
  'p-moveday'(el) {
    const from = +el.dataset.dow, src = S.program.days.find(d => d.dow === from);
    const rows = DOW_ORDER.filter(d => d !== from).map(dow => {
      const d = S.program.days.find(x => x.dow === dow);
      const what = d?.slots.length ? `swap with ${esc(d.name)}` : 'rest day';
      return `<button class="li" data-act="p-moveday-to" data-from="${from}" data-to="${dow}" style="--k:${cvar(d?.color || 'rest')}"><i class="sw"></i><span><b>${dowName(dow, true)}</b><small>${what}</small></span>${ICON.chev}</button>`;
    }).join('');
    openSheet(`<h2 class="sh-title">Move ${esc(src.name)} to…</h2><p class="sh-body">The two days trade places. Your logged sessions don't change.</p><div class="list box">${rows}</div>`, { label: `Move ${src.name}` });
  },
  async 'p-moveday-to'(el) {
    const from = +el.dataset.from, to = +el.dataset.to;
    const a = S.program.days.find(d => d.dow === from), b = S.program.days.find(d => d.dow === to);
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
    if (!pOrig) return;
    await saveProgram(structuredClone(pOrig));
    toast('Programme put back as it was', 'up');
  },
  // exercise editor
  ed(el) {
    const f = el.dataset.f;
    if (f === 'perGym') ed.perGym = el.checked;
    else if (f === 'inc' || f === 'rest') ed[f] = num(el.value, ed[f]);
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
    if (S.exercises.some(x => x.name.toLowerCase() === ed.name.toLowerCase() && x.id !== ed.id)) return toast('An exercise with that name exists', 'down');
    const isNew = !ed.id;
    if (isNew) ed.id = ed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) + '-' + Math.random().toString(36).slice(2, 6);
    delete ed.imported; delete ed._auto;
    await saveExercise(structuredClone(ed));
    toast(isNew ? 'Exercise created' : 'Exercise saved', 'up');
    edFor = null;
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
    const list = id => document.getElementById(id).value.split(/[,\s]+/).map(Number).filter(x => x > 0).sort((a, b) => a - b);
    const dumbbells = [...new Set(list('eq-db'))], plates = [...new Set(list('eq-pl'))].sort((a, b) => b - a);
    const barKg = num(document.getElementById('eq-bar').value, 20), smithBarKg = num(document.getElementById('eq-smith').value, barKg);
    if (!plates.length) return toast('Add at least one plate size', 'down');
    await saveSettings({ equip: { dumbbells, plates, barKg, smithBarKg } });
    toast('Equipment saved', 'up');
  },
  // data
  async 'backup-share'() {
    const name = backupName(), text = JSON.stringify(await exportAll());
    try {
      if (await shareFile(name, text)) { await markBackup(); return; }
      download(name, text, 'application/json');
      await markBackup();
      toast('Sharing isn\'t available here, so the file was saved to Downloads', 'flat');
    } catch (e) { if (e.name !== 'AbortError') throw e; }
  },
  async 'backup-dl'() { download(backupName(), JSON.stringify(await exportAll()), 'application/json'); await markBackup(); toast('Backup saved to Downloads', 'up'); },
  'csv-dl'() { download(`wegogim-${todayIso()}.csv`, toCSV(S.sessions, S.exById, S.settings.gyms), 'text/csv'); toast('CSV saved to Downloads', 'up'); },
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
    const body = `<b>${esc(f.name)}</b>${saved}: ${plural(cnt(d.sessions), 'session')}${dates.length ? ` (${fmtDate(dates[0], { year: true })} to ${fmtDate(dates[dates.length - 1], { year: true })})` : ''}, ${plural(cnt(d.exercises), 'exercise')}, ${plural(cnt(d.body), 'weigh-in')}.<br><br>It replaces the ${plural(S.sessions.length, 'session')} on this phone. ${S.draft ? '<b>Your workout in progress will be discarded.</b> ' : ''}An undo copy of your current data is kept.`;
    if (!(await confirmSheet({ title: 'Restore this backup?', body, ok: 'Restore', danger: true }))) return;
    await withUndo('restore', () => importAll(d));
    pOrig = null;
    toast('Backup restored', 'up');
    if (location.hash.startsWith('#/import')) go('today');
  },
  async 'undo-restore'() {
    const u = await db.getKv('undo');
    if (!u?.data) { undoMeta = null; refresh(); return toast('No undo copy found', 'flat'); }
    try { validateBackup(u.data); } catch (e) { return toast(e.message, 'down'); }
    if (!(await confirmSheet({ title: 'Put back your earlier data?', body: `Brings back the ${Number(u.data.sessions.length)} sessions from ${fmtDate(u.at, { year: true })}. What's on the phone now becomes the undo copy${S.draft ? ', and the workout in progress is discarded' : ''}.`, ok: 'Put it back' }))) return;
    await withUndo('undo', () => importAll(u.data));
    pOrig = null;
    toast('Earlier data restored', 'up');
  },
  async 'csv-in'(el) {
    const f = el.files?.[0]; el.value = '';
    if (!f) return;
    const text = await readFile(f);
    if (/^\s*\{/.test(text)) return toast('That looks like a backup file. Use "Restore from backup" above.', 'flat');
    prepImport({ sessions: sessionsFromCSV(text, { lb: impLb(), dateOrder: impOpt.order }), skipped: 0 }, f.name);
    go('import');
  },
  'rm-seed': async () => {
    if (!(await confirmSheet({ title: 'Remove the sample data?', body: 'Deletes the sessions and weigh-ins that came with the app. Your own workouts and imports stay.', ok: 'Remove', danger: true }))) return;
    await removeSeedData(); toast('Sample data removed');
  },
  async reset() {
    if (!(await confirmSheet({ title: 'Erase everything?', body: `All ${S.sessions.length} sessions, weigh-ins, cardio, programme changes and settings are deleted and the app starts over empty. ${S.settings.lastBackup ? `Your last backup file is from ${fmtDate(S.settings.lastBackup, { year: true })}.` : '<b>You have never saved a backup file.</b>'} An undo copy is kept on this phone.`, ok: 'Erase everything', danger: true }))) return;
    await withUndo('erase', () => resetAll());
    pOrig = null; imp = null;
    toast('Everything erased. Undo it under More → Backup.');
    go('today');
  },
  // import
  async 'imp-file'(el) {
    const files = [...(el.files || [])]; el.value = '';
    if (!files.length || impBusy) return;
    const year = +document.getElementById('imp-year')?.value || +todayIso().slice(0, 4);
    const src = files.length > 2 ? `${files.length} files` : files.map(f => f.name).join(', ');
    // No type filter on the picker (Android hides files shared from Drive or WhatsApp otherwise), so look inside.
    const head = async f => new Uint8Array(await f.slice(0, 5).arrayBuffer());
    const isPdfFile = async f => /\.pdf$/i.test(f.name) || f.type === 'application/pdf' || String.fromCharCode(...await head(f)) === '%PDF-';
    for (const f of files) {
      if (await isPdfFile(f)) continue;
      const b = await head(f);
      if (/\.json$/i.test(f.name) || b[0] === 0x7b) return toast('That looks like a backup file. Use "Restore a backup" below.', 'flat');
      if (/\.(jpe?g|png|gif|webp|heic|zip|docx?|xlsx?)$/i.test(f.name)) return toast(`${f.name} can't be read here. Use PDF, text or CSV.`, 'down');
    }
    const looksCsv = async f => /\.csv$/i.test(f.name) || (!(await isPdfFile(f)) && /^[^\n]*\b(date|start_time)\b[^\n]*[,;\t][^\n]*\bexercise/i.test((await readFile(f.slice(0, 2000)))));
    const csvFlags = await Promise.all(files.map(looksCsv));
    if (csvFlags.every(Boolean)) {
      const sessions = [];
      for (const f of files) sessions.push(...sessionsFromCSV(await readFile(f), { lb: impLb(), dateOrder: impOpt.order }));
      const { sessions: kept, dropped } = files.length > 1 ? dedupeSessions(sessions) : { sessions, dropped: 0 };
      prepImport({ sessions: kept, skipped: 0 }, src, '', dropped);
      return refresh(); // already on the import screen
    }
    // Each file is parsed on its own and named after it ("Monday Push 1"); copies of the same log
    // exported twice collapse to one session per date. An exact copy (same name and size) isn't read twice.
    const seen = new Set();
    const todo = files.filter(f => { const k = sessionNameFromFile(f.name) + '|' + f.size; if (seen.has(k)) return false; seen.add(k); return true; });
    let text = '', all = [], skipped = 0, last = 0;
    const paint = force => { const now = Date.now(); if (force || now - last > 120) { last = now; refresh(); } };
    try {
      for (let i = 0; i < todo.length; i++) {
        const f = todo[i];
        impBusy = { file: f.name, i, n: todo.length, page: 0, pages: 0 };
        paint(true);
        const isPdf = await isPdfFile(f);
        const t = isPdf ? await pdfToText(f, (page, pages) => { impBusy.page = page; impBusy.pages = pages; paint(); }) : await readFile(f);
        if (text.length < 20000) text += '\n' + t;
        const r = parseLogText(t, S.exercises, { year, sessionName: sessionNameFromFile(f.name), lb: impLb(), dateOrder: impOpt.order });
        for (const s of r.sessions) { s.fileTime = f.lastModified; s.file = f.name; }
        all.push(...r.sessions); skipped += r.skipped;
      }
    } catch (err) {
      impBusy = null; refresh();
      throw err;
    }
    impBusy = null;
    const { sessions, dropped } = dedupeSessions(all);
    prepImport({ sessions, skipped }, src, text, dropped);
    imp.sameFiles = files.length - todo.length;
    refresh();
  },
  'imp-parse'() {
    const text = document.getElementById('imp-text').value;
    if (!text.trim()) return toast('Paste some text first', 'flat');
    const year = +document.getElementById('imp-year').value || +todayIso().slice(0, 4);
    prepImport(parseLogText(text, S.exercises, { year, lb: impLb(), dateOrder: impOpt.order }), 'Pasted text', text);
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
  'imp-cancel'() { imp = null; refresh(); },
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
      id: uid('imp'), date: s.date, name: s.name, color: s.color || 'upper', gymId: S.settings.gymId,
      entries: s.entries.filter(e => gid.has(imp.gOf[gk(e)])).map(e => ({ exId: gid.get(imp.gOf[gk(e)]), sets: e.sets.map(x => ({ w: x.w, r: x.r, done: x.done !== false, ...(x.warm ? { warm: true } : {}) })), rir: e.rir ?? null, pain: !!e.pain, note: e.note || '' })),
      readiness: null, feel: null, hr: null, note: [...(s.dateWas ? [`Date written as ${s.dateWas} in the log.`] : []), ...s.notes].join(' · '), imported: true,
    })).filter(s => s.entries.length);
    const dates = new Set(sessions.map(s => s.date));
    const seedIds = imp.replaceSeed ? S.sessions.filter(x => x.seed && dates.has(x.date)).map(x => x.id) : [];
    // Written in bulk, then reloaded once: much faster than one save per session for years of logs.
    await db.putMany('exercises', newEx);
    await db.putMany('sessions', sessions);
    for (const id of seedIds) await db.del('sessions', id);
    await load();
    const noMuscle = newEx.filter(x => !x.muscles.length).length;
    imp = null;
    toast(`Imported ${sessions.length} session${sessions.length === 1 ? '' : 's'}${newEx.length ? ` and ${newEx.length} new exercise${newEx.length === 1 ? '' : 's'}${noMuscle ? `; ${noMuscle === 1 ? '1 needs its' : `${noMuscle} need their`} muscles set under Exercises` : ''}` : ''}`, 'up');
    go('history');
  },
  // settings
  theme: el => saveSettings({ theme: el.dataset.v }),
  tour: () => showTour(),
  feedback: () => openFeedback(APP_VERSION),
  'ios-install'() {
    openSheet(`<h2 class="sh-title">Install on iPhone</h2>
      <ol class="steps"><li>Open this page in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an arrow).</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol>
      <p class="fine">It then opens full screen from the kitten icon, works offline and updates itself. Your data stays on this phone.</p>
      <button class="btn" data-act="close-sheet">Got it</button>`, { label: 'Install on iPhone' });
  },
  'close-sheet': () => closeSheet(),
  async 'check-update'() {
    if (!navigator.onLine) return toast("You're offline. Connect and try again.", 'flat');
    toast('Checking for updates…');
    const r = await checkForUpdates().catch(() => 'error');
    toast(r === 'updating' ? 'Update found. The app reloads when it is ready.' : r === 'latest' ? `You're on the latest version (${APP_VERSION})` : r === 'unsupported' ? 'Updates work once the app is opened from its website' : "Couldn't check right now. Try again later.", r === 'error' ? 'down' : 'up');
  },
  'st-toggle': el => saveSettings({ [el.dataset.f]: el.checked }),
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
  if (!location.hash.startsWith('#/program')) pOrig = null;
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
      <textarea class="inp mono" id="split-text" rows="14" placeholder="Monday – Chest&#10;1. Bench Press – 4 × 6–8&#10;2. Incline Dumbbell Press – 3 × 8–10&#10;15 min incline walk&#10;&#10;Tuesday – Back&#10;1. Lat Pulldown – 3 × 8–10">${esc(pst.text)}</textarea>
      <button class="btn" data-act="split-read">Read my split</button>`;
    return { title: 'Paste a split', sub: 'Turn your plan into the programme', back: 'program', html: h, color: 'push' };
  }
  const opts = sel => `<option value="">+ Add as a new exercise</option>${S.exercises.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}`;
  const n = pst.days.reduce((a, d) => a + d.items.length, 0), nNew = Object.values(pst.map).filter(v => !v).length;
  let h = `<div class="kpis"><div class="kpi"><b>${pst.days.length}</b><span>training days</span></div><div class="kpi"><b>${n}</b><span>exercises</span></div><div class="kpi"><b>${nNew}</b><span>new to the app</span></div></div>
    <p class="fine">Check each match. Your logged history stays; it just follows the matched exercises. Days not listed become rest days.</p>`;
  if (pst.notAdded?.length) h += `<div class="warn" style="--k:var(--flat)"><b>Not added (${pst.notAdded.length})</b><span>These lines aren't sets × reps, so they can't be programme exercises. Distance, time and conditioning work can go under Insights → Cardio.</span><ul class="notadded">${pst.notAdded.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>`;
  pst.days.forEach((d, di) => {
    h += `<section class="box pad wz-day" style="--k:${cvar(d.color)}"><header><b>${dowName(d.dow)}</b><span>${esc(d.name)}</span></header>${d.sub ? `<p class="fine">${esc(d.sub)}</p>` : ''}<div class="stack">`;
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
    pst = null; pOrig = null;
    toast('Your split is now the programme', 'up');
    go('program');
  },
});
