import { launch } from '../tests/e2e/browser.mjs';
const b = await launch();
try {
  await b.go(''); await b.until(() => document.querySelector('[data-act="wz-sample"]'));
  await b.run(() => document.querySelector('[data-act="wz-sample"]').click());
  await b.until(() => document.querySelector('[data-act="sample-end"]'));
  await b.run(async () => { document.querySelector('.scrim')?.click(); const { S, startWorkout, saveSettings } = await import('./js/state.js'); const { setLang } = await import('./js/i18n.js'); await setLang('ja'); await saveSettings({ lang: 'ja' }); await startWorkout(S.program.days.find(d => d.slots.length)); location.hash = '#/workout'; document.documentElement.style.fontSize = '150%'; });
  await b.send('Emulation.setDeviceMetricsOverride', { width: 320, height: 640, deviceScaleFactor: 1, mobile: true });
  await new Promise(r => setTimeout(r, 400));
  const overflow = await b.run(() => [...document.querySelectorAll('#screen *')].filter(e => { const r = e.getBoundingClientRect(); return r.right > 322 && r.width > 0; }).map(e => ({ tag: e.tagName, class: e.className, text: e.textContent.slice(0, 70), width: e.getBoundingClientRect().width, scroll: e.scrollWidth })).slice(0, 25));
  console.log(JSON.stringify(overflow));
  if (process.argv.includes('--assert') && overflow.length) throw Error('Workout overflow');
} finally { await b.close(); }
