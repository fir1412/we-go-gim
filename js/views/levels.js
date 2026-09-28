import { S, todayIso, refresh, dayForDate } from '../state.js';
import { muscleXP, levelFor, athleteLevel, titleFor, muscleTrends, MUSCLES, XP_SET, XP_HELPER, XP_PR, daysBetween, isKg, fmtLoad, plannedXP, addDays, unitShort } from '../engine.js';
import { esc, fmtDate, pill, STATUS, num, cvar, dowName } from '../ui.js';

let mode = 'level';   // level | week
let sel = null;       // selected muscle

// Stylised front (x 0–200) and back (x 220–420) figures. Muscles drawn on top of a neutral silhouette.
const E = (m, cx, cy, rx, ry, rot = 0) => ({ m, t: 'e', cx, cy, rx, ry, rot });
const SHAPES = [
  // front
  E('Front delts', 64, 84, 13, 12, -20), E('Front delts', 136, 84, 13, 12, 20),
  E('Side delts', 51, 92, 8, 14, -12), E('Side delts', 149, 92, 8, 14, 12),
  E('Chest', 85, 104, 20, 14, 8), E('Chest', 115, 104, 20, 14, -8),
  E('Biceps', 48, 134, 9, 20, 8), E('Biceps', 152, 134, 9, 20, -8),
  { m: 'Abs', t: 'r', x: 88, y: 122, w: 24, h: 60, r: 8 },
  E('Quads', 85, 238, 15, 42, 4), E('Quads', 115, 238, 15, 42, -4),
  E('Calves', 86, 332, 9, 28, 2), E('Calves', 114, 332, 9, 28, -2),
  // back
  E('Rear delts', 283, 84, 13, 11, -20), E('Rear delts', 357, 84, 13, 11, 20),
  E('Back', 320, 84, 24, 11), E('Back', 303, 122, 16, 28, 10), E('Back', 337, 122, 16, 28, -10),
  E('Triceps', 268, 134, 9, 20, 8), E('Triceps', 372, 134, 9, 20, -8),
  E('Glutes', 306, 200, 15, 15), E('Glutes', 334, 200, 15, 15),
  E('Hamstrings', 305, 250, 13, 34, 3), E('Hamstrings', 335, 250, 13, 34, -3),
  E('Calves', 305, 330, 10, 27, 2), E('Calves', 335, 330, 10, 27, -2),
];

// Where each muscle's level number sits on the map (one per muscle).
const TAGS = {
  Chest: [116, 105], 'Front delts': [136, 82], 'Side delts': [152, 99], Biceps: [152, 136], Abs: [100, 154], Quads: [115, 240], Calves: [114, 334],
  'Rear delts': [357, 84], Back: [320, 124], Triceps: [372, 136], Glutes: [320, 201], Hamstrings: [335, 252],
};

function silhouette(ox) {
  const c = x => x + ox;
  return `<g class="sil">
    <circle cx="${c(100)}" cy="34" r="19"/>
    <rect x="${c(92)}" y="50" width="16" height="14" rx="4"/>
    <rect x="${c(62)}" y="68" width="76" height="118" rx="26"/>
    <rect x="${c(38)}" y="76" width="22" height="84" rx="11" transform="rotate(6 ${c(49)} 118)"/>
    <rect x="${c(140)}" y="76" width="22" height="84" rx="11" transform="rotate(-6 ${c(151)} 118)"/>
    <rect x="${c(33)}" y="150" width="17" height="64" rx="8" transform="rotate(6 ${c(41)} 182)"/>
    <rect x="${c(150)}" y="150" width="17" height="64" rx="8" transform="rotate(-6 ${c(158)} 182)"/>
    <rect x="${c(68)}" y="176" width="64" height="40" rx="16"/>
    <rect x="${c(69)}" y="196" width="30" height="104" rx="14"/>
    <rect x="${c(101)}" y="196" width="30" height="104" rx="14"/>
    <rect x="${c(74)}" y="296" width="22" height="78" rx="10"/>
    <rect x="${c(104)}" y="296" width="22" height="78" rx="10"/>
  </g>`;
}

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

function diagram(data) {
  let g = silhouette(0) + silhouette(220);
  for (const s of SHAPES) {
    const { fill, op } = fillFor(s.m, data);
    const on = s.m === sel;
    const lvl = data.muscles[s.m] ? levelFor(data.muscles[s.m].xp).level : 0;
    const attrs = `class="mz ${on ? 'on' : ''}" data-act="muscle" data-m="${esc(s.m)}" fill="${fill}" fill-opacity="${op}" role="button" tabindex="-1" aria-label="${esc(s.m)}, level ${lvl}"`;
    g += s.t === 'e'
      ? `<ellipse ${attrs} cx="${s.cx}" cy="${s.cy}" rx="${s.rx}" ry="${s.ry}" transform="rotate(${s.rot} ${s.cx} ${s.cy})"><title>${esc(s.m)}</title></ellipse>`
      : `<rect ${attrs} x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="${s.r}"><title>${esc(s.m)}</title></rect>`;
  }
  for (const [m, [x, y]] of Object.entries(TAGS)) {
    const r = data.muscles[m];
    if (!r?.xp) continue;
    g += `<text class="mlv" x="${x}" y="${y + 5}" text-anchor="middle" aria-hidden="true">${levelFor(r.xp).level}</text>`;
  }
  g += `<text x="100" y="394" text-anchor="middle" class="dlbl">FRONT</text><text x="320" y="394" text-anchor="middle" class="dlbl">BACK</text>`;
  return `<svg class="bodysvg" viewBox="0 0 420 400" role="group" aria-label="Muscle map, tap a muscle">${g}</svg>`;
}

function bar(pct, k = 'push') {
  return `<span class="xpbar" style="--k:var(--${k})"><i style="width:${Math.max(2, Math.min(100, pct * 100)).toFixed(1)}%"></i></span>`;
}

export function render() {
  const t = todayIso();
  const data = muscleXP(S.sessions, S.exById, t);
  const ranked = MUSCLES.map(m => ({ m, r: data.muscles[m] || { xp: 0, week: 0, events: [], lastDate: null } }))
    .map(x => ({ ...x, L: levelFor(x.r.xp) })).sort((a, b) => b.r.xp - a.r.xp);
  if (!sel || !MUSCLES.includes(sel)) sel = ranked[0]?.m || 'Chest';
  const ath = athleteLevel(data.total);
  const weekTotal = ranked.reduce((a, x) => a + x.r.week, 0);

  let h = `<div class="lvlhero"><div class="lvbadge"><span>LVL</span><b>${ath.level}</b></div>
    <div class="grow"><b class="lvtitle">${esc(titleFor(ath.level))} lifter</b><small>${num(ath.into, 0)} / ${num(ath.need, 0)} XP to level ${ath.level + 1} · +${weekTotal} XP this week</small>${bar(ath.pct, 'on')}</div></div>`;

  const fresh = data.levelUps.filter(u => u.date <= t && daysBetween(u.date, t) <= 3);
  if (fresh.length) h += `<div class="lvup-banner" role="status"><b>★ Level up!</b><span>${fresh.slice(-4).reverse().map(u => `${esc(u.muscle)} → Lv${u.level}${u.date === t ? '' : ` (${fmtDate(u.date)})`}`).join(' · ')}</span></div>`;
  h += nextXP(data, t);

  h += `<div class="rrow"><div class="seg" role="group" aria-label="Colour the map by">${[['level', 'Level'], ['week', 'This week']].map(([v, l]) => `<button data-act="mode" data-v="${v}" aria-pressed="${mode === v}">${l}</button>`).join('')}</div>
    <span class="legend">${mode === 'level' ? '<i class="lg" style="background:var(--legs)"></i>low <i class="lg" style="background:var(--push)"></i>high' : '<i class="lg" style="background:var(--up);opacity:.3"></i>little <i class="lg" style="background:var(--up)"></i>a lot'}</span></div>`;
  h += `<div class="box diagram">${diagram(data)}</div>`;

  // selected muscle card
  const cur = ranked.find(x => x.m === sel);
  const tr = muscleTrends(S.sessions, S.exercises).find(x => x.muscle === sel);
  const nextDay = nextDayFor(sel, t);
  const days = cur.r.lastDate ? daysBetween(cur.r.lastDate, t) : null;
  h += `<section class="box mcard"><header><div class="lvbadge sm"><span>LVL</span><b>${cur.L.level}</b></div><div class="grow"><h3>${esc(sel)}</h3><small>${esc(titleFor(cur.L.level))} · ${cur.r.xp} XP total</small></div>${cur.r.week ? pill(`+${cur.r.week} this week`, 'up') : ''}</header>
    ${bar(cur.L.pct)}<p class="fine">${cur.L.need - cur.L.into} XP to level ${cur.L.level + 1}. That's about ${Math.ceil((cur.L.need - cur.L.into) / XP_SET)} hard sets, fewer with a PR.</p>
    <dl class="facts">
      <div><dt>Last trained</dt><dd>${days == null ? 'Never' : days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} ago`}</dd></div>
      <div><dt>Next session</dt><dd>${nextDay ? `${esc(nextDay.name)} · ${nextDay.when}` : 'Not in your programme'}</dd></div>
      ${tr ? `<div><dt>Lead lift</dt><dd><a href="#/ex/${esc(tr.ex.id)}">${esc(tr.ex.name)}</a> ${pill(STATUS[tr.status][0], STATUS[tr.status][1])}</dd></div>` : ''}
      ${tr && isKg(tr.ex.unit) ? `<div><dt>Est. max</dt><dd>${num(tr.scores[0])} → ${num(tr.scores[tr.scores.length - 1])} ${unitShort(tr.ex.unit)}</dd></div>` : tr ? `<div><dt>Top load</dt><dd>${esc(fmtLoad(tr.ex, tr.from.w))} → ${esc(fmtLoad(tr.ex, tr.to.w))}</dd></div>` : ''}
    </dl>`;
  const ev = cur.r.events.slice(-5).reverse();
  if (ev.length) h += `<p class="lbl">Recent XP</p><ul class="xplist">${ev.map(e => `<li><a href="#/session/${esc(e.sessionId)}"><span>${fmtDate(e.date)}</span><span class="grow">${esc(e.why)}</span><b>+${e.xp}</b></a></li>`).join('')}</ul>`;
  h += `</section>`;

  // all muscles
  h += `<p class="lbl">All muscles</p><ul class="box lvlist">`;
  for (const x of ranked) {
    const ago = x.r.lastDate ? daysBetween(x.r.lastDate, t) : null;
    const rust = ago == null ? `<small class="rust">never trained</small>` : ago > 9 ? `<small class="rust">${ago} d ago</small>` : '';
    h += `<li><button data-act="muscle" data-m="${esc(x.m)}" aria-pressed="${x.m === sel}"><span class="lvbadge xs"><b>${x.L.level}</b></span><span class="grow"><span class="rowt"><b>${esc(x.m)} ${rust}</b><small>${x.r.xp ? `${x.L.into}/${x.L.need}` : '0 XP'}${x.r.week ? ` · <em class="wk">+${x.r.week}</em>` : ''}</small></span>${bar(x.L.pct, x.r.xp ? 'push' : 'mute')}</span></button></li>`;
  }
  h += `</ul>`;

  const ups = data.levelUps.slice(-6).reverse();
  if (ups.length) h += `<p class="lbl">Recent level-ups</p><ul class="box xplist pad">${ups.map(u => `<li><span>${fmtDate(u.date)}</span><span class="grow">${esc(u.muscle)} reached level ${u.level}</span><b>★</b></li>`).join('')}</ul>`;
  h += `<p class="fine">Bars show progress inside the current level. Muscles not trained for 10+ days are marked, so nothing gets left behind. Each hard set earns ${XP_SET} XP for its main muscle and ${XP_HELPER} for helpers. Beating your best on a lift adds ${XP_PR} (machines and cables only against the same gym). Warm-ups and skipped sets earn nothing, so XP tracks real work, not app opens.</p>`;
  return { title: 'Levels', sub: `${data.total.toLocaleString('en-GB')} XP earned`, html: h, color: 'push' };
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
    return `<section class="box nextxp" style="--k:${cvar(day.color)}"><header><small>Next: ${esc(day.name)} · ${esc(when)}</small><b>+${total} XP up for grabs</b>${ups ? `<span class="pill" style="--k:var(--arms)">★ ${ups} level-up${ups > 1 ? 's' : ''} in reach</span>` : ''}</header><div class="xpchips">${chips}</div><p class="fine">If every planned set is done. PRs add more.</p></section>`;
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
  muscle(el) { sel = el.dataset.m; refresh(); },
  mode(el) { mode = el.dataset.v; refresh(); },
};
