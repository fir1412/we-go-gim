// Every screen, in every language, with sample data: no English left on screen. The dictionaries can read fine
// and still miss text the app builds at run time ("Protein, last 7 days", "Strong · 2,830 XP total").
// Run with: node --test tests/e2e/*.e2e.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, chromePath } from './browser.mjs';

const skip = chromePath() ? false : 'no Chrome found (set CHROME_PATH)';
const ROUTES = ['today', 'daily', 'workout', 'history', 'insights', 'levels', 'atlas', 'body', 'cardio', 'lifts', 'measure', 'more', 'program', 'exercises', 'gyms', 'equip', 'data', 'settings', 'import', 'help', 'learn', 'paste', 'ex/*', 'session/*', 'exercise/*'];
let b;
before(async () => { if (!skip) b = await launch(); });
after(async () => { await b?.close(); });

// English found on the screen; names, brands, units and the paste format's own keywords are allowed.
const scan = L => b.run(async (lang, cjk) => {
  const names = new Set(Object.values((await import(`./js/i18n/${lang}.js`)).default.names));
  const ALLOW = /\b(we go gim|kg|lb|XP|RIR|RPE|PDF|CSV|MIT|App|Hevy|Strong|FitNotes|Jefit|MyFitnessPal|StrongLifts|Garmin|GymBook|Excel|WhatsApp|Telegram|Instagram|Facebook|Notion|Evernote|Google|Docs|Sheets|Drive|Forms|Calendar|RTF|iPhone|iPad|Android|Safari|Chrome|Edge|Firefox|Samsung|Huawei|Xiaomi|OPPO|vivo|Outlook|Mac|Dock|GitHub|Health Connect|iCloud|Apache|SIL|Open Font License|Barlow Condensed|DM Sans|Mozilla|pdf\.js|three\.js|Z-Anatomy|BodyParts\dD|The Database Center for Life Science|DBCLS|FitMitWith|CC BY-SA|anatomy\/ATTRIBUTION\.txt|Epley|Muay Thai|Pilates|Silat|Pallof|JM|EZ|Smith|fir\d+(?:dev@gmail\.com)?|zip|hex|bpm|km\/h|AM|PM|OK|Auto|Futsal|Tai chi|Yoga|BW|e\dRM|\dRM|\dD|Lu|T-bar|Y-T|V-up|Finish with:|Optional:)(?![A-Za-z])/g;
  const EN = /\b(the|and|your|you|with|for|this|that|is|are|to|of|in|on|from|will|can|has|have|not|or)\b/i;
  const bad = t => { if (names.has(t)) return false; const rest = t.replace(ALLOW, ''); return cjk ? /[A-Za-z]{3,}/.test(rest) : /[A-Za-z]{3,}/.test(rest) && EN.test(rest); };
  const out = new Set();
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    const el = n.parentElement;
    if (!el || el.closest('script,style,[data-raw],[lang="mul"],[translate="no"]') || !el.getClientRects().length) continue;
    const t = n.textContent.replace(/\s+/g, ' ').trim();
    if (t && bad(t)) out.add(t.slice(0, 160));
  }
  // Placeholders are left out on purpose: the import and paste boxes show example input, which is English.
  for (const el of document.querySelectorAll('[aria-label],[title]')) for (const a of ['aria-label', 'title']) {
    const t = el.getAttribute(a); if (t && bad(t)) out.add(`@${a}: ${t.slice(0, 140)}`);
  }
  return [...out];
}, L, L !== 'ms');

for (const L of ['ms', 'zh', 'zh-Hant', 'ja']) {
  test(`${L}: no English left on any screen`, { skip }, async () => {
    await b.go('__blank');
    await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
    await b.go('');
    await b.until(() => document.querySelector('[data-input="set-lang"]'), 'the language picker');
    await b.run(l => { const s = document.querySelector('[data-input="set-lang"]'); s.value = l; s.dispatchEvent(new Event('change', { bubbles: true })); s.dispatchEvent(new Event('input', { bubbles: true })); }, L);
    await b.until(() => document.documentElement.lang !== 'en' && document.querySelector('[data-act="wz-sample"]'), 'Welcome in ' + L);
    const found = { setup: await scan(L) };
    await b.run(() => document.querySelector('[data-act="wz-sample"]').click());
    await b.until(() => document.querySelector('[data-act="sample-end"]'), 'sample Today');
    await b.run(() => document.querySelector('.scrim')?.click());
    const ids = await b.run(async () => { const { S } = await import('./js/state.js'); return { ex: S.exercises[0]?.id, session: S.sessions.at(-1)?.id }; });
    for (const r of ROUTES) {
      const path = r.replace(/^(ex|exercise)\/\*$/, `$1/${ids.ex}`).replace('session/*', `session/${ids.session}`);
      await b.run(p => { const a = Object.assign(document.createElement('a'), { href: '#/' + p }); document.getElementById('screen').append(a); a.click(); }, path);
      await new Promise(r => setTimeout(r, 400));
      await b.run(() => { document.querySelectorAll('details').forEach(d => (d.open = true)); });
      await new Promise(r => setTimeout(r, 150));
      found[r] = await scan(L);
    }
    const left = Object.entries(found).filter(([, v]) => v.length).map(([k, v]) => `${k}: ${v.join(' | ')}`);
    assert.deepEqual(left, [], `English left in ${L}:\n${left.join('\n')}`);
  });
}
