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
  X('hammer', 'Hammer curl', 'kg/DB', 'db', 2, 75, ['Biceps', 'Forearms']),
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
  X('wristcurl', 'Wrist curl', 'kg/DB', 'db', 1, 45, ['Forearms']),
  X('revwristcurl', 'Reverse wrist curl', 'kg/DB', 'db', 1, 45, ['Forearms']),
  X('farmer', "Farmer's carry (seconds as reps)", 'kg/DB', 'db', 2, 90, ['Forearms', 'Back']),
  X('neckcurl', 'Neck curl (plate)', 'kg', 'db', 1.25, 60, ['Neck']),
  X('neckext', 'Neck extension (plate)', 'kg', 'db', 1.25, 60, ['Neck']),
  X('pullover', 'Cable pullover', 'L', 'cable', 1, 75, ['Back']),
  X('hanglegraise', 'Hanging leg raise', 'bw', 'bw', 2.5, 60, ['Abs']),
  X('bbsquat', 'Barbell squat', 'kg', 'barbell', 2.5, 180, ['Quads', 'Glutes']),
  X('machinedip', 'Machine dip', 'kg', 'machine', 5, 90, ['Triceps', 'Chest']),
  X('widepulldown', 'Wide-grip lat pulldown', 'kg', 'machine', 2.5, 120, ['Back', 'Biceps']),
  X('closerow', 'Close-grip cable row', 'kg', 'cable', 2.5, 90, ['Back', 'Biceps']),
  X('onearmcablerow', 'Single-arm cable row', 'kg', 'cable', 2.5, 75, ['Back']),
  X('dbshrug', 'DB shrug', 'kg/DB', 'db', 2, 60, ['Back', 'Neck']),
  X('cheatcurl', 'Cheat curl', 'kg/DB', 'db', 2, 75, ['Biceps']),
  // Barbell staples, Olympic lifts and common glute work, so experienced lifters' plans and logs match
  X('bbbench', 'Barbell bench press', 'kg', 'barbell', 2.5, 180, ['Chest', 'Front delts', 'Triceps']),
  X('deadlift', 'Deadlift', 'kg', 'barbell', 5, 180, ['Hamstrings', 'Glutes', 'Back', 'Forearms'], { caution: 'Brace and keep the bar close; stop the set if your lower back rounds.' }),
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
  // Expanded library: common variants for every muscle, home and band options, kettlebell basics
  // Chest
  X('declbench', 'Decline bench press', 'kg', 'barbell', 2.5, 150, ['Chest', 'Triceps', 'Front delts']),
  X('bbincline', 'Incline barbell bench press', 'kg', 'barbell', 2.5, 150, ['Chest', 'Front delts', 'Triceps']),
  X('smithbench', 'Smith bench press', 'kg', 'smith', 2.5, 150, ['Chest', 'Front delts', 'Triceps']),
  X('smithincline', 'Smith incline press', 'kg', 'smith', 2.5, 150, ['Chest', 'Front delts', 'Triceps']),
  X('mincline', 'Incline machine press', 'kg', 'machine', 5, 120, ['Chest', 'Front delts', 'Triceps']),
  X('floorpress', 'Dumbbell floor press', 'kg/DB', 'db', 2, 90, ['Chest', 'Triceps']),
  X('inclinefly', 'Incline dumbbell fly', 'kg/DB', 'db', 2, 75, ['Chest', 'Front delts']),
  X('lowhighfly', 'Low-to-high cable fly', 'L', 'cable', 1, 60, ['Chest', 'Front delts']),
  X('dbpullover', 'Dumbbell pullover', 'kg', 'db', 2, 75, ['Chest', 'Back', 'Triceps']),
  X('dip', 'Dip', 'bw', 'bw', 2.5, 120, ['Chest', 'Triceps', 'Front delts']),
  X('incpush', 'Incline push-up', 'bw', 'bw', 2.5, 60, ['Chest', 'Front delts', 'Triceps']),
  // Back
  X('tbarrow', 'T-bar row', 'kg', 'barbell', 2.5, 120, ['Back', 'Rear delts', 'Biceps']),
  X('sealrow', 'Seal row', 'kg', 'barbell', 2.5, 120, ['Back', 'Rear delts', 'Biceps']),
  X('meadows', 'Meadows row', 'kg', 'barbell', 2.5, 90, ['Back', 'Rear delts', 'Biceps']),
  X('incdbrow', 'Incline dumbbell row', 'kg/DB', 'db', 2, 90, ['Back', 'Rear delts', 'Biceps']),
  X('closepulldown', 'Close-grip pulldown', 'kg', 'machine', 2.5, 120, ['Back', 'Biceps']),
  X('rackpull', 'Rack pull', 'kg', 'barbell', 5, 150, ['Back', 'Glutes', 'Hamstrings', 'Forearms'], { caution: 'Brace and keep the bar close; stop the set if your lower back rounds.' }),
  X('backext', 'Back extension', 'bw', 'bw', 2.5, 75, ['Back', 'Glutes', 'Hamstrings']),
  X('goodmorning', 'Good morning', 'kg', 'barbell', 2.5, 120, ['Hamstrings', 'Back', 'Glutes'], { caution: 'Start light and keep a neutral back; stop the set if your lower back rounds.' }),
  X('bandrow', 'Band row', 'L', 'bw', 1, 60, ['Back', 'Biceps']),
  // Shoulders
  X('arnold', 'Arnold press', 'kg/DB', 'db', 2, 120, ['Front delts', 'Side delts', 'Triceps']),
  X('smithohp', 'Smith shoulder press', 'kg', 'smith', 2.5, 120, ['Front delts', 'Triceps']),
  X('landmine', 'Landmine press', 'kg', 'barbell', 2.5, 90, ['Front delts', 'Chest', 'Triceps']),
  X('hspu', 'Handstand push-up', 'bw', 'bw', 2.5, 120, ['Front delts', 'Triceps']),
  X('frontraise', 'Dumbbell front raise', 'kg/DB', 'db', 1, 60, ['Front delts']),
  X('mlat', 'Machine lateral raise', 'kg', 'machine', 2.5, 60, ['Side delts']),
  X('uprow', 'Upright row', 'kg', 'barbell', 2.5, 90, ['Side delts', 'Back']),
  X('yraise', 'Cable Y-raise', 'L', 'cable', 1, 60, ['Side delts', 'Rear delts']),
  X('luraise', 'Lu raise', 'kg/DB', 'db', 1, 60, ['Side delts', 'Front delts']),
  X('revcablefly', 'Reverse cable fly', 'L', 'cable', 1, 60, ['Rear delts']),
  X('pullapart', 'Band pull-apart', 'L', 'bw', 1, 45, ['Rear delts', 'Back']),
  X('bandfacepull', 'Band face pull', 'L', 'bw', 1, 45, ['Rear delts', 'Back']),
  // Biceps
  X('bbcurl', 'Barbell curl', 'kg', 'barbell', 2.5, 75, ['Biceps']),
  X('cablecurl', 'Cable curl', 'L', 'cable', 1, 60, ['Biceps']),
  X('bayesian', 'Bayesian cable curl', 'L', 'cable', 1, 60, ['Biceps']),
  X('conccurl', 'Concentration curl', 'kg/DB', 'db', 1, 60, ['Biceps']),
  X('spidercurl', 'Spider curl', 'kg/DB', 'db', 1, 60, ['Biceps']),
  X('zottman', 'Zottman curl', 'kg/DB', 'db', 1, 60, ['Biceps', 'Forearms']),
  X('revcurl', 'Reverse curl', 'kg', 'barbell', 2.5, 60, ['Forearms', 'Biceps']),
  // Triceps
  X('cgbench', 'Close-grip bench press', 'kg', 'barbell', 2.5, 120, ['Triceps', 'Chest', 'Front delts']),
  X('jmpress', 'JM press', 'kg', 'barbell', 2.5, 90, ['Triceps', 'Chest']),
  X('kickback', 'Dumbbell triceps kickback', 'kg/DB', 'db', 1, 60, ['Triceps']),
  X('cablekickback', 'Cable triceps kickback', 'L', 'cable', 1, 60, ['Triceps']),
  X('cgpush', 'Close-grip push-up', 'bw', 'bw', 2.5, 75, ['Triceps', 'Chest', 'Front delts']),
  X('diamond', 'Diamond push-up', 'bw', 'bw', 2.5, 75, ['Triceps', 'Chest', 'Front delts']),
  // Quads and glutes
  X('sumo', 'Sumo deadlift', 'kg', 'barbell', 5, 180, ['Glutes', 'Quads', 'Hamstrings', 'Back'], { caution: 'Brace and keep the bar close; stop the set if your lower back rounds.' }),
  X('boxsquat', 'Box squat', 'kg', 'barbell', 2.5, 180, ['Quads', 'Glutes', 'Hamstrings']),
  X('pausesquat', 'Pause squat', 'kg', 'barbell', 2.5, 180, ['Quads', 'Glutes'], { caution: 'Only progress if depth and control match last time.' }),
  X('smithsplit', 'Smith split squat', 'kg', 'smith', 2.5, 90, ['Quads', 'Glutes']),
  X('bblunge', 'Barbell lunge', 'kg', 'barbell', 2.5, 90, ['Quads', 'Glutes']),
  X('dbrevlunge', 'Dumbbell reverse lunge', 'kg/DB', 'db', 2, 90, ['Quads', 'Glutes']),
  X('stepup', 'Dumbbell step-up', 'kg/DB', 'db', 2, 90, ['Quads', 'Glutes']),
  X('pistol', 'Pistol squat', 'bw', 'bw', 2.5, 90, ['Quads', 'Glutes']),
  X('cossack', 'Cossack squat', 'bw', 'bw', 2.5, 75, ['Quads', 'Glutes']),
  X('sissy', 'Sissy squat', 'bw', 'bw', 2.5, 75, ['Quads']),
  X('sled', 'Sled push', 'kg', 'machine', 10, 120, ['Quads', 'Glutes', 'Calves']),
  X('hipadd', 'Hip adduction machine', 'kg', 'machine', 5, 60, ['Quads']),
  X('slhipthrust', 'Single-leg hip thrust', 'bw', 'bw', 2.5, 60, ['Glutes', 'Hamstrings']),
  X('pullthrough', 'Cable pull-through', 'L', 'cable', 1, 75, ['Glutes', 'Hamstrings']),
  // Hamstrings
  X('seatcurl', 'Seated leg curl', 'kg', 'machine', 5, 90, ['Hamstrings']),
  X('ghr', 'Glute-ham raise', 'bw', 'bw', 2.5, 120, ['Hamstrings', 'Glutes']),
  X('slrdl', 'Single-leg Romanian deadlift', 'kg/DB', 'db', 2, 90, ['Hamstrings', 'Glutes']),
  // Calves
  X('seatcalf', 'Seated calf raise', 'kg', 'machine', 5, 60, ['Calves']),
  X('donkeycalf', 'Donkey calf raise', 'kg', 'machine', 5, 60, ['Calves']),
  X('lpcalf', 'Leg press calf raise', 'kg', 'machine', 10, 60, ['Calves']),
  X('tibraise', 'Tibialis raise', 'bw', 'bw', 2.5, 45, ['Calves']),
  // Abs and core
  X('floorcrunch', 'Crunch', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('situp', 'Sit-up', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('abmachine', 'Ab crunch machine', 'kg', 'machine', 5, 60, ['Abs']),
  X('lyinglegraise', 'Lying leg raise', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('vup', 'V-up', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('deadbug', 'Dead bug', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('birddog', 'Bird dog', 'bw', 'bw', 2.5, 45, ['Abs', 'Back', 'Glutes']),
  X('abwheel', 'Ab wheel rollout', 'bw', 'bw', 2.5, 60, ['Abs']),
  X('sideplank', 'Side plank (seconds as reps)', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('hollow', 'Hollow hold (seconds as reps)', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('russian', 'Russian twist', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('climber', 'Mountain climber', 'bw', 'bw', 2.5, 45, ['Abs']),
  X('pallof', 'Pallof press', 'L', 'cable', 1, 45, ['Abs']),
  X('woodchop', 'Cable woodchop', 'L', 'cable', 1, 60, ['Abs']),
  // Neck, traps and grip
  X('necksideraise', 'Neck side raise (plate)', 'kg', 'db', 1.25, 60, ['Neck']),
  X('bbshrug', 'Barbell shrug', 'kg', 'barbell', 5, 60, ['Back', 'Neck', 'Forearms']),
  X('plateshrug', 'Plate shrug', 'kg', 'db', 2.5, 60, ['Back', 'Neck', 'Forearms']),
  X('suitcase', 'Suitcase carry (seconds as reps)', 'kg/DB', 'db', 2, 90, ['Forearms', 'Abs']),
  X('platepinch', 'Plate pinch (seconds as reps)', 'kg', 'db', 2.5, 60, ['Forearms']),
  X('deadhang', 'Dead hang (seconds as reps)', 'bw', 'bw', 2.5, 60, ['Forearms', 'Back']),
  // Kettlebell and full body
  X('kbswing', 'Kettlebell swing', 'kg', 'db', 4, 75, ['Glutes', 'Hamstrings', 'Back']),
  X('kbpress', 'Kettlebell clean and press', 'kg', 'db', 4, 90, ['Front delts', 'Triceps', 'Glutes']),
  X('tgu', 'Turkish get-up', 'kg', 'db', 4, 90, ['Abs', 'Front delts', 'Glutes'], { caution: 'Learn it with no weight first; keep your eyes on the weight.' }),
  X('burpee', 'Burpee', 'bw', 'bw', 2.5, 60, ['Quads', 'Chest', 'Abs']),
];

// Other names people search for, so "bicep curl" finds the DB curl and "OHP" the overhead press.
const SYNONYMS = {
  dbcurl: 'bicep biceps curl dumbbell', inccurl: 'bicep biceps', hammer: 'bicep biceps', ezcurl: 'bicep biceps barbell curl',
  bench: 'dumbbell chest', bbbench: 'bench bb flat competition chest', incline: 'dumbbell chest', deadlift: 'dl conventional',
  trapdl: 'hex bar', ohp: 'ohp military press shoulder press standing', frontsquat: 'squat', bbsquat: 'back squat', squat: 'smith',
  bbrow: 'bent over row pendlay', dbrow: 'dumbbell row', pulldown: 'lat', widepulldown: 'lat', lat: 'side delt shoulder', dblat: 'side delt shoulder',
  pushdown: 'tricep triceps', ohext: 'tricep triceps', dbohext: 'tricep triceps', skull: 'tricep triceps lying extension', dbskull: 'tricep triceps skull crusher',
  cleanjerk: 'olympic weightlifting c&j', snatch: 'olympic weightlifting', powerclean: 'olympic clean', pushpress: 'olympic shoulder',
  nordic: 'hamstring bodyweight', hipabd: 'abductor glute outer thigh', glutekick: 'kickback butt', frogpump: 'glute butt', hipthrust: 'glute butt',
  glutebridge: 'butt', rdl: 'romanian stiff leg', dbrdl: 'romanian', plank: 'core timed hold', crunch: 'abs core', hanglegraise: 'abs core',
  legcurl: 'hamstring', lyingcurl: 'hamstring', legext: 'quad quads', calf: 'calves', pullup: 'chin bodyweight', pushup: 'press up',
  pullover: 'straight arm pulldown straight-arm lat pushdown', ohext: 'rope overhead extension french press', pushdown: 'bar pushdown v-bar straight bar pressdown',
  // expanded library
  declbench: 'decline bench bb lower chest', bbincline: 'incline bench bb upper chest',   smithbench: 'smith machine bench chest', smithincline: 'smith machine incline bench upper chest', mincline: 'incline chest press machine upper chest',
  floorpress: 'db floor press dumbbell chest home', inclinefly: 'incline db fly flye dumbbell upper chest', lowhighfly: 'low to high cable crossover upper chest flye',
  dbpullover: 'db pullover dumbbell chest lats', dip: 'dips parallel bar chest dip tricep dip weighted',
  incpush: 'incline push up press up easy beginner',   tbarrow: 't bar row tbar landmine row', sealrow: 'seal row prone bench row chest supported barbell', meadows: 'meadows row landmine single arm row',
  incdbrow: 'incline db row chest supported dumbbell row prone', closepulldown: 'close grip v bar neutral grip pulldown lat',
  rackpull: 'rack pull block pull partial deadlift', backext: 'back extension hyperextension hyper roman chair lower back',
  goodmorning: 'good morning barbell hinge hamstring lower back', bandrow: 'resistance band row seated band row home',
  arnold: 'arnold press db dumbbell shoulder', smithohp: 'smith machine shoulder press overhead military', landmine: 'landmine press shoulder angled press',
  hspu: 'handstand push up hspu wall shoulder', frontraise: 'front raise db dumbbell shoulder front delt',   mlat: 'machine lateral raise side delt shoulder', uprow: 'upright row barbell shoulder traps side delt',   yraise: 'y raise cable y raise lower trap shoulder', luraise: 'lu raise lateral raise db shoulder', revcablefly: 'reverse cable fly rear delt cable fly crossover shoulder',
  pullapart: 'band pull apart resistance band rear delt', bandfacepull: 'band face pull resistance band rear delt', bbcurl: 'barbell curl bb straight bar bicep biceps',
  cablecurl: 'cable curl bicep biceps', bayesian: 'bayesian curl behind body cable curl bicep biceps', conccurl: 'concentration curl bicep biceps db',
  spidercurl: 'spider curl bicep biceps prone', zottman: 'zottman curl bicep forearm',   revcurl: 'reverse curl reverse grip curl forearm brachioradialis',   cgbench: 'close grip bench press cgbp bb tricep triceps', jmpress: 'jm press tricep triceps', kickback: 'tricep triceps kickback db dumbbell',
  cablekickback: 'cable kickback tricep triceps', cgpush: 'close grip push up narrow press up tricep triceps', diamond: 'diamond push up triangle push up tricep triceps',
  sumo: 'sumo deadlift sumo dl wide stance', boxsquat: 'box squat barbell', pausesquat: 'pause squat paused squat barbell', smithsplit: 'smith machine split squat lunge',
  bblunge: 'barbell lunge bb walking lunge', dbrevlunge: 'db reverse lunge dumbbell backward lunge', stepup: 'step up db dumbbell box step up',
  pistol: 'pistol squat single leg squat one leg', cossack: 'cossack squat side squat lateral', sissy: 'sissy squat quad quads',   sled: 'sled push prowler', hipadd: 'hip adduction adductor inner thigh machine',
  slhipthrust: 'single leg hip thrust one leg glute bridge butt', pullthrough: 'cable pull through glute butt hinge', seatcurl: 'seated leg curl hamstring',
  ghr: 'glute ham raise ghd hamstring', slrdl: 'single leg rdl romanian deadlift one leg db', seatcalf: 'seated calf raise calves soleus',
  donkeycalf: 'donkey calf raise calves', lpcalf: 'leg press calf raise calf press calves',   tibraise: 'tibialis raise tib raise shin', floorcrunch: 'crunch crunches abs core floor', situp: 'sit up situps abs core',   abmachine: 'ab crunch machine abs core', lyinglegraise: 'lying leg raise abs core', vup: 'v up v-ups jackknife abs core', deadbug: 'dead bug abs core',
  birddog: 'bird dog core back', abwheel: 'ab wheel rollout ab roller abs core', sideplank: 'side plank obliques core timed hold', hollow: 'hollow hold hollow body abs core timed',
  russian: 'russian twist obliques abs core', climber: 'mountain climber mountain climbers abs core', pallof: 'pallof press anti rotation cable core obliques',
  woodchop: 'cable woodchop wood chop obliques core', necksideraise: 'neck side raise lateral neck flexion plate', bbshrug: 'barbell shrug bb traps shrugs',
  plateshrug: 'plate shrug traps shrugs', suitcase: 'suitcase carry one arm farmer walk core grip', platepinch: 'plate pinch grip hold', deadhang: 'dead hang bar hang grip timed',
  kbswing: 'kettlebell swing kb swing russian swing glute', kbpress: 'kettlebell clean and press kb clean press shoulder',
  tgu: 'turkish get up tgu kettlebell kb', burpee: 'burpee burpees full body home',
};
/** Lower-case text an exercise search matches against: name, muscles and other names for it. */
// The chosen language adds its own names, so search works in Malay, Chinese and Japanese too (set by i18n.js).
let localNames = () => '';
export const setSearchLocal = f => { localNames = f; };
export const searchText = x => `${x.name} ${(x.muscles || []).join(' ')} ${SYNONYMS[x.id] || ''} ${localNames(x)}`.toLowerCase();
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

// ---- ready-made plans ---------------------------------------------------------------
const REST = (dow, sub = 'Rest or easy cardio') => ({ dow, name: 'Rest', sub, color: 'rest', slots: [] });
/** A week from {dow: day}; every other day is a rest day. */
const week = days => ({ id: 'main', days: [1, 2, 3, 4, 5, 6, 0].map(d => days[d] || REST(d)) });
export const TEMPLATES = [
  {
    id: 'fb3', name: 'Full body, 3 days', days: 3, level: 'Beginner friendly', gear: 'Full gym',
    about: 'Every muscle three times a week in short sessions. The best start for most people.',
    program: week({
      1: { dow: 1, name: 'Full body A', sub: 'Squat and bench', color: 'push', slots: [S('bbsquat', 3, 5, 8), S('bbbench', 3, 6, 10), S('pulldown', 3, 8, 12), S('dblat', 2, 12, 20), S('dbcurl', 2, 10, 15)] },
      3: { dow: 3, name: 'Full body B', sub: 'Deadlift and press', color: 'pull', slots: [S('deadlift', 3, 4, 6), S('ohp', 3, 6, 10), S('csrow', 3, 8, 12), S('legcurl', 2, 10, 15), S('pushdown', 2, 10, 15)] },
      5: { dow: 5, name: 'Full body C', sub: 'Legs and incline', color: 'legs', slots: [S('legpress', 3, 10, 15), S('incline', 3, 8, 12), S('dbrow', 3, 8, 12), S('calf', 3, 10, 20), S('crunch', 2, 10, 15)] },
    }),
  },
  {
    id: 'ul4', name: 'Upper / lower, 4 days', days: 4, level: 'Some experience', gear: 'Full gym',
    about: 'Upper and lower body twice a week each. More sets per muscle than full body, with rest days to recover.',
    program: week({
      1: { dow: 1, name: 'Upper A', sub: 'Bench and row', color: 'upper', slots: [S('bbbench', 3, 6, 10), S('bbrow', 3, 8, 10), S('shp', 3, 8, 12), S('pulldown', 3, 8, 12), S('lat', 3, 12, 20), S('pushdown', 2, 10, 15)] },
      2: { dow: 2, name: 'Lower A', sub: 'Squat', color: 'legs', slots: [S('bbsquat', 3, 5, 8), S('rdl', 3, 8, 12), S('legpress', 2, 10, 15), S('legcurl', 3, 10, 15), S('calf', 3, 10, 20)] },
      4: { dow: 4, name: 'Upper B', sub: 'Press and pull-ups', color: 'push', slots: [S('incline', 3, 8, 12), S('csrow', 3, 8, 12), S('ohp', 3, 6, 10), S('pullup', 3, 5, 8), S('dbcurl', 3, 10, 12), S('ohext', 2, 10, 15)] },
      5: { dow: 5, name: 'Lower B', sub: 'Deadlift', color: 'legsb', slots: [S('deadlift', 3, 4, 6), S('bss', 3, 8, 12), S('legext', 2, 10, 15), S('lyingcurl', 3, 10, 15), S('crunch', 3, 10, 15)] },
    }),
  },
  {
    id: 'ppl6', name: 'Push, pull, legs, 6 days', days: 6, level: 'Experienced', gear: 'Full gym',
    about: 'Each muscle twice a week with lots of volume. Needs good sleep and 6 days a week.',
    program: (() => {
      const push = dow => ({ dow, name: 'Push', sub: 'Chest, shoulders, triceps', color: 'push', slots: [S('bbbench', 3, 6, 10), S('incline', 3, 8, 12), S('shp', 2, 8, 12), S('lat', 3, 12, 20), S('pushdown', 3, 10, 15)] });
      const pull = dow => ({ dow, name: 'Pull', sub: 'Back, rear delts, biceps', color: 'pull', slots: [S('pullup', 3, 5, 8), S('bbrow', 3, 8, 10), S('pulldown', 2, 8, 12), S('facepull', 2, 12, 20), S('dbcurl', 3, 10, 12)] });
      const legs = dow => ({ dow, name: 'Legs', sub: 'Quads, hamstrings, calves', color: 'legs', slots: [S('bbsquat', 3, 5, 8), S('rdl', 3, 8, 12), S('legpress', 2, 10, 15), S('legcurl', 3, 10, 15), S('calf', 3, 10, 20)] });
      return week({ 1: push(1), 2: pull(2), 3: legs(3), 4: push(4), 5: pull(5), 6: legs(6) });
    })(),
  },
  {
    id: 'str3', name: 'Strength 5×5, 3 days', days: 3, level: 'Beginner friendly', gear: 'Barbell and rack',
    about: 'Few lifts, heavy and simple: sets of 5 on the big barbell lifts, adding weight whenever all sets are done.',
    program: week({
      1: { dow: 1, name: 'Strength A', sub: 'Squat, bench, row', color: 'push', slots: [S('bbsquat', 5, 5, 5), S('bbbench', 5, 5, 5), S('bbrow', 5, 5, 5)] },
      3: { dow: 3, name: 'Strength B', sub: 'Squat, press, deadlift', color: 'pull', slots: [S('bbsquat', 5, 5, 5), S('ohp', 5, 5, 5), S('deadlift', 1, 5, 5)] },
      5: { dow: 5, name: 'Strength A', sub: 'Squat, bench, row', color: 'push', slots: [S('bbsquat', 5, 5, 5), S('bbbench', 5, 5, 5), S('bbrow', 5, 5, 5)] },
    }),
  },
  {
    id: 'db3', name: 'Dumbbells at home, 3 days', days: 3, level: 'Any level', gear: 'Dumbbells and a bench',
    about: 'Full body with just dumbbells, a bench and the floor.',
    program: week({
      1: { dow: 1, name: 'Home A', sub: 'Full body', color: 'push', slots: [S('goblet', 3, 8, 12), S('bench', 3, 8, 12), S('dbrow', 3, 8, 12), S('dblat', 2, 12, 20), S('hammer', 2, 10, 15)] },
      3: { dow: 3, name: 'Home B', sub: 'Full body', color: 'pull', slots: [S('dbrdl', 3, 8, 12), S('shp', 3, 8, 12), S('bss', 3, 8, 12), S('pushup', 2, 8, 15), S('dbcurl', 2, 10, 15)] },
      5: { dow: 5, name: 'Home C', sub: 'Full body', color: 'legs', slots: [S('lunge', 3, 10, 12), S('incline', 3, 8, 12), S('dbrow', 3, 8, 12), S('dbskull', 2, 10, 15), S('plank', 3, 20, 45)] },
    }),
  },
  {
    id: 'bw3', name: 'Home, no equipment, 3 days', days: 3, level: 'Beginner', gear: 'Floor and a chair',
    about: 'Full body with nothing but your body weight, about 25 minutes. Quiet enough for a small flat.',
    program: week({
      1: { dow: 1, name: 'Body A', sub: 'Full body', color: 'push', slots: [S('bwsquat', 3, 10, 20), S('pushup', 3, 5, 15), S('invrow', 3, 6, 12), S('glutebridge', 3, 10, 20), S('plank', 2, 20, 45)] },
      3: { dow: 3, name: 'Body B', sub: 'Full body', color: 'pull', slots: [S('bwsplit', 3, 8, 15), S('pikepush', 3, 5, 12), S('slidecurl', 3, 6, 12), S('bwcalf', 2, 10, 20), S('revcrunch', 2, 8, 15)] },
      5: { dow: 5, name: 'Body C', sub: 'Full body', color: 'legs', slots: [S('bwlunge', 3, 8, 15), S('declpush', 3, 5, 12), S('ytraise', 2, 8, 15), S('glutebridge', 3, 12, 20), S('benchdip', 2, 6, 15)] },
    }),
  },
  {
    id: 'easy3', name: 'Easy on the joints, 3 days', days: 3, level: 'Any age, 50+ friendly', gear: 'Machines and dumbbells',
    about: 'Seated and supported machines, no barbell squats or deadlifts, higher reps with lighter weights. Good for strength, balance and bone health.',
    program: week({
      1: { dow: 1, name: 'Easy A', sub: 'Full body', color: 'push', slots: [S('legpress', 2, 10, 15), S('mchest', 2, 10, 15), S('cablerow', 2, 10, 15), S('glutebridge', 2, 10, 15), S('calf', 2, 12, 15)] },
      3: { dow: 3, name: 'Easy B', sub: 'Full body', color: 'pull', slots: [S('goblet', 2, 8, 12), S('pulldown', 2, 10, 15), S('mshp', 2, 10, 15), S('legcurl', 2, 10, 15), S('farmer', 2, 20, 40)] },
      5: { dow: 5, name: 'Easy C', sub: 'Full body', color: 'legs', slots: [S('legext', 2, 10, 15), S('incline', 2, 10, 15), S('facepull', 2, 12, 15), S('hipabd', 2, 12, 15), S('plank', 2, 15, 30)] },
    }),
  },
];

/** Library exercises whose muscles changed in an update: [old, new]. Applied to installs whose copy still has the old list. */
export const MUSCLE_UPDATES = {
  wristcurl: [['Biceps'], ['Forearms']], revwristcurl: [['Biceps'], ['Forearms']], hammer: [['Biceps'], ['Biceps', 'Forearms']],
  dbshrug: [['Back'], ['Back', 'Neck']], deadlift: [['Hamstrings', 'Glutes', 'Back'], ['Hamstrings', 'Glutes', 'Back', 'Forearms']],
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
  autoWarmup: 'barbell', // false | 'barbell' | true
  deloadUntil: null,
  units: 'kg', // 'kg' | 'lb': loads are always stored in kg
};
