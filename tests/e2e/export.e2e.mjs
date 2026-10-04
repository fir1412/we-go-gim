import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, freshWorkout, chromePath } from './browser.mjs';

let b, files, backupPath, csvPath, expected;
const skip = !chromePath();
before(async () => {
  if (skip) return;
  b = await launch();
  files = await mkdtemp(join(tmpdir(), 'wegogim-export-'));
  await b.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: files });
});
after(async () => { await b?.close(); if (files) await rm(files, { recursive: true, force: true }); });

async function downloaded(ext) {
  for (let n = 0; n < 100; n++) {
    const name = (await readdir(files)).find(n => n.endsWith(ext));
    if (name) return join(files, name);
    await new Promise(r => setTimeout(r, 50));
  }
  throw Error(`No ${ext} download completed`);
}
async function pick(selector, path) {
  const { root } = await b.send('DOM.getDocument');
  const { nodeId } = await b.send('DOM.querySelector', { nodeId: root.nodeId, selector });
  assert.ok(nodeId, `File input ${selector} exists`);
  await b.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}
const snapshot = () => b.run(async () => {
  const { S } = await import('/js/state.js');
  return S.sessions.map(s => ({ date: s.date, name: s.name, note: s.note, hr: s.hr,
    entries: s.entries.map(e => ({ name: S.exById[e.exId].name, note: e.note, rir: e.rir,
      pain: e.pain, sets: e.sets.map(x => ({ w: x.w, r: x.r, done: x.done,
        warm: !!x.warm, unit: x.loadUnit || S.exById[e.exId].unit })) })) }));
});

test('actual JSON and CSV downloads contain a completed mixed-unit workout with Unicode and quoted notes', { skip }, async () => {
  await freshWorkout(b);
  await b.run(async () => {
    const { S, commitDraft } = await import('/js/state.js');
    S.draft.name = 'Gym, ジム 训练'; S.draft.note = 'Session "note"\nsecond line'; S.draft.hr = 123;
    S.draft.entries = [S.draft.entries[0]];
    const e = S.draft.entries[0]; e.note = '=Keep, "slow"\n动作'; e.rir = '2'; e.pain = false;
    e.sets = [
      { w: 20, r: 8, done: true, warm: true, loadUnit: 'kg', disp: 'kg' },
      { w: 22.6796185, r: 7, done: true, loadUnit: 'kg', disp: 'lb' },
      { w: 6, r: 12, done: true, loadUnit: 'L' },
      { w: 0, r: 10, done: true, loadUnit: 'bw' },
      { w: 12.5, r: 9, done: false, loadUnit: 'kg/DB', disp: 'kg' }
    ];
    await commitDraft(); location.hash = '#/data';
  });
  await b.until(() => document.querySelector('[data-act="backup-dl"]'));
  expected = await snapshot();
  await b.run(() => document.querySelector('[data-act="backup-dl"]').click());
  backupPath = await downloaded('.json');
  const backup = JSON.parse(await readFile(backupPath, 'utf8'));
  assert.equal(backup.app, 'setlist'); assert.equal(backup.sessions.length, 1);
  assert.equal(backup.sessions[0].entries[0].sets[1].disp, 'lb');
  await b.run(() => document.querySelector('[data-act="csv-dl"]').click());
  csvPath = await downloaded('.csv');
  const csv = await readFile(csvPath, 'utf8');
  assert.ok(csv.startsWith('\uFEFFdate,session,exercise'));
  assert.ok(csv.includes('ジム 训练')); assert.ok(csv.includes('kg/DB'));
});

test('downloaded JSON restores through the picker, retains pound display, survives reload and merges without duplicates', { skip }, async () => {
  await pick('#restore-file', backupPath);
  await b.until(() => document.querySelector('.sheet [data-x="yes"]'));
  await b.run(() => document.querySelector('.sheet [data-x="yes"]').click());
  await b.until(() => /Backup restored/.test(document.querySelector('#toast')?.textContent || ''));
  assert.deepEqual(await snapshot(), expected);
  await b.send('Page.reload');
  await b.until(() => document.querySelector('#restore-file'));
  assert.deepEqual(await snapshot(), expected);
  assert.equal(await b.run(async () => (await import('/js/state.js')).S.sessions[0].entries[0].sets[1].disp), 'lb');
  await pick('#restore-file', backupPath);
  await b.until(() => document.querySelector('.sheet [data-x="alt"]'));
  await b.run(() => document.querySelector('.sheet [data-x="alt"]').click());
  await b.until(() => /Backup restored/.test(document.querySelector('#toast')?.textContent || ''));
  assert.deepEqual(await snapshot(), expected);
});

test('downloaded CSV imports through review into a fresh app and keeps every set, load unit, note and completion state', { skip }, async () => {
  await freshWorkout(b);
  await b.run(async () => { const { discardDraft } = await import('/js/state.js'); await discardDraft(); location.hash = '#/data'; });
  await b.until(() => document.querySelector('#csv-file'));
  await pick('#csv-file', csvPath);
  await b.until(() => document.querySelector('[data-act="imp-save"]'));
  await b.run(() => document.querySelector('[data-act="imp-save"]').click());
  await b.until(async () => location.hash === '#/history' && (await import('/js/state.js')).S.sessions.length === 1, 'saved imported workout');
  assert.deepEqual(await snapshot(), expected);
  await b.send('Page.reload');
  await b.until(() => location.hash === '#/history' && document.querySelector('#screen'));
  assert.deepEqual(await snapshot(), expected);
});
