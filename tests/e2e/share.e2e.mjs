// A share picture end to end: sample data → History → "Share this month" → the preview sheet → Share hands a File and a
// caption (link first, the sample line last) to a stubbed navigator.share. Run with: node --test tests/e2e/*.e2e.mjs
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, chromePath } from './browser.mjs';

const skip = chromePath() ? false : 'no Chrome found (set CHROME_PATH)';
let b;
before(async () => { if (!skip) b = await launch(); });
after(async () => { await b?.close(); });

test('the month picture: a PNG or JPEG under 400 KB and a caption that starts with the link', { skip }, async () => {
  await b.go('__blank');
  await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await b.go('');
  await b.until(() => document.querySelector('[data-act="wz-sample"]'), 'the sample button on Welcome');
  await b.run(() => document.querySelector('[data-act="wz-sample"]').click());
  await b.until(() => document.querySelector('[data-act="sample-end"]'), 'sample Today');
  await b.run(() => document.querySelector('.scrim')?.click());   // the tour
  // Catch what the share sheet would get.
  await b.run(() => {
    navigator.canShare = () => true;
    navigator.share = async d => { const f = d.files?.[0]; window.__shot = { name: f?.name, size: f?.size, type: f?.type, text: d.text }; };
    document.querySelector('#tabs a[data-tab="history"]').click();
  });
  await b.until(() => document.querySelector('[data-act="recap-share"]'), 'the share button on the recap card (sample months count while the sample is on)');
  await b.run(() => document.querySelector('[data-act="recap-share"]').click());
  await b.until(() => document.querySelector('.sheet [data-x="share"]:not([disabled])'), 'the preview sheet with its picture drawn', 15000);
  const sheet = await b.run(() => ({ img: document.querySelector('.sheet img')?.naturalWidth, text: document.querySelector('.sheet').innerText }));
  assert.equal(sheet.img, 1080, 'the preview is the 1080 px picture');
  assert.match(sheet.text, /Nothing is uploaded/); assert.match(sheet.text, /sample data/);
  await b.run(() => document.querySelector('.sheet [data-x="share"]').click());
  const shot = await b.until(() => window.__shot, 'navigator.share', 10000);
  assert.match(shot.name, /^we-go-gim-month-chat\.(png|jpg)$/);
  assert.ok(shot.size > 20e3 && shot.size < 400e3, `size ${shot.size}`);
  assert.ok(shot.type === 'image/png' || shot.type === 'image/jpeg');
  const lines = shot.text.split('\n');
  assert.equal(lines[0], 'https://fir1412.github.io/we-go-gim/');
  assert.match(lines[1], /days trained/);
  assert.equal(lines[2], 'Sample data, not my real workouts. Just trying the app.');
  // The story format redraws to 1080×1920 and renames the file.
  await b.run(() => document.querySelector('.sheet [data-x="fmt"][data-v="story"]').click());
  await b.until(() => document.querySelector('.sheet img')?.naturalHeight === 1920 && document.querySelector('.sheet [data-x="share"]:not([disabled])'), 'the story picture', 15000);
  await b.run(() => { window.__shot = null; document.querySelector('.sheet [data-x="share"]').click(); });
  const story = await b.until(() => window.__shot, 'navigator.share again', 10000);
  assert.match(story.name, /^we-go-gim-month-story\./); assert.ok(story.size < 400e3, `story size ${story.size}`);
  // Levels: no share buttons while the sample is on (streak and level pictures would be fiction).
  await b.run(() => { document.querySelector('.scrim')?.click(); document.querySelector('#tabs a[data-tab="insights"]').click(); });
  await b.until(() => document.querySelector('.subnav a[href="#/levels"]'), 'Progress');
  await b.run(() => document.querySelector('.subnav a[href="#/levels"]').click());
  await b.until(() => document.querySelector('.lvlhero'), 'Levels');
  assert.equal(await b.run(() => document.querySelectorAll('[data-act$="-share"]').length), 0);
});

test('the streak picture says what the app says: before Save it matches the Today card, after Save it matches the summary', { skip }, async () => {
  await b.go('__blank');
  await b.run(() => new Promise(r => { localStorage.clear(); const q = indexedDB.deleteDatabase('setlist'); q.onsuccess = q.onerror = q.onblocked = () => r(1); }));
  await b.go('');
  await b.until(() => document.querySelector('[data-act="wz-skip"]'), 'Welcome');
  await b.run(() => document.querySelector('[data-act="wz-skip"]').click());
  await b.until(() => document.querySelector('#tabs a[data-tab="workout"]'), 'the tabs');
  // Four real workouts on the four days before today: a streak of 4 (rest days never break it, but these are all trained).
  const seeded = await b.run(async () => {
    const st = await import('/js/state.js'), { S, todayIso } = st, { addDays } = await import('/js/engine.js');
    const day = S.program.days.find(x => x.slots.length), t = todayIso();
    for (let i = 4; i >= 1; i--) {
      const d = addDays(t, -i), start = Date.parse(`${d}T18:00:00`);
      const entries = day.slots.filter(sl => S.exById[sl.exId]).map(sl => ({ exId: sl.exId, slot: { ...sl }, sug: null, sets: Array.from({ length: sl.sets }, () => ({ w: S.exById[sl.exId].unit === 'bw' ? 0 : 20, r: 8, done: true })), rir: '2', pain: false, note: '' }));
      await st.saveSession({ id: `e2e-${d}`, date: d, name: day.name, color: day.color, gymId: S.settings.gymId, start, end: start + 50 * 60e3, readiness: null, deload: false, hr: null, feel: 4, note: '', entries });
    }
    await st.saveSettings({ onboarded: true, tourDone: true, calAdded: true, lastBackup: t });
    navigator.canShare = () => true;
    navigator.share = async d => { window.__shot = { text: d.text }; };
    return S.sessions.length;
  });
  assert.equal(seeded, 4);
  const num = s => +(s.match(/\d+/) || [NaN])[0];
  /** Open "Share my streak" on the current screen, tap Share, and read the streak from the caption and the picture's data. */
  const sharedStreak = async () => {
    await b.run(() => { window.__shot = null; document.querySelector('[data-act="streak-share"]').click(); });
    await b.until(() => document.querySelector('.sheet [data-x="share"]:not([disabled])'), 'the streak preview', 15000);
    await b.run(() => document.querySelector('.sheet [data-x="share"]').click());
    const shot = await b.until(() => window.__shot, 'navigator.share', 10000);
    const data = await b.run(async () => { const { streakData } = await import('/js/share.js'); const d = streakData(); return { streak: d.streak, today: d.grid[27] }; });
    await b.run(async () => (await import('/js/ui.js')).closeSheet());
    return { caption: num(shot.text.split('\n')[1]), ...data };
  };
  // Today: the streak card says 4 and so does the picture; today's cell is not lit yet.
  await b.run(() => document.querySelector('#tabs a[data-tab="today"]').click());
  await b.until(() => document.querySelector('[data-act="streak-share"]'), 'the streak share chip on Today');
  const card = num(await b.run(() => document.querySelector('.streak b').textContent));
  const before = await sharedStreak();
  assert.deepEqual([card, before.caption, before.streak, before.today], [4, 4, 4, false]);
  // Today's workout: start, tick every set, finish. The summary counts this workout (5) before it is saved.
  await b.run(() => document.querySelector('#tabs a[data-tab="workout"]').click());
  await b.until(() => document.querySelector('[data-act="start-day"]'), 'the start buttons');
  await b.run(() => document.querySelector('[data-act="start-day"]').click());
  await b.until(() => document.querySelector('#screen article.exc'), 'the workout');
  await b.run(async () => {
    document.querySelector('.scrim')?.click();
    const st = await import('/js/state.js'), d = st.S.draft;
    d.start = Date.now() - 40 * 60e3;
    for (const e of d.entries) for (const s of e.sets) if (!s.warm) { if (s.w == null) s.w = 20; if (s.r == null) s.r = 8; s.done = true; s.at = Date.now(); }
    await st.saveDraft(); st.refresh();
  });
  await b.until(() => document.querySelector('[data-act="finish"]'), 'Finish');
  await b.run(() => document.querySelector('[data-act="finish"]').click());
  await b.until(() => document.querySelector('[data-act="save"]'), 'the summary', 10000);
  const summary = num(await b.run(() => [...document.querySelectorAll('.gamewin .big')].map(e => e.textContent).find(t => /streak|berturut/i.test(t)) || ''));
  assert.equal(summary, 5, 'the summary counts the workout being saved');
  // Save, then the picture from Today: 5, with today's cell lit, the same as the summary said.
  await b.run(() => document.querySelector('[data-act="save"]').click());
  await b.until(() => !document.querySelector('[data-act="save"]'), 'saved', 10000);
  await b.run(() => { document.querySelector('.scrim')?.click(); document.querySelector('#tabs a[data-tab="today"]').click(); });
  await b.until(() => document.querySelector('[data-act="streak-share"]'), 'Today again');
  const after = await sharedStreak();
  assert.deepEqual([after.caption, after.streak, after.today], [summary, summary, true], 'the picture matches the summary once the workout is saved');
});
