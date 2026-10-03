import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { launch, freshWorkout, readDraft, chromePath } from './browser.mjs';
let b;
const skip = !chromePath();
before(async () => { if (!skip) b = await launch(); });
after(async () => { await b?.close(); });

test('mid-workout kg/lb/level/bodyweight changes retain earlier sets across reload and save', { skip }, async () => {
  await freshWorkout(b);
  await b.run(() => {
    const put = (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); };
    const card = document.querySelector('article.exc');
    put(card.querySelector('[data-f="w"][data-input]'), '20');
    put(card.querySelector('[data-f="r"][data-input]'), '8');
    card.querySelector('[data-act="done"]').click();
  });
  const choose = async (si, value) => {
    await b.run(si => document.querySelector(`[data-act="set-unit"][data-e="0"][data-s="${si}"]`).click(), si);
    await b.until(() => document.querySelector('[data-act="ex-units"]'));
    await b.run(v => document.querySelector(`[data-act="ex-units"][data-v="${v}"]`).click(), value);
    await new Promise(r => setTimeout(r, 250));
  };
  const before = await readDraft(b);
  const si = before.entries[0].sets.findIndex(s => !s.done);
  await choose(si, 'lb');
  let draft = await readDraft(b);
  assert.equal(draft.entries[0].sets[0].disp, 'kg');
  assert.equal(draft.entries[0].sets[si].disp, 'lb');
  assert.equal(draft.entries[0].sets[0].w, before.entries[0].sets[0].w);
  await choose(si, 'L');
  await b.run(si => {
    const input = document.querySelector(`[data-input="set"][data-e="0"][data-s="${si}"][data-f="w"]`);
    input.value = '7'; input.dispatchEvent(new Event('change', { bubbles: true }));
    document.querySelector(`[data-act="done"][data-e="0"][data-s="${si}"]`).click();
  }, si);
  await choose(si + 1, 'bw');
  await b.send('Page.reload');
  await b.until(() => document.querySelector('[data-act="set-unit"]'));
  draft = await readDraft(b);
  assert.equal(draft.entries[0].sets[0].loadUnit, 'kg');
  assert.equal(draft.entries[0].sets[si].loadUnit, 'L');
  assert.equal(draft.entries[0].sets[si].w, 7);
  assert.equal(draft.entries[0].sets[si + 1].loadUnit, 'bw');
  await b.run(async () => { const { commitDraft } = await import('./js/state.js'); await commitDraft(); location.hash = '#/history'; });
  await b.until(() => location.hash === '#/history');
  const got = await b.run(async () => {
    const { S } = await import('./js/state.js'); return S.sessions.at(-1).entries[0].sets;
  });
  assert.equal(got[si].loadUnit, 'L'); assert.equal(got[si + 1].loadUnit, 'bw');
});
