// Starting exercise library and a 5-day programme. No personal history ships with the app.

const X = (id, name, unit, equip, inc, rest, muscles, extra = {}) =>
  ({ id, name, unit, equip, inc, rest, muscles, perGym: equip === 'machine' || equip === 'cable', ...extra });

export const EXERCISES = [
  X('bench', 'Flat DB bench press', 'kg/DB', 'db', 2.5, 150, ['Chest', 'Front delts', 'Triceps']),
  X('incline', 'Incline DB press', 'kg/DB', 'db', 2.5, 120, ['Chest', 'Front delts']),
  X('mchest', 'Machine chest press', 'kg', 'machine', 5, 120, ['Chest']),
  X('mshp', 'Machine shoulder press', 'kg', 'machine', 5, 120, ['Front delts', 'Triceps']),
  X('shp', 'DB shoulder press', 'kg/DB', 'db', 2.5, 120, ['Front delts', 'Triceps']),
  X('fly', 'Cable chest fly', 'L', 'cable', 1, 75, ['Chest']),
  X('lat', 'Cable lateral raise', 'L', 'cable', 1, 60, ['Side delts']),
  X('ohext', 'Overhead cable triceps extension', 'L', 'cable', 1, 75, ['Triceps']),
  X('pushdown', 'Rope pushdown', 'L', 'cable', 1, 60, ['Triceps']),
  X('cgb', 'Smith close-grip bench', 'kg', 'smith', 2.5, 120, ['Triceps', 'Chest']),
  X('pullup', 'Pull-up', 'bw', 'bw', 2.5, 150, ['Back', 'Biceps']),
  X('pulldown', 'Lat pulldown', 'kg', 'machine', 2.5, 120, ['Back', 'Biceps']),
  X('csrow', 'Chest-supported row', 'kg', 'machine', 2.5, 120, ['Back', 'Rear delts']),
  X('cablerow', 'Seated cable row', 'L', 'cable', 1, 90, ['Back']),
  X('rdelt', 'Reverse pec deck', 'L', 'machine', 1, 60, ['Rear delts']),
  X('facepull', 'Face pull', 'L', 'cable', 1, 60, ['Rear delts']),
  X('smithdl', 'Smith deadlift', 'kg', 'smith', 5, 150, ['Hamstrings', 'Back', 'Glutes'], { caution: 'Keep a neutral back; stop the set if form breaks.' }),
  X('inccurl', 'Incline DB curl', 'kg/DB', 'db', 2, 75, ['Biceps']),
  X('hammer', 'Hammer curl', 'kg/DB', 'db', 2, 75, ['Biceps']),
  X('preacher', 'Preacher curl', 'kg', 'machine', 2.5, 75, ['Biceps']),
  X('ezcurl', 'EZ-bar curl', 'kg', 'barbell', 2.5, 75, ['Biceps'], {}),
  X('squat', 'Smith squat', 'kg', 'smith', 2.5, 180, ['Quads', 'Glutes'], { caution: 'Only progress if depth and control match last time.' }),
  X('legpress', 'Leg press', 'kg', 'machine', 10, 120, ['Quads', 'Glutes'], {}),
  X('bss', 'Bulgarian split squat', 'kg/DB', 'db', 2, 90, ['Quads', 'Glutes']),
  X('lunge', 'Walking lunge', 'kg/DB', 'db', 2, 90, ['Quads', 'Glutes']),
  X('legcurl', 'Leg curl', 'kg', 'machine', 5, 90, ['Hamstrings']),
  X('legext', 'Leg extension', 'kg', 'machine', 5, 75, ['Quads']),
  X('calf', 'Standing calf raise', 'kg', 'machine', 5, 60, ['Calves']),
  X('crunch', 'Cable crunch', 'L', 'cable', 1, 60, ['Abs']),
  X('rdl', 'Romanian deadlift', 'kg', 'barbell', 2.5, 150, ['Hamstrings', 'Glutes'], { caution: 'Stop the set if your lower back takes over. Straps help if grip goes first.' }),
  X('hipthrust', 'Hip thrust', 'kg', 'barbell', 5, 120, ['Glutes', 'Hamstrings'], {}),
  // Dumbbell-only and home options, used by the split builder
  X('hacksquat', 'Hack squat', 'kg', 'machine', 5, 150, ['Quads', 'Glutes']),
  X('goblet', 'Goblet squat', 'kg/DB', 'db', 2, 120, ['Quads', 'Glutes']),
  X('dbrdl', 'DB Romanian deadlift', 'kg/DB', 'db', 2, 120, ['Hamstrings', 'Glutes']),
  X('dbrow', 'One-arm DB row', 'kg/DB', 'db', 2, 90, ['Back', 'Biceps']),
  X('dblat', 'DB lateral raise', 'kg/DB', 'db', 1, 60, ['Side delts']),
  X('dbreardelt', 'DB rear delt fly', 'kg/DB', 'db', 1, 60, ['Rear delts']),
  X('dbfly', 'DB chest fly', 'kg/DB', 'db', 2, 75, ['Chest']),
  X('dbohext', 'DB overhead triceps extension', 'kg/DB', 'db', 2, 75, ['Triceps']),
  X('pushup', 'Push-up', 'bw', 'bw', 2.5, 90, ['Chest', 'Front delts', 'Triceps']),
  X('pikepush', 'Pike push-up', 'bw', 'bw', 2.5, 90, ['Front delts', 'Triceps']),
  X('invrow', 'Inverted row', 'bw', 'bw', 2.5, 90, ['Back', 'Biceps']),
  X('bwsquat', 'Bodyweight squat', 'bw', 'bw', 2.5, 60, ['Quads', 'Glutes']),
  X('glutebridge', 'Glute bridge', 'bw', 'bw', 2.5, 60, ['Glutes', 'Hamstrings']),
  X('bwcalf', 'Single-leg calf raise', 'bw', 'bw', 2.5, 45, ['Calves']),
  X('benchdip', 'Bench dip', 'bw', 'bw', 2.5, 60, ['Triceps']),
  X('plank', 'Plank (seconds as reps)', 'bw', 'bw', 2.5, 45, ['Abs']),
  // More split-builder options: bodyweight legs that don't need a dumbbell, hamstrings and core with rep counts
  X('chinup', 'Chin-up', 'bw', 'bw', 2.5, 150, ['Back', 'Biceps']),
  X('declpush', 'Feet-up push-up', 'bw', 'bw', 2.5, 90, ['Chest', 'Front delts', 'Triceps']),
  X('bwsplit', 'Split squat (bodyweight)', 'bw', 'bw', 2.5, 75, ['Quads', 'Glutes']),
  X('bwlunge', 'Reverse lunge (bodyweight)', 'bw', 'bw', 2.5, 75, ['Quads', 'Glutes']),
  X('slidecurl', 'Sliding leg curl (towel)', 'bw', 'bw', 2.5, 75, ['Hamstrings']),
  X('ytraise', 'Prone Y-T raise', 'bw', 'bw', 1, 45, ['Rear delts']),
  X('revcrunch', 'Reverse crunch', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('hlr', 'Hanging knee raise', 'bw', 'bw', 2.5, 60, ['Abs']),
  X('lyingcurl', 'Lying leg curl', 'kg', 'machine', 5, 90, ['Hamstrings']),
  X('dbskull', 'DB lying triceps extension', 'kg/DB', 'db', 1, 75, ['Triceps']),
  // Common gym lifts, so imported logs match without creating new exercises
  X('pecdeck', 'Pec deck', 'kg', 'machine', 5, 75, ['Chest']),
  X('skull', 'Skull crusher', 'kg', 'barbell', 2.5, 75, ['Triceps']),
  X('wristcurl', 'Wrist curl', 'kg/DB', 'db', 1, 45, ['Biceps']),
  X('revwristcurl', 'Reverse wrist curl', 'kg/DB', 'db', 1, 45, ['Biceps']),
  X('pullover', 'Cable pullover', 'L', 'cable', 1, 75, ['Back']),
  X('hanglegraise', 'Hanging leg raise', 'bw', 'bw', 2.5, 60, ['Abs']),
  X('bbsquat', 'Barbell squat', 'kg', 'barbell', 2.5, 180, ['Quads', 'Glutes']),
  X('machinedip', 'Machine dip', 'kg', 'machine', 5, 90, ['Triceps', 'Chest']),
  X('widepulldown', 'Wide-grip lat pulldown', 'kg', 'machine', 2.5, 120, ['Back', 'Biceps']),
  X('closerow', 'Close-grip cable row', 'kg', 'cable', 2.5, 90, ['Back', 'Biceps']),
  X('onearmcablerow', 'Single-arm cable row', 'kg', 'cable', 2.5, 75, ['Back']),
  X('dbshrug', 'DB shrug', 'kg/DB', 'db', 2, 60, ['Back']),
  X('cheatcurl', 'Cheat curl', 'kg/DB', 'db', 2, 75, ['Biceps']),
  // Barbell staples, Olympic lifts and common glute work, so experienced lifters' plans and logs match
  X('bbbench', 'Barbell bench press', 'kg', 'barbell', 2.5, 180, ['Chest', 'Front delts', 'Triceps']),
  X('deadlift', 'Deadlift', 'kg', 'barbell', 5, 180, ['Hamstrings', 'Glutes', 'Back'], { caution: 'Brace and keep the bar close; stop the set if your lower back rounds.' }),
  X('ohp', 'Overhead press (barbell)', 'kg', 'barbell', 2.5, 150, ['Front delts', 'Triceps']),
  X('frontsquat', 'Front squat', 'kg', 'barbell', 2.5, 180, ['Quads', 'Glutes']),
  X('bbrow', 'Barbell row', 'kg', 'barbell', 2.5, 120, ['Back', 'Biceps', 'Rear delts']),
  X('trapdl', 'Trap bar deadlift', 'kg', 'barbell', 5, 180, ['Quads', 'Glutes', 'Hamstrings']),
  X('snatch', 'Snatch', 'kg', 'barbell', 2.5, 150, ['Quads', 'Glutes', 'Hamstrings'], { caution: 'Technique first: add weight only when every rep looks the same.' }),
  X('cleanjerk', 'Clean & jerk', 'kg', 'barbell', 2.5, 150, ['Quads', 'Glutes', 'Hamstrings'], { caution: 'Technique first: add weight only when every rep looks the same.' }),
  X('powerclean', 'Power clean', 'kg', 'barbell', 2.5, 150, ['Quads', 'Glutes', 'Hamstrings']),
  X('pushpress', 'Push press', 'kg', 'barbell', 2.5, 150, ['Front delts', 'Triceps', 'Quads']),
  X('nordic', 'Nordic curl', 'bw', 'bw', 2.5, 120, ['Hamstrings']),
  X('dbcurl', 'DB curl', 'kg/DB', 'db', 2, 75, ['Biceps']),
  X('hipabd', 'Hip abduction machine', 'kg', 'machine', 5, 60, ['Glutes']),
  X('glutekick', 'Cable glute kickback', 'L', 'cable', 1, 60, ['Glutes', 'Hamstrings']),
  X('frogpump', 'Frog pump', 'bw', 'bw', 2.5, 60, ['Glutes']),
];

// Other names people search for, so "bicep curl" finds the DB curl and "OHP" the overhead press.
const SYNONYMS = {
  dbcurl: 'bicep biceps curl dumbbell', inccurl: 'bicep biceps', hammer: 'bicep biceps', ezcurl: 'bicep biceps barbell curl',
  bench: 'dumbbell chest', bbbench: 'bench bb flat competition chest', incline: 'dumbbell chest', deadlift: 'dl conventional sumo',
  trapdl: 'hex bar', ohp: 'ohp military press shoulder press standing', frontsquat: 'squat', bbsquat: 'back squat', squat: 'smith',
  bbrow: 'bent over row pendlay', dbrow: 'dumbbell row', pulldown: 'lat', widepulldown: 'lat', lat: 'side delt shoulder', dblat: 'side delt shoulder',
  pushdown: 'tricep triceps', ohext: 'tricep triceps', dbohext: 'tricep triceps', skull: 'tricep triceps lying extension', dbskull: 'tricep triceps skull crusher',
  cleanjerk: 'olympic weightlifting c&j', snatch: 'olympic weightlifting', powerclean: 'olympic clean', pushpress: 'olympic shoulder',
  nordic: 'hamstring bodyweight', hipabd: 'abductor glute outer thigh', glutekick: 'kickback butt', frogpump: 'glute butt', hipthrust: 'glute butt',
  glutebridge: 'butt', rdl: 'romanian stiff leg', dbrdl: 'romanian', plank: 'core timed hold', crunch: 'abs core', hanglegraise: 'abs core',
  legcurl: 'hamstring', lyingcurl: 'hamstring', legext: 'quad quads', calf: 'calves', pullup: 'chin bodyweight', pushup: 'press up',
};
/** Lower-case text an exercise search matches against: name, muscles and other names for it. */
export const searchText = x => `${x.name} ${(x.muscles || []).join(' ')} ${SYNONYMS[x.id] || ''}`.toLowerCase();
/** Searches that mean cardio, which is logged under Insights → Cardio rather than as an exercise. */
export const CARDIO_WORDS = /^(tread|walk|run|jog|cardio|bike|cycl|spin|ellip|cross ?train|stair|row(ing)? machine|erg|swim|hike|skip)/i;

const S = (exId, sets, lo, hi, group = '') => ({ exId, sets, lo, hi, group });

export const PROGRAM = {
  id: 'main',
  days: [
    { dow: 1, name: 'Push', sub: 'Chest emphasis', color: 'push', slots: [S('bench', 3, 6, 10), S('incline', 3, 8, 10), S('mshp', 2, 8, 12), S('fly', 2, 12, 15), S('lat', 3, 12, 20), S('ohext', 2, 10, 15)] },
    { dow: 2, name: 'Pull', sub: 'Back emphasis', color: 'pull', slots: [S('pullup', 3, 5, 8), S('pulldown', 3, 8, 12), S('csrow', 3, 8, 12), S('cablerow', 2, 10, 15), S('rdelt', 3, 12, 20), S('inccurl', 3, 8, 12), S('hammer', 2, 10, 15)] },
    { dow: 3, name: 'Legs A', sub: 'Squat and quads', color: 'legs', slots: [S('squat', 3, 6, 10), S('legpress', 3, 10, 15), S('bss', 2, 8, 12), S('legcurl', 3, 10, 15), S('legext', 2, 10, 15), S('calf', 3, 10, 20), S('crunch', 3, 10, 15)] },
    { dow: 4, name: 'Rest', sub: 'Rest or easy cardio', color: 'rest', slots: [] },
    { dow: 5, name: 'Upper', sub: 'Chest, back, shoulders', color: 'upper', slots: [S('incline', 3, 6, 10), S('csrow', 3, 8, 12), S('pulldown', 2, 8, 12), S('shp', 3, 8, 12), S('lat', 3, 12, 20), S('fly', 2, 12, 15), S('preacher', 2, 8, 12, 'A'), S('pushdown', 2, 10, 15, 'A')] },
    { dow: 6, name: 'Legs B', sub: 'Hinge, legs and arms', color: 'legsb', slots: [S('rdl', 3, 8, 12), S('bss', 3, 8, 12), S('legpress', 2, 10, 15), S('legcurl', 3, 10, 15), S('calf', 3, 12, 20), S('ezcurl', 3, 8, 12, 'A'), S('cgb', 3, 6, 10, 'A')] },
    { dow: 0, name: 'Rest', sub: 'Full rest', color: 'rest', slots: [] },
  ],
};

export const DEFAULT_SETTINGS = {
  theme: 'system',
  goalKg: null, // blank until the user sets one
  heightCm: null,
  gyms: [{ id: 'g1', name: 'Main gym' }],
  gymId: 'g1',
  equip: {
    dumbbells: [2, 4, 5, 6, 7.5, 8, 10, 12, 12.5, 14, 15, 16, 17.5, 18, 20, 22, 22.5, 24, 25, 26, 27.5, 28, 30, 32, 32.5, 34, 35, 36, 37.5, 40],
    plates: [25, 20, 15, 10, 5, 2.5, 1.25],
    barKg: 20,
  },
  timerSound: true,
  timerVibrate: true,
  wakeLock: true,
  autoWarmup: false,
  deloadUntil: null,
  units: 'kg', // 'kg' | 'lb': loads are always stored in kg
};

// ---- starting history -------------------------------------------------------
// The public app starts empty. Import old logs or restore a backup from More.
export const seedSessions = () => [];
export const SEED_BODY = [];
