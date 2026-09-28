// Run: node --test tests/import-corpus.test.mjs
// Every file in the import corpus goes through io.importFile, the same path the Import screen uses
// for non-PDF files, and must give what a correct import finds. See tests/import-corpus/make.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as io from '../js/io.js';
import { EXERCISES } from '../js/seed.js';
import { makeCorpus } from './import-corpus/make.mjs';

const { dir, expected } = makeCorpus();
const opts = { year: 2026 };

for (const [name, exp] of Object.entries(expected)) {
  test(`import: ${name}`, () => {
    const r = io.importFile(name, readFileSync(join(dir, name)), EXERCISES, opts);
    if (exp.kind === 'reject') {
      assert.equal(r.kind, 'reject', `expected a reject, got ${r.kind}`);
      assert.match(r.message, new RegExp(exp.why, 'i'));
      return;
    }
    if (exp.kind === 'backup' || exp.kind === 'pdf') return assert.equal(r.kind, exp.kind);
    assert.notEqual(r.kind, 'reject', r.message);
    if (exp.kind !== 'any') assert.equal(r.kind, exp.kind, 'route');
    const { sessions } = io.dedupeSessions(r.sessions);
    const work = sessions.reduce((a, s) => a + s.entries.reduce((b, e) => b + e.sets.filter(x => !x.warm).length, 0), 0);
    assert.equal(sessions.length, exp.sessions, 'sessions');
    assert.equal(work, exp.sets, 'working sets');
    if (exp.date) assert.equal(sessions.map(s => s.date).sort()[0], exp.date, 'first date');
    if (exp.check) {
      const hit = sessions.flatMap(s => s.entries).find(e => (e.match ?? io.matchExercise(e.exName, EXERCISES)?.ex.id) === exp.check.ex);
      assert.ok(hit, `no entry matched ${exp.check.ex}: ${sessions.flatMap(s => s.entries).map(e => e.exName).join(' | ')}`);
      const s0 = hit.sets.find(x => !x.warm);
      assert.ok(Math.abs(+s0.w - exp.check.w) < 0.01, `weight ${s0.w} ≠ ${exp.check.w}`);
      assert.equal(+s0.r, exp.check.r, 'reps');
    }
    if (exp.pain) assert.ok(sessions.flatMap(s => s.entries).some(e => e.pain && (e.match ?? io.matchExercise(e.exName, EXERCISES)?.ex.id) === exp.pain), 'pain flag');
  });
}
