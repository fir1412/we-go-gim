// Native Android SQLite; the website uses IndexedDB with a localStorage fallback.
// Stores: sessions, exercises, body, cardio (keyed by id) and kv (keyed by key).

const NAME = 'setlist', VERSION = 1;
export const STORES = ['sessions', 'exercises', 'body', 'cardio', 'kv'];

let idb = null;
let mem = null; // fallback: {store: {id: obj}}

// Other tabs of the app are told about every write, so two open tabs don't silently overwrite each other.
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('wegogim-data') : null;
bc?.unref?.(); // Node only (tests): an open channel must not keep the process alive
const notify = store => { try { bc?.postMessage({ store, at: Date.now() }); } catch {} };
/** Called with the store name when another tab of the app changed data. */
export const onRemoteChange = cb => bc?.addEventListener('message', e => cb(e.data?.store));
/** Called when a save failed (for example the fallback storage is full). */
let failHandler = () => {};
export const onSaveFailed = cb => { failHandler = cb; };

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // A newer version opened in another tab: let it upgrade instead of blocking it, then reload into it.
      db.onversionchange = () => { db.close(); if (typeof location !== 'undefined') location.reload(); };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    // Another tab holds an older version open: don't hang on "Loading…" forever.
    req.onblocked = () => setTimeout(() => reject(new Error('The app is open in another tab. Close it and reload.')), 4000);
  });
}

function lsLoad() {
  mem = {};
  for (const s of STORES) {
    const raw = localStorage.getItem(`${NAME}.${s}`);
    try { mem[s] = JSON.parse(raw || '{}'); } catch {
      // Damaged: keep the raw text aside so the next save can't overwrite the only copy.
      mem[s] = {};
      try { localStorage.setItem(`${NAME}.${s}.damaged`, raw); } catch {}
    }
  }
}
function lsSave(store) {
  try { localStorage.setItem(`${NAME}.${store}`, JSON.stringify(mem[store])); } catch (e) { console.warn('save failed', e); failHandler(e); throw e; }
}

let mode = null;
let native = null;
/** 'sqlite' on Android; 'indexeddb' or browser 'localstorage'. Native errors never fall back. */
export const storageMode = () => mode;

export async function init() {
  native = globalThis.window?.gimNative?.storage || null;
  if (native) {
    const status = await native.init();
    if (!status.migrated) {
      // Read existing WebView data before selecting SQLite; never erase the source.
      // An unreadable source must stop migration rather than quietly seed an empty app.
      if ('indexedDB' in globalThis) idb = await open();
      else lsLoad();
      const stores = {};
      for (const store of STORES) stores[store] = idb
        ? await tx(store, 'readonly', os => reqP(os.getAll())) : Object.values(mem[store]);
      await native.migrate({ stores });
      idb?.close(); idb = null; mem = null;
    }
    mode = 'sqlite';
    return mode;
  }
  try { idb = await open(); } catch (e) {
    if (/another tab/.test(e?.message || '')) throw e;
    idb = null; lsLoad();
  }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  mode = idb ? 'indexeddb' : 'localstorage';
  return mode;
}

function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    let t, result, failed = false;
    const fail = e => { if (failed) return; failed = true; if (mode === 'readwrite') failHandler(e); reject(e); };
    try { t = idb.transaction(store, mode); } catch (e) { return fail(e); } // closed (another tab upgraded) or similar
    const broke = e => { try { t.abort(); } catch {} fail(e); };
    try { Promise.resolve(fn(t.objectStore(store))).then(r => { result = r; }, broke); } catch (e) { broke(e); }
    t.oncomplete = () => resolve(result);
    t.onerror = () => fail(t.error);
    t.onabort = () => fail(t.error);
  });
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function all(store) {
  if (native) return (await native.read({ store })).records;
  if (!idb) return Object.values(mem[store]);
  return tx(store, 'readonly', os => reqP(os.getAll()));
}

export async function put(store, obj) {
  if (native) { await nativeWrite({ store, records: [obj] }); notify(store); return obj; }
  if (!idb) { const k = store === 'kv' ? obj.key : obj.id; mem[store][k] = obj; lsSave(store); notify(store); return obj; }
  await tx(store, 'readwrite', os => { os.put(obj); });
  notify(store);
  return obj;
}

export async function putMany(store, list) {
  if (native) { await nativeWrite({ store, records: list }); notify(store); return; }
  if (!idb) { for (const o of list) mem[store][store === 'kv' ? o.key : o.id] = o; lsSave(store); notify(store); return; }
  await tx(store, 'readwrite', os => { for (const o of list) os.put(o); });
  notify(store);
}

export async function del(store, key) {
  if (native) { await nativeWrite({ store, operation: 'delete', key }); notify(store); return; }
  if (!idb) { delete mem[store][key]; lsSave(store); notify(store); return; }
  await tx(store, 'readwrite', os => { os.delete(key); });
  notify(store);
}

export async function clear(store) {
  if (native) { await nativeWrite({ store, operation: 'clear' }); notify(store); return; }
  if (!idb) { mem[store] = {}; lsSave(store); notify(store); return; }
  await tx(store, 'readwrite', os => { os.clear(); });
  notify(store);
}

/** One key from the kv store, read directly (never the whole store: it holds progress photos). */
export async function getKv(key, fallback = null) {
  if (native) { const hit = (await native.read({ store: 'kv', key })).records[0]; return hit ? hit.value : fallback; }
  if (!idb) { const hit = mem.kv[key]; return hit ? hit.value : fallback; }
  const hit = await tx('kv', 'readonly', os => reqP(os.get(key)));
  return hit ? hit.value : fallback;
}
export const setKv = (key, value) => put('kv', { key, value });

/** Keys of the kv store starting with a prefix, without loading every value (photos are large). */
export async function kvKeys(prefix) {
  if (native) return (await native.keys({ prefix })).keys;
  if (!idb) return Object.keys(mem.kv).filter(k => k.startsWith(prefix));
  const keys = await tx('kv', 'readonly', os => reqP(os.getAllKeys()));
  return keys.filter(k => String(k).startsWith(prefix));
}

async function nativeWrite(input) {
  try { await native.write(input); }
  catch (error) { failHandler(error); throw error; }
}
