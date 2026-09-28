// A made-up training log for the engine tests: round numbers shaped to hit each rule (progression, an old peak, missing reps).

const sets = (w, reps) => reps.map(r => ({ w, r, done: true }));
const E = (exId, w, reps, extra = {}) => ({ exId, sets: sets(w, reps), rir: null, pain: false, ...extra });
const x4 = r => [r, r, r, r];
const x3 = r => [r, r, r];

const SEED = [
  ['2026-03-10', 'Shoulders', 'upper', [E('shp', 20, [10, 9, 8])], { approx: true }], // an old peak, outside the 12-week window
  ['2026-08-04', 'Chest', 'push', [E('bench', 20, x4(6))]],
  ['2026-08-05', 'Legs', 'legs', [E('squat', 45, x4(6)), E('rdl', 40, [8])]],
  ['2026-08-07', 'Shoulders', 'upper', [E('shp', 15, x3(8))], { approx: true }],
  ['2026-08-12', 'Legs', 'legs', [E('squat', 45, x4(6))]],
  ['2026-08-18', 'Chest', 'push', [E('bench', 22.5, x4(6))]],
  ['2026-08-26', 'Legs', 'legs', [E('squat', 50, x4(6))]],
  ['2026-09-02', 'Shoulders', 'upper', [E('shp', 15, x3(8))], { approx: true }],
  ['2026-09-04', 'Legs', 'legs', [E('squat', 60, x4(6)), E('legpress', 80, [10])]],
  ['2026-09-09', 'Back', 'pull', [E('pulldown', 40, x3(10)), E('cablerow', 9, [null, null]), E('ezcurl', 10, [10])]], // reps not written down
  ['2026-09-14', 'Chest', 'push', [E('bench', 22.5, x4(8))]],
  ['2026-09-21', 'Chest', 'push', [E('bench', 25, x4(8)), E('incline', 25, x3(8))]],
];

export function sampleSessions(gymId = 'g1') {
  return SEED.map(([date, name, color, entries, extra = {}]) => ({
    id: `seed-${date}-${name.toLowerCase()}`,
    date, name, color, gymId, entries,
    readiness: null, feel: null, hr: null,
    seed: true, approx: !!extra.approx, note: '',
  }));
}

