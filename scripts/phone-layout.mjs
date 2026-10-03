import { launch, chromePath } from '../tests/e2e/browser.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
if (!chromePath()) throw Error('Chrome required');
mkdirSync('output/compatibility', { recursive: true });
const b = await launch();
const results = [];
try {
  await b.go('');
  await b.until(() => document.querySelector('[data-act="wz-sample"]'));
  await b.run(() => document.querySelector('[data-act="wz-sample"]').click());
  await b.until(() => document.querySelector('[data-act="sample-end"]'));
  await b.run(() => document.querySelector('.scrim')?.click());
  await b.run(async () => {
    const { S, startWorkout } = await import('./js/state.js');
    await startWorkout(S.program.days.find(d => d.slots.length));
  });
  for (const lang of ['en', 'ms', 'zh', 'zh-Hant', 'ja']) {
    await b.run(async lang => {
      const { S, saveSettings, refresh } = await import('./js/state.js');
      const { setLang } = await import('./js/i18n.js');
      await setLang(lang); await saveSettings({ lang }); refresh();
    }, lang);
    for (const [width, height] of [[320, 640], [360, 800], [384, 832], [412, 915], [600, 960], [844, 390]]) {
      await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      for (const scale of [85, 100, 150]) {
        await b.run(scale => { document.documentElement.style.fontSize = `${scale}%`; }, scale);
        for (const route of ['today', 'workout', 'history', 'insights', 'levels', 'more', 'settings', 'data', 'program', 'setup']) {
          await b.run(route => { location.hash = '#/' + route; }, route);
          // Let entry animations settle before measuring their transformed bounds.
          await new Promise(r => setTimeout(r, 250));
          const check = await b.run(() => {
            const screen = document.querySelector('#screen');
            const root = document.documentElement;
            const bad = [root, screen, document.querySelector('#tabs')].filter(e => e && e.scrollWidth > e.clientWidth + 2);
            return { overflow: bad.map(e => e.id || e.tagName), recovery: !!document.querySelector('[data-act="reload-app"]'), actualWidth: screen.clientWidth, content: screen.scrollWidth };
          });
          results.push({ lang, width, height, scale, route, ...check });
        }
      }
    }
  }
} finally { await b.close(); }
const failures = results.filter(r => r.overflow.length || r.recovery);
writeFileSync('output/compatibility/layout.json', JSON.stringify({ cases: results.length, failures, results }, null, 2));
console.log(JSON.stringify({ cases: results.length, failures }));
if (failures.length) process.exitCode = 1;
