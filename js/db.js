// Tiny IndexedDB wrapper with a localStorage fallback.
// Stores: sessions, exercises, body, cardio (keyed by id) and kv (keyed by key).

const NAME = 'setlist', VERSION = 1;
export const STORES = ['sessions', 'exercises', 'body', 'cardio', 'kv'];

let idb = null;
let mem = null; // fallback: {store: {id: obj}}

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) return reject(new Error('no indexedDB'));
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'key' : 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function lsLoad() {
  mem = {};
  for (const s of STORES) {
    try { mem[s] = JSON.parse(localStorage.getItem(`${NAME}.${s}`) || '{}'); } catch { mem[s] = {}; }
  }
}
function lsSave(store) {
  try { localStorage.setItem(`${NAME}.${store}`, JSON.stringify(mem[store])); } catch (e) { console.warn('save failed', e); }
}

export async function init() {
  try { idb = await open(); } catch { idb = null; lsLoad(); }
  if (navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  return idb ? 'indexeddb' : 'localstorage';
}

function tx(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = idb.transaction(store, mode);
    const os = t.objectStore(store);
    let result;
    Promise.resolve(fn(os)).then(r => { result = r; });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function all(store) {
  if (!idb) return Object.values(mem[store]);
  return tx(store, 'readonly', os => reqP(os.getAll()));
}

export async function put(store, obj) {
  if (!idb) { const k = store === 'kv' ? obj.key : obj.id; mem[store][k] = obj; lsSave(store); return obj; }
  await tx(store, 'readwrite', os => { os.put(obj); });
  return obj;
}

export async function putMany(store, list) {
  if (!idb) { for (const o of list) mem[store][store === 'kv' ? o.key : o.id] = o; lsSave(store); return; }
  await tx(store, 'readwrite', os => { for (const o of list) os.put(o); });
}

export async function del(store, key) {
  if (!idb) { delete mem[store][key]; lsSave(store); return; }
  await tx(store, 'readwrite', os => { os.delete(key); });
}

export async function clear(store) {
  if (!idb) { mem[store] = {}; lsSave(store); return; }
  await tx(store, 'readwrite', os => { os.clear(); });
}

export async function getKv(key, fallback = null) {
  const list = await all('kv');
  const hit = list.find(x => x.key === key);
  return hit ? hit.value : fallback;
}
export const setKv = (key, value) => put('kv', { key, value });
