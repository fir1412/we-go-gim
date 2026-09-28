import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, searchText } from '../js/seed.js';
import { MUSCLES } from '../js/engine.js';
import { EXERCISE_MUSCLES } from '../js/atlas-map.js';
import { plainText } from '../js/plain.js';

const UNITS = ['kg', 'kg/DB', 'L', 'bw'];
const EQUIP = ['barbell', 'db', 'machine', 'cable', 'smith', 'bw'];

test('library ids and names are unique', () => {
  const ids = EXERCISES.map(e => e.id);
  assert.equal(new Set(ids).size, ids.length, `duplicate ids: ${ids.filter((x, i) => ids.indexOf(x) !== i)}`);
  const names = EXERCISES.map(e => e.name.toLowerCase());
  assert.equal(new Set(names).size, names.length, `duplicate names: ${names.filter((x, i) => names.indexOf(x) !== i)}`);
  // Names stay different once the plain-English pass writes out "DB", "RDL" and so on.
  const plain = EXERCISES.map(e => plainText(e.name).toLowerCase());
  assert.equal(new Set(plain).size, plain.length, `names that read the same: ${plain.filter((x, i) => plain.indexOf(x) !== i)}`);
});

test('every exercise has valid fields and muscles from MUSCLES', () => {
  for (const e of EXERCISES) {
    assert.ok(UNITS.includes(e.unit), `${e.id}: unit ${e.unit}`);
    assert.ok(EQUIP.includes(e.equip), `${e.id}: equip ${e.equip}`);
    assert.ok(e.inc > 0 && e.rest > 0, `${e.id}: inc/rest`);
    assert.ok(e.muscles.length, `${e.id}: no muscles`);
    assert.equal(new Set(e.muscles).size, e.muscles.length, `${e.id}: repeated muscle`);
    for (const m of e.muscles) assert.ok(MUSCLES.includes(m), `${e.id}: unknown muscle ${m}`);
  }
});

test('every exercise has an atlas map with a main muscle', () => {
  for (const e of EXERCISES) {
    const m = EXERCISE_MUSCLES[e.id];
    assert.ok(m && m.main.length, `no atlas map for ${e.id}`);
  }
});

test('every muscle group has at least 5 library exercises', () => {
  for (const g of MUSCLES) {
    const n = EXERCISES.filter(e => e.muscles.includes(g)).length;
    assert.ok(n >= 5, `${g} has only ${n} exercises`);
  }
});

test('search finds exercises by their other names', () => {
  const find = q => EXERCISES.filter(e => searchText(e).includes(q)).map(e => e.id);
  assert.ok(find('hyperextension').includes('backext'));
  assert.ok(find('straight arm pulldown').includes('pullover'));
  assert.ok(find('sumo').includes('sumo'));
  assert.ok(find('rear delt cable fly').includes('revcablefly'));
  assert.ok(find('kb swing').includes('kbswing'));
});
