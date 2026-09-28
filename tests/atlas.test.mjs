import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXERCISES } from '../js/seed.js';
import { EXERCISE_MUSCLES, BY_GROUP, musclesFor, groupOf } from '../js/atlas-map.js';

const map = JSON.parse(readFileSync(new URL('../anatomy/full-body-map.json', import.meta.url), 'utf8'));
const KEYS = new Set(map.muscles.map(m => m.key));

test('every library exercise has a detailed muscle map', () => {
  for (const ex of EXERCISES) assert.ok(EXERCISE_MUSCLES[ex.id], `no atlas map for ${ex.id}`);
  for (const id of Object.keys(EXERCISE_MUSCLES)) assert.ok(EXERCISES.some(e => e.id === id), `map for unknown exercise ${id}`);
});

test('every mapped muscle exists in the atlas, and each exercise has a main muscle', () => {
  for (const [id, { main, help }] of Object.entries(EXERCISE_MUSCLES)) {
    assert.ok(main.length, `${id} has no main muscle`);
    for (const k of [...main, ...help]) assert.ok(KEYS.has(k), `${id}: unknown atlas muscle ${k}`);
  }
  for (const [g, ks] of Object.entries(BY_GROUP)) for (const k of ks) assert.ok(KEYS.has(k), `${g}: unknown atlas muscle ${k}`);
});

test('every app muscle group reaches the atlas, and custom exercises fall back to their groups', () => {
  const groups = new Set(EXERCISES.flatMap(e => e.muscles));
  for (const g of groups) assert.ok(BY_GROUP[g]?.length, `no atlas muscles for ${g}`);
  const custom = musclesFor({ id: 'my-own', muscles: ['Chest', 'Triceps'] });
  assert.deepEqual(custom.main, BY_GROUP.Chest);
  assert.ok(custom.help.includes('triceps_long'));
  assert.equal(groupOf('vastus_lateralis'), 'Quads');
  assert.equal(groupOf('popliteus'), null);
});

test('the vendored three.js files import only each other', () => {
  const dir = new URL('../js/vendor/three/', import.meta.url);
  for (const f of ['GLTFLoader.js', 'TrackballControls.js', 'BufferGeometryUtils.js']) {
    const src = readFileSync(new URL(f, dir), 'utf8');
    for (const [, spec] of src.matchAll(/^(?:import .*|} )from '([^']+)'/gm)) assert.match(spec, /^\.\/[\w.]+\.js$/, `${f} imports ${spec}`);
  }
});
