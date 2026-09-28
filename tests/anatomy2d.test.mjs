// Run: node --test tests/anatomy2d.test.mjs
// The 2D muscle map on the Levels screen: every drawn region names a real app muscle group (so it colours
// and levels correctly) and real 3D atlas muscles, both views are drawn, and both builds render cleanly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { REGIONS, regionById, bodySVG } from '../js/anatomy.js';
import { MUSCLES } from '../js/engine.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fill = () => ({ fill: '#888', op: 1 });
const render = female => bodySVG({ female, fill, sel: 'Back', region: 'lats', level: () => 2 });

test('there are at least 40 regions with unique ids, on both views', () => {
  assert.ok(REGIONS.length >= 40, `only ${REGIONS.length} regions`);
  assert.equal(new Set(REGIONS.map(r => r.id)).size, REGIONS.length);
  for (const v of ['f', 'b']) assert.ok(REGIONS.filter(r => r.view === v).length >= 20, `view ${v}`);
  assert.equal(regionById('lats').group, 'Back');
  assert.equal(regionById('nope'), null);
});

test('every region has a name, an app muscle group and at least one atlas key', () => {
  for (const r of REGIONS) {
    assert.ok(MUSCLES.includes(r.group), `${r.id}: ${r.group}`);
    assert.ok(typeof r.part === 'string' && r.part.length > 3, r.id);
    assert.ok(Array.isArray(r.atlas) && r.atlas.length, r.id);
    for (const k of r.atlas) assert.match(k, /^[a-z][a-z_]*[a-z]$/, `${r.id}: ${k}`);
  }
});

test('atlas keys exist in the 3D atlas', t => {
  const file = join(root, 'anatomy', 'full-body-map.json');
  if (!existsSync(file)) return t.skip('3D atlas not in this checkout');
  const keys = new Set(JSON.parse(readFileSync(file, 'utf8')).muscles.map(m => m.key));
  for (const r of REGIONS) for (const k of r.atlas) assert.ok(keys.has(k), `${r.id}: ${k}`);
});

for (const female of [false, true]) {
  const sex = female ? 'female' : 'male';
  test(`${sex}: renders without NaN and draws every app muscle group`, () => {
    const svg = render(female);
    assert.doesNotMatch(svg, /NaN|undefined|Infinity/);
    const groups = new Set([...svg.matchAll(/data-m="([^"]+)"/g)].map(m => m[1]));
    for (const m of MUSCLES) assert.ok(groups.has(m), `${sex}: ${m} missing`);
    // Each region is drawn twice (left half and its mirror), each tappable with its region id.
    for (const r of REGIONS) assert.equal(svg.split(`data-r="${r.id}"`).length - 1, 2, r.id);
    assert.match(svg, /class="mg on"/);
    assert.match(svg, /class="mz hit" data-act="muscle" data-m="Back" data-r="lats"/);
    // No text on the body except level numbers and the FRONT/BACK labels.
    const texts = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]);
    assert.deepEqual(texts.filter(x => !/^\d+$/.test(x)), ['FRONT', 'BACK']);
    // Regions are pointer targets only: no extra tab stops.
    assert.doesNotMatch(svg, /tabindex="0"/);
  });
}
