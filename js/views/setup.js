// First-run setup: start fresh, bring old logs, or answer a few questions for a personalised split.
// Steps live in the URL (#/setup, #/setup/1 … #/setup/7, #/setup/plan) so the phone's Back button walks back through them.
import { S, saveProgram, saveSettings, refresh } from '../state.js';
import { PROGRAM, TEMPLATES } from '../seed.js';
import { buildSplit, explainSplit, weeklyVolume, targetsFor, planGaps, dayMinutes, baseSets } from '../split.js';
import { MUSCLES } from '../engine.js';
import { esc, pill, cvar, kstyle, dowName, dowLetter, toast, ICON, T, helpTip, confirmSheet, langPicker } from '../ui.js';
import { LANGS, getLang } from '../i18n.js';
import { go, showTour } from '../app.js';

const Q = [
  { k: 'goal', title: "What's your main goal?", one: true, opts: [['muscle', 'Build muscle'], ['fatloss', 'Lose fat, keep muscle'], ['strength', 'Get stronger'], ['general', 'Stay fit and healthy']] },
  { k: 'days', title: 'Which days can you train?', hint: 'Pick the days you can usually make. 3 to 5 suits most people; at least one rest day stays in.', days: true },
  { k: 'experience', title: 'How long have you been lifting?', one: true, opts: [['new', 'Under 6 months, or never'], ['some', '6 months to 2 years'], ['experienced', 'Over 2 years']] },
  { k: 'minutes', title: 'How long is a session?', hint: 'Warm-ups not included. Plans are timed with full rest between sets.', one: true, opts: [[30, '30 min'], [45, '45 min'], [60, '60 min'], [75, '75+ min']] },
  { k: 'equipment', title: 'Where do you train?', one: true, opts: [['gym', 'A full gym'], ['db', 'Dumbbells and a bench'], ['home', 'Home, bodyweight only']], hints: { home: 'Chin-ups need a bar, and inverted rows a sturdy table or bar. Swap any exercise later under More → Programme.', db: 'Pull-ups need a bar; if you have none, swap them for rows later under More → Programme.' } },
  { k: 'focus', title: 'Anything to prioritise?', hint: 'Optional. Up to two; those muscles get extra sets.', max: 2, opts: [['Chest', 'Chest'], ['Back', 'Back muscles'], ['Side delts', 'Shoulders'], ['Biceps', 'Biceps'], ['Triceps', 'Triceps'], ['Quads', 'Quads'], ['Hamstrings', 'Hamstrings'], ['Glutes', 'Glutes']] },
  { k: 'protect', title: 'Any joints to go easy on?', hint: 'Optional. The exercises that load them most are left out. Pain that is sharp or getting worse needs a doctor or physio.', opts: [['lowerback', 'Lower back'], ['shoulders', 'Shoulders'], ['knees', 'Knees']] },
];
const PROTECT_NOTE = {
  lowerback: 'No barbell squats, deadlifts, RDLs or hip thrusts; hamstrings are trained with leg curls instead.',
  shoulders: 'No overhead pressing, dips or overhead triceps work.',
  knees: 'No lunges, split squats, barbell or hack squats, or leg extensions.',
};

let st = null;
const blank = () => ({ goal: null, days: [], experience: null, minutes: null, equipment: null, focus: [], protect: [] });
// Rebuilding keeps your last answers, so changing one thing is a few taps.
// Answers in progress survive a reload (per tab, never shared).
const DRAFT = 'wgg-setup-draft';
const keep = () => { try { sessionStorage.setItem(DRAFT, JSON.stringify(st.a)); } catch {} };
const draft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch { return null; } };
const fresh = () => {
  const prev = draft() || S.settings.setupAnswers;
  return { a: prev ? { ...blank(), ...structuredClone(prev) } : blank(), plan: null, depth: 0 };
};
/** Experience already answered on the welcome screen: the wizard skips that question. */
const skipQ = i => Q[i]?.k === 'experience' && !!S.settings.experience && !!st?.a.experience;
const stepPath = i => { let n = i; while (n < Q.length && skipQ(n)) n++; return n >= Q.length ? 'setup/plan' : `setup/${n + 1}`; };
const answered = (q, a) => (q.days ? a.days.length >= 1 && a.days.length <= 6 : q.one ? a[q.k] != null : true);
/** Existing programme or history: using a new plan replaces the programme (logs stay). */
const returning = () => S.sessions.length > 0 || !!S.settings.onboarded;

export function render(route) {
  if (!st) st = fresh();
  const arg = route?.args?.[0];
  if (!arg) return start();
  if (arg === 'templates') return templates();
  // Never show a step whose earlier answers are missing (deep links, reloads).
  const firstGap = Q.findIndex(q => !answered(q, st.a));
  if (arg === 'plan') {
    if (firstGap >= 0) { setTimeout(() => go(`setup/${firstGap + 1}`), 0); return { title: 'Your split', html: '' }; }
    return preview();
  }
  const step = Math.min(Q.length, Math.max(1, +arg || 1)) - 1;
  if (firstGap >= 0 && firstGap < step) { setTimeout(() => go(`setup/${firstGap + 1}`), 0); return { title: 'Your split', html: '' }; }
  return question(step);
}

function question(step) {
  const q = Q[step], v = st.a[q.k];
  const asked = Q.map((_, i) => i).filter(i => !skipQ(i)), pos = asked.indexOf(step);
  let h = `<div class="wz-top"><div class="dots" aria-hidden="true">${asked.map(i => `<i class="${i === step ? 'on' : i < step ? 'done' : ''}"></i>`).join('')}</div><span class="fine">${pos + 1} of ${asked.length}</span></div>
    <h2 class="wz-q">${esc(q.title)}</h2>${q.hint ? `<p class="fine">${esc(q.hint)}</p>` : ''}`;
  if (q.days) {
    h += `<div class="wz-days" role="group" aria-label="Training days">${[1, 2, 3, 4, 5, 6, 0].map(d => `<button data-act="wz-day" data-v="${d}" aria-pressed="${v.includes(d)}" aria-label="${esc(dowName(d, true))}"><b>${dowLetter(d)}</b><span>${dowName(d)}</span></button>`).join('')}</div>
      <p class="fine">${v.length ? `${v.length} day${v.length === 1 ? '' : 's'} a week` : 'No days picked yet'}${backToBack(v) ? ' · a rest day between sessions helps you recover, but back-to-back days work too' : ''}</p>`;
  } else {
    h += `<div class="wz-opts ${q.one ? '' : 'multi'}" role="group" aria-label="${esc(q.title)}">${q.opts.map(([val, label]) => {
      const on = q.one ? v === val : v.includes(val);
      return `<button data-act="wz-pick" data-v="${esc(val)}" aria-pressed="${on}">${esc(label)}${on ? ICON.check : ''}</button>`;
    }).join('')}</div>`;
    if (q.hints?.[v]) h += `<p class="fine">${esc(q.hints[v])}</p>`;
    if (q.k === 'protect' && v.length) h += `<p class="fine">${esc(v.map(p => PROTECT_NOTE[p]).join(' '))}</p>`;
  }
  const ok = answered(q, st.a);
  const last = step === Q.length - 1;
  h += `<div class="cta"><div class="row2"><button class="btn ghost" data-act="wz-back" data-ctx="nav">Back</button><button class="btn" data-act="wz-next" data-step="${step}" ${ok ? '' : 'disabled'}>${last ? 'See my plan' : !q.one && !q.days && !v.length ? 'Skip' : 'Next'}</button></div></div>`;
  return { title: 'Your split', sub: 'A few quick questions', html: h, color: 'push' };
}

// Two full-body days in a row are the ones worth flagging.
function backToBack(days) {
  if (days.length < 2 || days.length > 3) return false;
  const s = new Set(days);
  return days.some(d => s.has((d + 1) % 7));
}

function start() {
  const back = returning();
  const n = S.sessions.length;
  const h = back
    ? `<p class="fine">Answer a few questions for a new weekly plan, or go back to the example split.</p>
    <div class="warn wz-warn" style="--k:var(--flat)"><b>Replaces your programme.</b><span>Your current weekly plan is swapped for the new one when you tap “Use this plan”.${n ? ` Your ${n} logged session${n === 1 ? '' : 's'}, levels and personal bests stay.` : ''}</span></div>
    <div class="list box wz-choices">
      <button class="li" data-act="wz-begin" style="--k:var(--push)"><i class="sw"></i><span><b>Build my split</b><small>${S.settings.setupAnswers ? 'Your last answers are filled in; change what you need.' : '7 quick questions, then a plan to review before anything changes.'}</small></span>${ICON.chev}</button>
      <a class="li" href="#/setup/templates" style="--k:var(--legs)"><i class="sw"></i><span><b>Pick a ready-made plan</b><small>Full body, upper / lower, push pull legs, 5×5, home with no equipment, or easy on the joints.</small></span>${ICON.chev}</a>
      <button class="li" data-act="wz-example" style="--k:var(--pull)"><i class="sw"></i><span><b>Use the example split</b><small>5 days: push, pull, legs, upper, lower. Replaces your programme straight away.</small></span>${ICON.chev}</button>
    </div>
    <button class="linkbtn center" data-act="wz-cancel">Keep my current programme</button>`
    : `<div class="wz-hero"><img src="icons/icon-192.png" alt="" width="72" height="72"><h2>Let's set you up</h2><p>This app fills in each workout for you, based on your last one. How do you want to start?</p></div>
    ${prefs()}
    <button class="btn wz-main" data-act="wz-begin">Build my plan <small>· ${S.settings.experience ? 6 : 7} quick questions, about a minute</small></button>
    <details class="box wz-more"><summary>Other ways to start</summary><div class="list wz-choices">
      <a class="li" href="#/setup/templates" style="--k:var(--legs)"><i class="sw"></i><span><b>Pick a ready-made plan</b><small>Full body, upper / lower, push pull legs, 5×5, home with no equipment, or easy on the joints.</small></span>${ICON.chev}</a>
      <button class="li" data-act="wz-logs" style="--k:var(--legsb)"><i class="sw"></i><span><b>I already have logs</b><small>Import old PDFs, notes, or a Hevy, Strong or spreadsheet CSV, or restore a backup from this app.</small></span>${ICON.chev}</button>
      <button class="li" data-act="wz-own" style="--k:var(--upper)"><i class="sw"></i><span><b>I have my own split</b><small>Paste your plan as text (from a note, a coach or a chat).</small></span>${ICON.chev}</button>
      <button class="li" data-act="wz-example" style="--k:var(--pull)"><i class="sw"></i><span><b>Use the example split</b><small>5 days: push, pull, legs, upper, lower, for a full gym.</small></span>${ICON.chev}</button>
    </div></details>
    <button class="linkbtn center" data-act="wz-skip">Skip for now</button>
    <p class="fine center-t">Skipping starts you on Full body, 3 days: the easiest plan to begin with. Change or rebuild it any time under More.</p>`;
  return back
    ? { title: 'Rebuild my split', sub: 'Programme', html: h, color: 'push', back: 'settings' }
    : { title: 'Welcome', sub: 'we go gim', html: h, color: 'push' };
}

/** Units and experience, asked up front so every screen after this reads right. Experience picks plain words or gym terms. */
function prefs() {
  const u = S.settings.units === 'lb' ? 'lb' : 'kg';
  const x = S.settings.experience || st.a.experience;
  const seg = (label, act, cur, opts) => `<div class="rrow"><span>${label}</span><div class="seg" role="group" aria-label="${esc(label)}">${opts.map(([v, l]) => `<button data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div></div>`;
  return `<div class="box pad stack wz-prefs">${langPicker(getLang(), LANGS)}
    ${seg('Text size', 'wz-text', S.settings.textSize || 'normal', [['normal', 'Normal'], ['large', 'Large'], ['xl', 'Extra large']])}<p class="lbl wz-explbl">How long have you lifted weights?</p>
    <div class="seg wz-expseg" role="group" aria-label="How long have you lifted weights?">${[['new', 'Under 6 months'], ['some', '6 months to 2 years'], ['experienced', 'Over 2 years']].map(([v, l]) => `<button data-act="wz-exp" data-v="${v}" aria-pressed="${x === v}">${l}</button>`).join('')}</div>
    ${seg('Weights in', 'wz-units', u, [['kg', 'kg'], ['lb', 'lb']])}
    <p class="fine">${getLang() !== 'en' ? 'This sets your starting weights.' : x === 'experienced' ? 'You\'ll see gym terms like RIR and e1RM.' : x ? 'You\'ll see plain words like "reps left" instead of gym jargon.' : 'This sets the words the app uses and your starting weights.'} Change either in Settings.</p></div>`;
}

/** Ready-made plans to start from. */
function templates() {
  const back = returning();
  let h = `<p class="fine">Pick one to start. Every exercise, set and rep range can be changed later under More → Programme.${back ? ' Your logged sessions, levels and bests stay.' : ''}</p>`;
  for (const t of TEMPLATES) {
    const days = t.program.days.filter(d => d.slots.length);
    h += `<section class="box pad tpl"><div class="rrow"><b>${esc(t.name)}</b>${pill(t.level, t.level === 'Experienced' ? 'flat' : 'up')}</div>
      <p class="fine">${esc(t.about)} ${esc(t.gear)}.</p>
      <p class="tdays">${days.map(d => `<span style="${kstyle(d.color)}"><b>${dowName(d.dow)}</b> ${esc(d.name)}</span>`).join('')}</p>
      <button class="btn ghost" data-act="wz-tpl" data-id="${t.id}">Use this plan</button></section>`;
  }
  return { title: 'Ready-made plans', sub: 'Pick one to start', html: h, color: 'legs', back: back ? 'program' : 'setup' };
}

function preview() {
  if (!st.plan) st.plan = buildSplit(st.a, S.exById);
  const p = st.plan;
  const vol = weeklyVolume(p, S.exById), tg = targetsFor(st.a), gaps = planGaps(p, st.a, S.exById);
  let h = `<h2 class="wz-q">Your plan</h2><p class="fine">${esc(explainSplit(st.a))} Your weights are worked out in your first workouts.</p>`;
  for (const d of p.days) {
    if (!d.slots.length) continue;
    h += `<section class="box wz-day" style="${kstyle(d.color)}"><header><b>${dowName(d.dow)}</b><span>${esc(d.name)}</span><small>about ${dayMinutes(d, S.exById)} min</small></header><ul>${d.slots.map(s => {
      const ex = S.exById[s.exId];
      return `<li><span>${esc(ex?.name || s.exId)}</span><em>${s.sets} × ${s.lo}–${s.hi}</em></li>`;
    }).join('')}</ul></section>`;
  }
  const lo = baseSets(st.a.experience);
  h += `<div class="box pad wz-vol"><p class="lbl">${esc(T('sets').replace(/^\w/, c => c.toUpperCase()))} per muscle, per week</p><div class="chips">${MUSCLES.filter(m => vol[m] || tg[m]).map(m => {
    const raw = vol[m] || 0, v = Math.round(raw), t = tg[m];
    return pill(`${m} ${v}`, !t ? 'mute' : raw >= t[0] - 1 ? 'up' : v >= t[0] / 2 ? 'flat' : 'down');
  }).join('')}</div>
    <p class="fine">Muscles that only help in ${esc(T('compound'))} ${helpTip('compound')} count as half a set. Around ${lo}–20 sets a week suits most people at your level; more isn't always better.</p>`;
  // Many gaps: one summary line, plus any gap with its own reason (like side delts at home).
  const listed = gaps.length > 4 ? gaps.filter(g => !g.generic) : gaps;
  if (gaps.length > 4) h += `<p class="fine">Room to grow: ${gaps.length} muscles have fewer sets than that for now, which is a fine place to start. Add a day or longer sessions later to do more.</p>`;
  if (listed.length) h += `<ul class="wz-gaps">${listed.map(g => `<li><b>${esc(g.m)} ${g.sets}</b> <span>${esc(g.why)}</span></li>`).join('')}</ul>`;
  if (st.a.protect.length) h += `<p class="fine">${esc(st.a.protect.map(x => PROTECT_NOTE[x]).join(' '))}</p>`;
  h += `<p class="fine">Change anything later under More → Programme.</p></div>`;
  if (returning()) h += `<p class="fine">Using this plan replaces your current programme. Logged sessions, levels and bests stay.</p>`;
  h += `<div class="cta"><div class="row2"><button class="btn ghost" data-act="wz-back">Change answers</button><button class="btn" data-act="wz-use" style="--c:var(--up)">Use this plan</button></div></div>`;
  return { title: 'Your split', sub: 'Review before saving', html: h, color: 'up' };
}

async function finish(dest, { tour = true } = {}) {
  await saveSettings({ onboarded: true });
  st = null;
  try { sessionStorage.removeItem(DRAFT); } catch {}
  go(dest);
  if (tour && !S.settings.tourDone) setTimeout(() => showTour(1), 250);
}

const cur = () => location.hash.replace(/^#\/?setup\/?/, '');
/** Forward steps push history, so Back (ours or the phone's) returns to the previous step. */
const fwd = path => { st.depth++; go(path); };
const top = () => { const sc = document.getElementById('screen'); if (sc) sc.scrollTop = 0; };

export const actions = {
  'wz-begin'() { fwd('setup/1'); },
  async 'wz-example'() {
    const back = returning();
    await saveProgram(structuredClone(PROGRAM));
    toast(back ? 'Programme replaced with the example split' : 'Example split ready. Change it any time under More → Programme.', 'up');
    await finish('today', { tour: !back });
  },
  async 'wz-logs'() { await finish('import', { tour: false }); },
  async 'wz-own'() { await finish('paste', { tour: false }); },
  // Skip: straight to Today, no tour, and one line saying which plan is loaded.
  async 'wz-skip'() {
    const fb = TEMPLATES.find(x => x.id === 'fb3');
    if (fb) await saveProgram(structuredClone(fb.program));
    await finish('today', { tour: false });
    toast('Full body, 3 days is your plan. Change it under More → Programme.', 'up');
  },
  'wz-units': el => saveSettings({ units: el.dataset.v === 'lb' ? 'lb' : 'kg' }),
  'wz-text': el => saveSettings({ textSize: ['large', 'xl'].includes(el.dataset.v) ? el.dataset.v : 'normal' }),
  'wz-wording': el => saveSettings({ wording: el.dataset.v === 'expert' ? 'expert' : 'plain' }),
  'wz-exp'(el) {
    const v = el.dataset.v;
    st.a.experience = v; st.plan = null; keep();
    saveSettings({ experience: v, wording: v === 'experienced' ? 'expert' : 'plain' });
  },
  async 'wz-tpl'(el) {
    const t = TEMPLATES.find(x => x.id === el.dataset.id);
    if (!t) return;
    const back = returning();
    if (back && !(await confirmSheet({ title: `Switch to ${t.name}?`, body: 'Your weekly plan is replaced. Logged sessions, levels and bests stay.', ok: 'Use this plan' }))) return;
    await saveProgram(structuredClone(t.program));
    toast(`${t.name} is your plan. Change anything under More → Programme.`, 'up');
    await finish('today', { tour: !back });
  },
  'wz-cancel'() { st = null; try { sessionStorage.removeItem(DRAFT); } catch {} go('settings'); },
  'wz-day'(el) {
    const d = +el.dataset.v, a = st.a.days;
    const i = a.indexOf(d);
    if (i >= 0) a.splice(i, 1);
    else if (a.length >= 6) return toast('Keep at least one rest day', 'flat');
    else a.push(d);
    st.plan = null; keep(); refresh();
  },
  'wz-pick'(el) {
    const q = Q[(+cur() || 1) - 1];
    if (!q) return;
    const raw = el.dataset.v, val = q.k === 'minutes' ? +raw : raw;
    st.plan = null;
    if (q.one) {
      st.a[q.k] = val;
      keep();
      // One tap answers single-choice questions; a hint for this answer keeps you here so you can read it.
      refresh();
      if (q.hints?.[val]) return;
      const at = cur();
      setTimeout(() => { if (cur() === at && st) { fwd(stepPath(Q.indexOf(q) + 1)); top(); } }, 180);
      return;
    }
    const a = st.a[q.k], i = a.indexOf(val);
    if (i >= 0) a.splice(i, 1);
    else if (q.max && a.length >= q.max) return toast(`Pick up to ${q.max}`, 'flat');
    else a.push(val);
    keep(); refresh();
  },
  'wz-back'() {
    const c = cur(), prev = c === 'plan' ? String(Q.length) : +c > 1 ? String(+c - 1) : '';
    // Walk back through the same history the phone's Back button uses, unless we arrived here directly.
    if (st.depth > 0) { st.depth--; history.back(); } else go(prev ? `setup/${prev}` : 'setup');
  },
  'wz-next'(el) { fwd(stepPath(+el.dataset.step + 1)); top(); },
  async 'wz-use'() {
    await saveProgram(structuredClone(st.plan));
    const back = returning();
    await saveSettings({ setupAnswers: structuredClone(st.a) });
    toast(back ? 'New plan saved. Your history is untouched.' : 'Your plan is saved', 'up');
    await finish('today', { tour: !back });
  },
};
