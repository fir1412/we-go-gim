import { launch } from '../tests/e2e/browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
const b = await launch();
mkdirSync('release/screenshots', { recursive: true });
const captures = [];
try {
  await b.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 3, mobile: true });
  await b.go(''); await b.until(() => document.querySelector('[data-act="wz-sample"]'));
  await b.run(() => document.querySelector('[data-act="wz-sample"]').click());
  await b.until(() => document.querySelector('[data-act="sample-end"]'));
  await b.run(() => document.querySelector('.scrim')?.click());
  await b.run(async () => { const { S, startWorkout } = await import('./js/state.js'); await startWorkout(S.program.days.find(d => d.slots.length)); });
  for (const lang of ['en', 'ms', 'zh', 'zh-Hant', 'ja']) {
    await b.run(async lang => {
      const { saveSettings, refresh } = await import('./js/state.js');
      const { setLang } = await import('./js/i18n.js');
      await setLang(lang); await saveSettings({ lang, theme: 'dark', appPalette: 'default', coachDone: true }); refresh();
    }, lang);
    await b.go('__blank'); await b.go('#/today');
    await b.until(() => document.querySelector('#tabs a'));
    await b.run(async () => {
      const { S, startWorkout } = await import('./js/state.js');
      if (!S.draft) await startWorkout(S.program.days.find(d => d.slots.length));
    });
  for (const route of ['today', 'workout', 'insights', 'history', 'levels', 'settings']) {
    // Show the real palette controls once, and a restrained Forest surface in the final pair.
    if (route === 'levels') await b.run(async () => {
      const { saveSettings, refresh } = await import('./js/state.js');
      const { applyPalette } = await import('./js/palette.js');
      await saveSettings({ appPalette: 'forest' }); applyPalette({ appPalette: 'forest' }); refresh();
    });
    await b.run(route => { location.hash = '#/' + route; }, route);
    await new Promise(r => setTimeout(r, 600));
    const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
    const file = `release/screenshots/${lang}-${route}.png`; writeFileSync(file, Buffer.from(data, 'base64'));
    captures.push({ file, lang, route, palette: ['levels', 'settings'].includes(route) ? 'forest' : 'default', width: 1080, height: 1920, source: 'Chromium DOM, synthetic sample data; not a device capture' });
    console.log(file);
  }
  }
  await b.send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
  await b.run(() => {
    document.body.innerHTML = `<div style="position:fixed;inset:0;background:#0F1117;display:flex;align-items:center;padding:28px;gap:36px;color:#EEF0F7;font-family:system-ui;box-sizing:border-box"><img src="icons/official-source.jpg" width="420" height="420" style="border-radius:28px"><div><div style="font-weight:700;font-size:24px;color:#FF8A3D;margin-bottom:22px">we go gim</div><div style="font-size:48px;font-weight:800;line-height:1.08;letter-spacing:-1px">Your next workout.<br>Already filled in.</div><div style="font-size:22px;line-height:1.5;margin-top:26px">Track sets. See your progress.<br>Works offline. No account. No ads.</div></div></div>`;
    return document.querySelector('img').decode();
  });
  const { data } = await b.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync('release/feature-1024x500.png', Buffer.from(data, 'base64'));
  writeFileSync('release/screenshots/manifest.json', JSON.stringify(captures, null, 2));
} finally { await b.close(); }
console.log('Thirty localized phone-format browser screenshots and feature graphic generated.');
