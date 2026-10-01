import { S, todayIso, refresh, dayForDate, saveSettings } from '../state.js';
import { bodySVG, regionById } from '../anatomy.js';
import { hasEstMax, trendRange, muscleXP, levelFor, athleteLevel, titleFor, muscleTrends, MUSCLES, XP_SET, XP_HELPER, XP_PR, daysBetween, isKg, fmtLoad, plannedXP, addDays, unitShort, toDisp } from '../engine.js';
import { esc, fmtDate, pill, STATUS, num, cvar, kstyle, dowName, ICON, T, helpTip, expertWording } from '../ui.js';
import { progressNav } from './insights.js';
import { badgeWall, gameOn } from '../gamify.js';

/** Lifters who arrive with real history (experienced in setup, or a big import) never see beginner titles. */
function seasoned() {
  const imported = S.sessions.filter(s => s.imported).length;
  return S.settings.setupAnswers?.experience === 'experienced' || imported >= 12;
}
/** The overall title. The first steps are neutral instead of "Rookie". */
export function athleteTitle(L) {
  if (L < 3) return seasoned() ? 'Experienced lifter' : 'Getting started';
  if (L < 5) return seasoned() ? 'Experienced lifter' : 'Building momentum';
  return `${titleFor(L)} lifter`;
}
/** A muscle's title; low levels read as a starting point, not a verdict. */
export const muscleTitle = L => (L < 3 ? 'Building a base' : L < 5 ? 'Building' : titleFor(L));
/** The level as data (this screen's hero and the share picture): the athlete level and title, XP in all, the muscles
 *  that levelled up in the last 3 days (earned here, not imported), and the strongest muscle. */
export function levelData(t = todayIso(), data = muscleXP(S.sessions, S.exById, t)) {
  const ath = athleteLevel(data.total);
  const top = Object.entries(data.muscles).sort((a, b) => b[1].xp - a[1].xp)[0];
  return { L: ath.level, title: athleteTitle(ath.level), total: data.total, fresh: data.levelUps.filter(u => !u.imported && u.date <= t && daysBetween(u.date, t) <= 3), top: top ? { muscle: top[0], level: levelFor(top[1].xp).level } : null };
}
const setWord = () => (T('sets') === 'sets' ? 'working set' : 'hard set');

let mode = 'level';   // level | week
let sel = null;       // selected muscle
let region = null;    // id of the map region tapped last (a finer muscle inside sel), or null

function fillFor(m, data) {
  const r = data.muscles[m];
  if (mode === 'week') {
    const w = r?.week || 0;
    if (!w) return { fill: 'var(--card)', op: 1 };
    return { fill: 'var(--up)', op: +(0.25 + 0.75 * Math.min(1, w / 120)).toFixed(2) };
  }
  if (!r || !r.xp) return { fill: 'var(--card)', op: 1 };
  // Relative to your strongest muscle, so differences show even at low levels.
  const xs = Object.values(data.muscles).map(x => x.xp);
  const t = Math.min(1, r.xp / Math.max(1, ...xs));
  return { fill: `color-mix(in srgb, var(--push) ${Math.round(t * 100)}%, var(--legs))`, op: +(0.55 + 0.45 * t).toFixed(2) };
}

/** Anatomical front and back views, male or female build, coloured by level or by this week's XP. */
function diagram(data) {
  const lvl = m => (data.muscles[m]?.xp ? levelFor(data.muscles[m].xp).level : 0);
  // Region tooltips keep their Latin names (no plain-English rewrite), but are still translated.
  return bodySVG({ female: bodyType() === 'female', fill: m => fillFor(m, data), sel, region, level: lvl, esc }).replace('<svg ', '<svg data-noplain ');
}
/** Build for the map: set on this screen, else taken from the strength-standards choice, else male. */
const bodyType = () => S.settings.bodyType || (S.settings.stdSex === 'women' ? 'female' : 'male');

/** The finer muscle tapped on the map, if it belongs to the selected group, and a way to see it in 3D. */
function tapped(m) {
  const r = regionById(region);
  if (!r || r.group !== m) return '';
  return `<p class="fine mregion"><span>You tapped:</span> <b data-noplain>${esc(r.part)}</b> · <a href="#/atlas/g/${encodeURIComponent(m)}">See it in 3D</a></p>`;
}

const xpf = n => Math.round(n).toLocaleString('en-GB');

function bar(pct, k = 'push') {
  return `<span class="xpbar" style="--k:var(--${k})"><i style="width:${Math.max(2, Math.min(100, pct * 100)).toFixed(1)}%"></i></span>`;
}

export function render() {
  const t = todayIso();
  const data = muscleXP(S.sessions, S.exById, t);
  const ranked = MUSCLES.map(m => ({ m, r: data.muscles[m] || { xp: 0, week: 0, events: [], lastDate: null } }))
    .map(x => ({ ...x, L: levelFor(x.r.xp) })).sort((a, b) => b.r.xp - a.r.xp);
  if (!sel || !MUSCLES.includes(sel)) sel = ranked[0]?.m || 'Chest';
  const ath = athleteLevel(data.total), lv = levelData(t, data);
  const weekTotal = ranked.reduce((a, x) => a + x.r.week, 0);

  let h = progressNav('levels');
  // XP is named on this screen, so it's explained here first.
  if (!expertWording()) h += `<p class="fine xpexp"><b>XP means experience points.</b> Every set you finish gives points to the muscles it works. More points take a muscle to a higher level.</p>`;
  if (!data.total) h += `<div class="box pad emptyact"><b>No XP yet</b><p class="fine">Every working set earns XP for the muscles it trains, and beating a best earns a bonus. Finish your first workout, or import old logs so your levels start from your real history.</p><div class="row2"><a class="btn" href="#/today">Go to today's workout</a><a class="btn ghost" href="#/import">Import old logs</a></div></div>`;
  h += `<div class="lvlhero"><div class="lvbadge"><span>LVL</span><b>${ath.level}</b></div>
    <div class="grow"><b class="lvtitle">${esc(lv.title)}</b><small>${xpf(ath.into)} / ${xpf(ath.need)} XP to level ${ath.level + 1} · +${xpf(weekTotal)} XP this week</small>${bar(ath.pct, 'on')}</div></div>`;
  // Pictures of the level and the streak (share.js): only the user's own data, never the sample's, and only with the game on.
  const share = gameOn() && !S.settings.sample;
  if (share && data.total) h += `<div class="rrow"><button class="chipbtn" data-act="level-share">${ICON.share} Share my level</button></div>`;

  // Only level-ups earned in the app: an import of old logs shouldn't fire a burst of banners.
  const fresh = lv.fresh;
  if (fresh.length) h += `<div class="lvup-banner" role="status"><b>${ICON.star}Level up!</b><span>${fresh.slice(-4).reverse().map(u => `${esc(u.muscle)} → Lv${u.level}${u.date === t ? '' : ` (${fmtDate(u.date)})`}`).join(' · ')}</span></div>`;
  h += nextXP(data, t);

  h += `<div class="rrow"><div class="seg" role="group" aria-label="Colour the map by">${[['level', 'Level'], ['week', 'This week']].map(([v, l]) => `<button data-act="mode" data-v="${v}" aria-pressed="${mode === v}">${l}</button>`).join('')}</div>
    <span class="legend">${mode === 'level' ? '<i class="lg" style="background:var(--legs)"></i>low <i class="lg" style="background:var(--push)"></i>high' : '<i class="lg" style="background:var(--up);opacity:.3"></i>little <i class="lg" style="background:var(--up)"></i>a lot'}</span></div>`;
  h += `<div class="box diagram">${diagram(data)}<div class="seg sm bodyseg" role="group" aria-label="Body shown">${[['male', 'Male'], ['female', 'Female']].map(([v, l]) => `<button data-act="body" data-v="${v}" aria-pressed="${bodyType() === v}">${l}</button>`).join('')}</div></div>
    <a class="btn ghost atlas-open" href="#/atlas/g/${encodeURIComponent(sel)}">${ICON.levels}3D muscle map: see every muscle</a>`;

  // selected muscle card
  const cur = ranked.find(x => x.m === sel);
  const tr = muscleTrends(S.sessions, S.exercises).find(x => x.muscle === sel);
  const nextDay = nextDayFor(sel, t);
  const days = cur.r.lastDate ? daysBetween(cur.r.lastDate, t) : null;
  h += `<section class="box mcard"><header><div class="lvbadge sm"><span>LVL</span><b>${cur.L.level}</b></div><div class="grow"><h2>${esc(sel)}</h2><small>${esc(muscleTitle(cur.L.level))} · ${xpf(cur.r.xp)} XP total</small></div>${cur.r.week ? pill(`+${cur.r.week} this week`, 'up') : ''}</header>
    ${tapped(sel)}
    ${bar(cur.L.pct)}<p class="fine">${xpf(cur.L.need - cur.L.into)} XP to level ${cur.L.level + 1}. ${(() => { const n = Math.ceil((cur.L.need - cur.L.into) / XP_SET); return `That's about ${n} ${setWord()}${n === 1 ? '' : 's'}, fewer with a PR.`; })()}</p>
    <dl class="facts">
      <div><dt>Last trained</dt><dd>${days == null ? 'Never' : days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} ago`}</dd></div>
      <div><dt>Next session</dt><dd>${nextDay ? `${esc(nextDay.name)} · ${nextDay.when}` : 'Not in your programme'}</dd></div>
      ${tr ? `<div><dt>Lead lift</dt><dd><a href="#/ex/${esc(tr.ex.id)}">${esc(tr.ex.name)}</a> ${pill(STATUS[tr.status][0], STATUS[tr.status][1])}</dd></div>` : ''}
      ${tr ? `<div><dt>${hasEstMax(tr.ex) ? `${esc(T('estMax'))} ${helpTip('estMax')}` : 'Top load'}</dt><dd>${esc(trendRange(tr.ex, tr))}</dd></div>` : ''}
    </dl>`;
  const ev = cur.r.events.slice(-5).reverse();
  if (ev.length) h += `<p class="lbl">Recent XP</p><ul class="xplist">${ev.map(e => `<li><a href="#/session/${esc(e.sessionId)}"><span>${fmtDate(e.date)}</span><span class="grow">${esc(e.why)}</span><b>+${e.xp}</b></a></li>`).join('')}</ul>`;
  h += `</section>`;

  // all muscles
  h += `<p class="lbl">All muscles</p><ul class="box lvlist">`;
  for (const x of ranked) {
    const ago = x.r.lastDate ? daysBetween(x.r.lastDate, t) : null;
    const rust = ago == null ? `<small class="rust">not trained yet</small>` : ago > 9 ? `<small class="rust">${ago} days ago</small>` : '';
    h += `<li><button data-act="muscle" data-m="${esc(x.m)}" aria-pressed="${x.m === sel}"><span class="lvbadge xs"><b>${x.L.level}</b></span><span class="grow"><span class="rowt"><b>${esc(x.m)} ${rust}</b><small>${x.r.xp ? `${xpf(x.L.into)}/${xpf(x.L.need)}` : '0 XP'}${x.r.week ? ` · <em class="wk">+${x.r.week}</em>` : ''}</small></span>${bar(x.L.pct, x.r.xp ? 'push' : 'mute')}</span></button></li>`;
  }
  h += `</ul>`;

  if (gameOn()) h += badgeWall(t, share ? `<button class="chipbtn" data-act="streak-share">${ICON.share} Share my streak</button>` : '');
  const ups = data.levelUps.slice(-6).reverse();
  if (ups.length) h += `<p class="lbl">Recent level-ups</p><ul class="box xplist pad">${ups.map(u => `<li><span>${fmtDate(u.date)}</span><span class="grow">${esc(u.muscle)} reached level ${u.level}</span><b class="lvstar">${ICON.star}</b></li>`).join('')}</ul>`;
  const nImp = S.sessions.filter(s => s.imported).length;
  if (nImp) h += `<p class="fine">Includes ${nImp} imported session${nImp === 1 ? '' : 's'}: your past training counts, so levels start where your history left you.</p>`;
  h += `<p class="fine">Bars show progress inside the current level. Muscles not trained for 10+ days are marked, so nothing gets left behind. Each ${setWord()} earns ${XP_SET} XP for its main muscle and ${XP_HELPER} for helpers. Beating your best on a lift adds ${XP_PR} (machines and cables only against the same gym). Warm-ups and skipped sets earn nothing, so XP tracks real work, not app opens.</p>`;
  return { title: 'Levels', sub: `${data.total.toLocaleString('en-GB')} XP earned${S.settings.sample ? ' · sample' : ''}`, html: h, color: 'push' };
}

/** Preview of what the next planned session is worth, and which muscles it could level up. */
function nextXP(data, t) {
  for (let i = 0; i < 7; i++) {
    const d = addDays(t, i), day = dayForDate(d);
    if (!day.slots.length) continue;
    if (i === 0 && S.sessions.some(s => s.date === t && !s.seed)) continue;
    const gain = plannedXP(day, S.exById);
    const rows = Object.entries(gain).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return '';
    const total = rows.reduce((a, [, g]) => a + g, 0);
    const when = i === 0 ? 'today' : i === 1 ? 'tomorrow' : dowName(new Date(d + 'T00:00:00Z').getUTCDay(), true);
    const chips = rows.map(([m, g]) => {
      const xp = data.muscles[m]?.xp || 0, a = levelFor(xp).level, b = levelFor(xp + g).level;
      return `<button class="xpchip ${b > a ? 'lvup' : ''}" data-act="muscle" data-m="${esc(m)}">${esc(m)} <b>+${g}</b>${b > a ? ` <span>→ Lv${b}</span>` : ''}</button>`;
    }).join('');
    const ups = rows.filter(([m, g]) => levelFor((data.muscles[m]?.xp || 0) + g).level > levelFor(data.muscles[m]?.xp || 0).level).length;
    return `<section class="box nextxp" style="${kstyle(day.color)}"><header><small>Next: ${esc(day.name)} · ${esc(when)}</small><b>+${total} XP up for grabs</b>${ups ? `<span class="pill" style="--k:var(--arms)">★ ${ups} level-up${ups > 1 ? 's' : ''} in reach</span>` : ''}</header><div class="xpchips">${chips}</div><p class="fine">If every planned set is done. Personal bests add more.</p></section>`;
  }
  return '';
}

function nextDayFor(m, t) {
  const doneToday = S.sessions.some(s => s.date === t && !s.seed);
  for (let i = doneToday ? 1 : 0; i < 8; i++) {
    const d = new Date(Date.parse(t + 'T00:00:00Z') + i * 86400000);
    const dow = d.getUTCDay();
    const day = S.program.days.find(x => x.dow === dow);
    if (day?.slots.some(s => (S.exById[s.exId]?.muscles || []).includes(m))) {
      return { name: day.name, when: i === 0 ? 'today' : i === 1 ? 'tomorrow' : i === 7 ? `next ${dowName(dow, true)}` : dowName(dow, true) };
    }
  }
  return null;
}

export const actions = {
  async 'level-share'() { (await import('../share.js')).openShare('level', levelData()); },
  async 'streak-share'() { (await import('../share.js')).openShare('streak'); },
  muscle(el) { sel = el.dataset.m; region = el.dataset.r || null; refresh(); },
  mode(el) { mode = el.dataset.v; refresh(); },
  body: el => saveSettings({ bodyType: el.dataset.v }),
};
