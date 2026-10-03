import { test } from 'node:test';
import assert from 'node:assert/strict';

test('native database commits writes, reads records and never falls back after a failed save', async () => {
  const calls = [], records = new Map();
  let fail = false;
  globalThis.window = { gimNative: { storage: {
    init: async () => ({ migrated: true }),
    read: async ({ store, key }) => ({ records: [...records.values()].filter(r => r.store === store && (key == null || r.key === key)).map(r => r.obj) }),
    keys: async ({ prefix }) => ({ keys: [...records.values()].filter(r => r.store === 'kv' && r.key.startsWith(prefix)).map(r => r.key) }),
    write: async input => {
      calls.push(input);
      if (fail) throw Error('disk full');
      const { store, operation, key } = input;
      if (operation === 'clear') { for (const [k, r] of records) if (r.store === store) records.delete(k); }
      else if (operation === 'delete') records.delete(store + ':' + key);
      else for (const obj of input.records) { const key = store === 'kv' ? obj.key : obj.id; records.set(store + ':' + key, { store, key, obj: structuredClone(obj) }); }
    }
  } } };
  const db = await import('../js/db.js?native-storage');
  assert.equal(await db.init(), 'sqlite');
  await db.putMany('sessions', [{ id: 'a', sets: [{ w: 40, loadUnit: 'kg' }] }, { id: 'b' }]);
  assert.equal((await db.all('sessions')).length, 2);
  await db.setKv('daily:2026-10-04', { water: 2 });
  assert.deepEqual(await db.getKv('daily:2026-10-04'), { water: 2 });
  assert.equal(await db.getKv('missing', 7), 7);
  assert.deepEqual(await db.kvKeys('daily:'), ['daily:2026-10-04']);
  await db.del('sessions', 'b');
  assert.equal((await db.all('sessions')).length, 1);
  let error;
  db.onSaveFailed(e => { error = e; }); fail = true;
  await assert.rejects(db.put('sessions', { id: 'a', sets: [] }), /disk full/);
  assert.match(error.message, /disk full/);
  assert.equal((await db.all('sessions'))[0].sets[0].w, 40);
  fail = false; await db.clear('sessions'); assert.deepEqual(await db.all('sessions'), []);
  assert.equal(calls.length, 5);
  delete globalThis.window;
});

test('native database failure stops startup rather than creating a fresh browser database', async () => {
  globalThis.window = { gimNative: { storage: { init: async () => { throw Error('database unavailable'); } } } };
  const db = await import('../js/db.js?native-failure');
  await assert.rejects(db.init(), /database unavailable/);
  assert.equal(db.storageMode(), null);
  delete globalThis.window;
});
