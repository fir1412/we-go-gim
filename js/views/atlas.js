// Medical mode: every muscle in 3D. Drag turns the body any way (all axes), pinch or scroll zooms, two fingers
// pan. Tap a muscle for its name and the exercises that train it; tap an exercise to light up what it works.
// three.js (vendored in js/vendor/three) and the model load only when this screen is opened.
import { S, saveSettings } from '../state.js';
import { esc } from '../ui.js';
import { translate } from '../i18n.js';
import { musclesFor, groupOf, BY_GROUP } from '../atlas-map.js';

const COL = { base: 0xb8625c, dim: 0x5d616c, main: 0xff8a3d, help: 0xffcf5c, pick: 0xff5a36, bone: 0xe9e2d2 };
let T3 = null, lib = null, loading = null, failed = null;
let view = null;            // { renderer, scene, camera, controls, canvas, cur, center, size }
const models = {};          // 'male' | 'female' → { root, meshes: [{ mesh, key }], bones: [mesh], mats: Map }
let meta = null;            // key → { label, group, region, layer }
let sel = null, exSel = null, groupSel = null, layer = 'all', showBones = true, query = '';

// Turn speed: a gentle default, and a slider (0.3–2×) whose choice is remembered in settings.
const sens = () => { const v = +S.settings.atlasSens; return v >= 0.3 && v <= 2 ? v : 1; };
function applySensitivity(controls, v = sens()) {
  Object.assign(controls, { rotateSpeed: 1.1 * v, zoomSpeed: 0.9 * v, panSpeed: 0.5 * v });
}
const bodyType = () => S.settings.bodyType || (S.settings.stdSex === 'women' ? 'female' : 'male');
const X = '<span aria-hidden="true">×</span>';

export function render(route) {
  const [kind, val] = route.args;
  if (kind === 'g' && BY_GROUP[val]) { groupSel = val; sel = null; exSel = null; }
  if (kind === 'x' && S.exById[val]) { exSel = val; sel = null; groupSel = null; }
  const b = bodyType();
  const h = `<div class="atlas">
    <div class="atlas-stage" id="atlas-stage"><p class="atlas-msg" id="atlas-msg">${failed ? esc(failed) : 'Loading the 3D body…'}</p></div>
    <div class="atlas-tools">
      <div class="seg sm" role="group" aria-label="Turn the body to">${[['front', 'Front'], ['back', 'Rear'], ['side', 'Side'], ['reset', 'Reset']].map(([v, l]) => `<button data-act="atlas-view" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="seg sm" role="group" aria-label="Muscle layer">${[['all', 'Surface'], ['deep', 'Deep']].map(([v, l]) => `<button data-act="atlas-layer" data-v="${v}" aria-pressed="${layer === v}">${l}</button>`).join('')}</div>
      <div class="seg sm" role="group" aria-label="Body shown">${[['male', 'Male'], ['female', 'Female']].map(([v, l]) => `<button data-act="atlas-body" data-v="${v}" aria-pressed="${b === v}">${l}</button>`).join('')}</div>
      <label class="atlas-bones"><input type="checkbox" id="atlas-bones" ${showBones ? 'checked' : ''}> Skeleton</label>
      <label class="atlas-sens"><span>Turn speed</span><input type="range" id="atlas-sens" min="0.3" max="2" step="0.1" value="${sens()}" aria-label="Turn speed"></label>
    </div>
    <p class="fine atlas-how">Drag to turn the body any way. Pinch or scroll to zoom, two fingers to move it. Tap a muscle to see which exercises train it.</p>
    <input type="search" id="atlas-q" class="atlas-q" placeholder="Search muscles or exercises" aria-label="Search muscles or exercises" value="${esc(query)}" autocomplete="off">
    <ul class="box atlas-results" id="atlas-results" hidden></ul>
    <section class="box pad atlas-info" id="atlas-info" aria-live="polite"></section>
    <p class="fine">3D model: Z-Anatomy, from BodyParts3D (© The Database Center for Life Science), adapted by the FitMitWith anatomy atlas. License CC BY-SA 4.0. The female build is illustrative. For learning, not for diagnosis.</p>
  </div>`;
  return { title: 'Medical mode', sub: 'Every muscle in 3D', html: h, color: 'push', back: 'levels', after: mount };
}

// ---- data ----------------------------------------------------------------------------------------------
async function ensureLoaded() {
  if (T3 && meta) return;
  loading ??= (async () => {
    const [three, gltf, tb, map] = await Promise.all([
      import('../vendor/three/three.module.min.js'), import('../vendor/three/GLTFLoader.js'),
      import('../vendor/three/TrackballControls.js'), fetch('anatomy/full-body-map.json').then(r => r.json()),
    ]);
    T3 = three; lib = { GLTFLoader: gltf.GLTFLoader, TrackballControls: tb.TrackballControls };
    const m = {};
    for (const x of map.muscles) m[x.key] ??= { label: x.label, group: x.group, region: x.region, layer: x.layer };
    meta = m;
  })();
  await loading;
}

async function model(which) {
  if (models[which]) return models[which];
  const file = which === 'female' ? 'anatomy/full-body-female-mobile.glb' : 'anatomy/full-body-male-mobile.glb';
  const gltf = await new lib.GLTFLoader().loadAsync(file);
  const root = gltf.scene, meshes = [], bones = [], mats = new Map();
  root.traverse(o => {
    if (!o.isMesh) return;
    const key = o.userData?.key || o.parent?.userData?.key;
    if (key && meta[key]) {
      if (!mats.has(key)) mats.set(key, new T3.MeshStandardMaterial({ color: COL.base, roughness: 0.62, metalness: 0.02 }));
      o.material = mats.get(key);
      meshes.push({ mesh: o, key });
    } else {
      o.material = new T3.MeshStandardMaterial({ color: COL.bone, roughness: 0.8 });
      bones.push(o);
    }
  });
  return (models[which] = { root, meshes, bones, mats });
}

// ---- scene ---------------------------------------------------------------------------------------------
function makeView() {
  const canvas = document.createElement('canvas');
  canvas.className = 'atlas-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', '3D muscle model. Drag to turn, pinch to zoom, tap a muscle');
  const renderer = new T3.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  const scene = new T3.Scene();
  const camera = new T3.PerspectiveCamera(32, 1, 0.01, 50);
  scene.add(new T3.HemisphereLight(0xffffff, 0x3a3f4a, 1.4));
  const light = new T3.DirectionalLight(0xffffff, 1.6);
  light.position.set(0.6, 1, 1.2);
  camera.add(light);   // the light follows the view, so the side facing you is always lit
  scene.add(camera);
  const controls = new lib.TrackballControls(camera, canvas);
  Object.assign(controls, { dynamicDampingFactor: 0.12, minDistance: 0.25, maxDistance: 7 });
  applySensitivity(controls);
  controls.keys = ['', '', ''];   // letter keys belong to the search box
  // A tap (not a drag) picks a muscle.
  let down = null;
  canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; });
  canvas.addEventListener('pointerup', e => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) <= 7 && Date.now() - down.t <= 600) pick(e);
    down = null;
  });
  return { renderer, scene, camera, controls, canvas, cur: null, center: new T3.Vector3(), size: 1.8 };
}

let resizeObs = null;
async function mount(sc) {
  const stage = sc.querySelector('#atlas-stage');
  if (!stage) return;
  wireUi(sc);
  paintInfo();
  const msg = t => { const p = stage.querySelector('#atlas-msg'); if (p) p.textContent = t; };
  if (!window.WebGLRenderingContext) { failed = 'This browser can’t show 3D. Try another browser, or update this one.'; msg(failed); return; }
  try {
    await ensureLoaded();
    paintInfo();
    view ??= makeView();
    const m = await model(bodyType());
    if (!stage.isConnected) return;
    if (view.cur !== m) {
      if (view.cur) view.scene.remove(view.cur.root);
      view.scene.add(m.root);
      const box = new T3.Box3().setFromObject(m.root);
      box.getCenter(view.center);
      view.size = box.getSize(new T3.Vector3()).y;
      const first = !view.cur;
      view.cur = m;
      if (first) setView('front');
    }
    stage.querySelector('#atlas-msg')?.remove();
    stage.appendChild(view.canvas);
    resizeObs?.disconnect();
    resizeObs = new ResizeObserver(() => size(stage));
    resizeObs.observe(stage);
    size(stage);
    applyLayers();
    paint();
    loop();
  } catch (err) {
    console.error(err);
    failed = 'Couldn’t load the 3D body. It needs internet the first time.';
    msg(failed);
    loading = null;
  }
}

function size(stage) {
  if (!view || !stage.isConnected) return;
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  view.renderer.setSize(w, h, false);
  view.camera.aspect = w / h;
  view.camera.updateProjectionMatrix();
  view.controls.handleResize();
}

let running = false;
function loop() {
  if (running) return;
  running = true;
  const tick = () => {
    if (!view?.canvas.isConnected) { running = false; return; }
    view.controls.update();
    view.renderer.render(view.scene, view.camera);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function setView(which) {
  if (!view) return;
  const { camera, controls, center, size: h } = view;
  const d = h * 1.9;
  const [x, z] = { back: [0, -1], side: [1, 0] }[which] || [0, 1];
  camera.up.set(0, 1, 0);
  camera.position.set(center.x + x * d, center.y + h * 0.05, center.z + z * d);
  controls.target.copy(center);
  camera.lookAt(center);
  controls.update();
}

function applyLayers() {
  const m = view?.cur;
  if (!m) return;
  for (const { mesh, key } of m.meshes) mesh.visible = layer === 'all' || meta[key].layer !== 'superficial';
  for (const b of m.bones) b.visible = showBones;
}

/** Colour every muscle: the picked one, an exercise's main and helper muscles, or everything in a group. */
function paint() {
  const m = view?.cur;
  if (!m) return;
  const { main, help } = focus();
  const any = main.size || help.size;
  for (const [key, mat] of m.mats) {
    mat.color.setHex(key === sel ? COL.pick : main.has(key) ? COL.main : help.has(key) ? COL.help : any ? COL.dim : COL.base);
    mat.emissive.setHex(key === sel ? 0x3a0e00 : 0);
  }
}
function focus() {
  if (exSel) { const ex = S.exById[exSel]; const mm = ex ? musclesFor(ex) : { main: [], help: [] }; return { main: new Set(mm.main), help: new Set(mm.help) }; }
  if (sel) return { main: new Set([sel]), help: new Set() };
  if (groupSel) return { main: new Set(BY_GROUP[groupSel]), help: new Set() };
  return { main: new Set(), help: new Set() };
}

function pick(e) {
  const m = view?.cur;
  if (!m) return;
  const r = view.canvas.getBoundingClientRect();
  const p = new T3.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  const ray = new T3.Raycaster();
  ray.setFromCamera(p, view.camera);
  const hit = ray.intersectObjects(m.meshes.filter(x => x.mesh.visible).map(x => x.mesh), false)[0];
  select((hit && m.meshes.find(x => x.mesh === hit.object)?.key) || null);
}

function select(key) { sel = key; exSel = null; groupSel = null; paint(); paintInfo(); }
function selectEx(id) { exSel = id; sel = null; groupSel = null; paint(); paintInfo(); }

// ---- panel under the model -----------------------------------------------------------------------------
/** Exercises in your library that train an atlas muscle, main work first. */
function trainers(key) {
  const main = [], help = [];
  for (const ex of S.exercises) { const mm = musclesFor(ex); if (mm.main.includes(key)) main.push(ex); else if (mm.help.includes(key)) help.push(ex); }
  return { main, help };
}
const exBtn = ex => `<button class="mini" data-act="atlas-ex" data-id="${esc(ex.id)}">${esc(ex.name)}</button>`;
const mBtn = key => `<button class="mini" data-noplain data-act="atlas-m" data-k="${esc(key)}">${esc(meta?.[key]?.label || key)}</button>`;
const clearBtn = `<button class="iconbtn" data-act="atlas-clear" aria-label="Clear">${X}</button>`;

function paintInfo() {
  const el = document.getElementById('atlas-info');
  if (!el) return;
  let h;
  if (sel && meta?.[sel]) {
    const mm = meta[sel], t = trainers(sel), g = groupOf(sel);
    h = `<header class="atlas-head"><div class="grow" data-noplain><h2>${esc(mm.label)}</h2><small>${esc(mm.group)}${mm.layer === 'deep' ? ' · deep muscle' : ''}</small></div>${clearBtn}</header>
      ${g ? `<p class="fine"><a href="#/levels">Counts toward ${esc(g)} on your levels.</a></p>` : ''}
      <p class="lbl">Main work</p>${t.main.length ? `<div class="chips">${t.main.map(exBtn).join('')}</div>` : '<p class="fine">No exercise in your library works this as a main muscle.</p>'}
      ${t.help.length ? `<p class="lbl">Helps in</p><div class="chips">${t.help.map(exBtn).join('')}</div>` : ''}`;
  } else if (exSel && S.exById[exSel]) {
    const ex = S.exById[exSel], mm = musclesFor(ex);
    h = `<header class="atlas-head"><div class="grow"><h2>${esc(ex.name)}</h2><small class="atlas-key"><i style="background:#ff8a3d"></i>main work <i style="background:#ffcf5c"></i>helpers</small></div>${clearBtn}</header>
      <p class="lbl">Main work</p><div class="chips">${[...new Set(mm.main)].map(mBtn).join('')}</div>
      ${mm.help.length ? `<p class="lbl">Helpers</p><div class="chips">${[...new Set(mm.help)].map(mBtn).join('')}</div>` : ''}
      <p class="fine"><a href="#/ex/${esc(ex.id)}">See your history for this exercise</a></p>`;
  } else if (groupSel) {
    h = `<header class="atlas-head"><div class="grow"><h2>${esc(groupSel)}</h2><small>${BY_GROUP[groupSel].length} muscles</small></div>${clearBtn}</header><div class="chips">${BY_GROUP[groupSel].map(mBtn).join('')}</div>`;
  } else {
    h = `<p class="fine">Tap any muscle on the body, or search above. Switch to Deep to see the muscles underneath.</p>`;
  }
  el.innerHTML = h;
}

function paintResults() {
  const ul = document.getElementById('atlas-results');
  if (!ul) return;
  const q = query.trim().toLowerCase();
  if ((q.length < 2 && !/[^\x00-\x7f]/.test(q)) || !meta) { ul.hidden = true; ul.innerHTML = ''; return; }
  const hit = s => s.toLowerCase().includes(q) || translate(s).toLowerCase().includes(q);
  const ms = Object.entries(meta).filter(([, m]) => hit(m.label) || hit(m.group)).slice(0, 8);
  const xs = S.exercises.filter(x => hit(x.name)).slice(0, 6);
  ul.innerHTML = [...ms.map(([k, m]) => `<li><button class="li" data-noplain data-act="atlas-m" data-k="${esc(k)}"><span><b>${esc(m.label)}</b><small>${esc(m.group)}</small></span></button></li>`),
    ...xs.map(x => `<li><button class="li" data-act="atlas-ex" data-id="${esc(x.id)}"><span><b>${esc(x.name)}</b><small>Exercise</small></span></button></li>`)].join('')
    || '<li class="fine pad">Nothing found</li>';
  ul.hidden = false;
}

function wireUi(sc) {
  sc.querySelector('#atlas-q')?.addEventListener('input', e => { query = e.target.value; paintResults(); });
  sc.querySelector('#atlas-bones')?.addEventListener('change', e => { showBones = e.target.checked; applyLayers(); });
  const slider = sc.querySelector('#atlas-sens');
  // Live while dragging; saved (and remembered) when let go.
  slider?.addEventListener('input', e => { if (view) applySensitivity(view.controls, +e.target.value); });
  slider?.addEventListener('change', e => saveSettings({ atlasSens: Math.max(0.3, Math.min(2, +e.target.value || 1)) }));
  if (query) ensureLoaded().then(paintResults).catch(() => {});
}
const closeResults = () => { query = ''; const q = document.getElementById('atlas-q'); if (q) q.value = ''; paintResults(); };

export const actions = {
  'atlas-view': el => setView(el.dataset.v),
  'atlas-layer'(el) {
    layer = el.dataset.v === 'deep' ? 'deep' : 'all';
    for (const b of document.querySelectorAll('[data-act="atlas-layer"]')) b.setAttribute('aria-pressed', String(b.dataset.v === layer));
    applyLayers();
  },
  'atlas-body': el => saveSettings({ bodyType: el.dataset.v === 'female' ? 'female' : 'male' }),
  'atlas-m': el => { closeResults(); select(el.dataset.k); },
  'atlas-ex': el => { closeResults(); selectEx(el.dataset.id); },
  'atlas-clear': () => { sel = null; exSel = null; groupSel = null; paint(); paintInfo(); },
};
