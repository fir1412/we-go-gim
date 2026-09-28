// Which of the atlas's 110 muscles each library exercise works: `main` does most of the work, `help` assists.
// Keys are the atlas's own muscle keys (anatomy/full-body-map.json). Custom exercises fall back to their
// app muscle groups through BY_GROUP.

const CHEST = ['pectoralis_major_clavicular', 'pectoralis_major_sternocostal', 'pectoralis_major_abdominal'];
const UPCHEST = ['pectoralis_major_clavicular', 'pectoralis_major_sternocostal'];
const FD = ['deltoid_anterior'], SD = ['deltoid_lateral'], RD = ['deltoid_posterior'];
const TRI = ['triceps_long', 'triceps_lateral', 'triceps_medial'];
const BI = ['biceps_brachii_long', 'biceps_brachii_short'];
const ELBOWFLEX = [...BI, 'brachialis', 'brachioradialis_muscle'];
const LATS = ['latissimus_dorsi', 'teres_major'];
const MIDBACK = ['trapezius_middle', 'trapezius_lower', 'rhomboid_major', 'rhomboid_minor'];
const UPTRAP = ['trapezius_upper', 'levator_scapulae'];
const ERECT = ['iliocostalis_lumborum', 'iliocostalis_thoracis', 'longissimus_thoracis', 'spinalis_thoracis', 'multifidus_lumborum'];
const QUADS = ['rectus_femoris', 'vastus_lateralis', 'vastus_medialis', 'vastus_intermedius'];
const HAMS = ['biceps_femoris_long', 'biceps_femoris_short', 'semitendinosus', 'semimembranosus'];
const GMAX = ['gluteus_maximus'];
const GSIDE = ['gluteus_medius', 'gluteus_minimus', 'tensor_fasciae_latae'];
const ADD = ['adductor_magnus', 'adductor_longus', 'adductor_brevis', 'gracilis', 'pectineus'];
const CALF = ['gastrocnemius_lateral', 'gastrocnemius_medial', 'soleus', 'plantaris'];
const GASTRO = ['gastrocnemius_lateral', 'gastrocnemius_medial'];
const ABS = ['rectus_abdominis'];
const OBL = ['external_oblique', 'internal_oblique', 'transversus_abdominis'];
const HIPFLEX = ['iliacus', 'psoas_major'];
const WRISTFLEX = ['flexor_carpi_radialis', 'palmaris_longus_muscle', 'humeral_head_of_flexor_carpi_ulnaris', 'ulnar_head_of_flexor_carpi_ulnaris',
  'humero_ulnar_head_of_flexor_digitorum_superficialis', 'radial_head_of_flexor_digitorum_superficialis', 'flexor_digitorum_profundus', 'flexor_pollicis_longus'];
const WRISTEXT = ['extensor_digitorum', 'ulnar_head_of_extensor_carpi_ulnaris', 'humeral_head_of_extensor_carpi_ulnaris',
  'extensor_carpi_radialis_longus', 'extensor_carpi_radialis_brevis', 'extensor_digiti_minimi'];
const NECKFRONT = ['sternocleidomastoid', 'scalenus_anterior', 'scalenus_medius', 'scalenus_posterior'];
const NECKBACK = ['splenius_capitis', 'splenius_colli', 'trapezius_upper', 'levator_scapulae'];
const SERR = ['serratus_anterior'];
const ROTATORS = ['piriformis', 'obturator_internus', 'gemellus_superior', 'gemellus_inferior'];

const E = (main, help = []) => ({ main, help });
const PRESS_FLAT = E(CHEST, [...FD, ...TRI, ...SERR]);
const PRESS_INC = E(UPCHEST, [...FD, ...TRI, ...SERR]);
const PRESS_OH = E([...FD, ...SD], [...TRI, ...UPTRAP, ...SERR]);
const FLY = E(CHEST, [...FD, ...BI]);
const OHTRI = E(TRI, ['anconeus_muscle']);
const VPULL = E(LATS, [...ELBOWFLEX, ...MIDBACK, 'deltoid_posterior', 'pectoralis_major_abdominal']);
const ROW = E([...LATS, ...MIDBACK], [...RD, ...ELBOWFLEX, ...ERECT, 'infraspinatus', 'teres_minor']);
const REAR = E(RD, [...MIDBACK, 'infraspinatus', 'teres_minor']);
const CURL = E(BI, ['brachialis', 'brachioradialis_muscle', ...WRISTFLEX]);
const HAMMER = E(['brachialis', 'brachioradialis_muscle'], [...BI, 'extensor_carpi_radialis_longus']);
const SQUAT = E([...QUADS, ...GMAX], [...ADD, ...ERECT, ...CALF, ...ABS, ...OBL]);
const MSQUAT = E([...QUADS, ...GMAX], [...ADD, ...CALF]);
const LUNGE = E([...QUADS, ...GMAX], [...GSIDE, ...ADD, ...HAMS, ...CALF]);
const HINGE = E([...HAMS, ...GMAX], [...ERECT, 'adductor_magnus', ...UPTRAP, ...WRISTFLEX]);
const DEAD = E([...GMAX, ...HAMS, ...ERECT], [...QUADS, 'adductor_magnus', ...LATS, ...UPTRAP, ...MIDBACK, ...WRISTFLEX]);
const LEGCURL = E(HAMS, [...GASTRO, 'popliteus', 'gracilis', 'sartorius']);
const BRIDGE = E(GMAX, [...HAMS, ...GSIDE, 'adductor_magnus']);
const CALFR = E(CALF, ['fibularis_longus', 'fibularis_brevis', 'tibialis_posterior', 'flexor_digitorum_longus', 'flexor_hallucis_longus']);
const LEGRAISE = E([...ABS, ...HIPFLEX], [...OBL, 'rectus_femoris', 'tensor_fasciae_latae', 'sartorius']);
const OLY = E([...GMAX, ...HAMS, ...QUADS, ...UPTRAP], [...ERECT, ...FD, ...SD, ...TRI, ...CALF, ...MIDBACK, ...WRISTFLEX]);
const LOWCHEST = ['pectoralis_major_sternocostal', 'pectoralis_major_abdominal'];
const PRESS_DEC = E(LOWCHEST, ['pectoralis_major_clavicular', ...FD, ...TRI, ...SERR]);
const FRONTR = E(FD, ['pectoralis_major_clavicular', ...SD, ...SERR, ...UPTRAP]);
const UPROW = E([...SD, 'trapezius_upper'], [...FD, 'supraspinatus', 'levator_scapulae', ...BI, 'brachialis', 'brachioradialis_muscle']);
const DIP = E([...TRI, 'pectoralis_major_abdominal', 'pectoralis_major_sternocostal'], [...FD, 'pectoralis_minor', ...SERR]);

export const EXERCISE_MUSCLES = {
  bench: PRESS_FLAT, incline: PRESS_INC, mchest: PRESS_FLAT, bbbench: PRESS_FLAT, cgb: E([...TRI, ...CHEST], FD),
  mshp: PRESS_OH, shp: PRESS_OH, ohp: E([...FD, ...SD], [...TRI, ...UPTRAP, ...SERR, ...ABS, ...OBL, ...GMAX]),
  pushpress: E([...FD, ...SD, ...TRI], [...QUADS, ...GMAX, ...UPTRAP, ...SERR]),
  fly: FLY, dbfly: FLY, pecdeck: FLY,
  lat: E(SD, [...UPTRAP, 'supraspinatus', 'deltoid_anterior']), dblat: E(SD, [...UPTRAP, 'supraspinatus', 'deltoid_anterior']),
  ohext: OHTRI, dbohext: OHTRI, pushdown: OHTRI, skull: OHTRI, dbskull: OHTRI,
  benchdip: E(TRI, [...FD, ...CHEST]), machinedip: DIP,
  pullup: VPULL, chinup: E([...LATS, ...BI], ['brachialis', 'brachioradialis_muscle', ...MIDBACK, 'pectoralis_major_abdominal']),
  pulldown: VPULL, widepulldown: VPULL,
  pullover: E(['latissimus_dorsi', 'teres_major', 'pectoralis_major_abdominal'], ['triceps_long', ...SERR, ...ABS]),
  csrow: ROW, cablerow: ROW, closerow: ROW, onearmcablerow: ROW, dbrow: ROW,
  bbrow: E([...LATS, ...MIDBACK], [...RD, ...ELBOWFLEX, ...ERECT, ...HAMS, ...GMAX]),
  invrow: E([...MIDBACK, ...LATS], [...RD, ...ELBOWFLEX, ...ABS, ...GMAX]),
  rdelt: REAR, dbreardelt: REAR, facepull: E([...RD, 'infraspinatus', 'teres_minor'], [...MIDBACK, ...UPTRAP]),
  ytraise: E(['trapezius_lower', 'trapezius_middle', ...RD], ['rhomboid_major', 'rhomboid_minor', 'infraspinatus', 'teres_minor', 'supraspinatus']),
  dbshrug: E(UPTRAP, ['trapezius_middle', 'rhomboid_major', 'rhomboid_minor', ...WRISTFLEX]),
  inccurl: CURL, ezcurl: CURL, dbcurl: CURL, preacher: E([...BI, 'brachialis'], ['brachioradialis_muscle']),
  cheatcurl: E(BI, ['brachialis', 'brachioradialis_muscle', ...FD, ...ERECT, ...GMAX]), hammer: HAMMER,
  wristcurl: E(WRISTFLEX), revwristcurl: E(WRISTEXT, ['brachioradialis_muscle']),
  farmer: E([...WRISTFLEX, ...UPTRAP], [...OBL, 'quadratus_lumborum', ...ERECT, ...GSIDE, ...CALF]),
  neckcurl: E(NECKFRONT), neckext: E(NECKBACK),
  squat: MSQUAT, bbsquat: SQUAT, frontsquat: E([...QUADS, ...GMAX], [...ERECT, ...ABS, ...OBL, ...ADD, 'trapezius_upper']),
  hacksquat: MSQUAT, legpress: MSQUAT, goblet: E([...QUADS, ...GMAX], [...ADD, ...ABS, ...ERECT]), bwsquat: E([...QUADS, ...GMAX], [...ADD, ...CALF]),
  bss: LUNGE, lunge: LUNGE, bwsplit: LUNGE, bwlunge: LUNGE,
  legext: E(QUADS), legcurl: LEGCURL, lyingcurl: LEGCURL,
  slidecurl: E(HAMS, [...GMAX, ...GASTRO]), nordic: E(HAMS, [...GASTRO, ...GMAX, 'gracilis', 'sartorius']),
  rdl: HINGE, dbrdl: HINGE, smithdl: DEAD, deadlift: DEAD,
  trapdl: E([...QUADS, ...GMAX, ...HAMS], [...ERECT, ...UPTRAP, 'adductor_magnus', ...WRISTFLEX]),
  hipthrust: BRIDGE, glutebridge: BRIDGE, frogpump: E(GMAX, [...GSIDE, ...ADD]),
  glutekick: E(GMAX, [...HAMS, 'gluteus_medius']), hipabd: E(GSIDE, ['gluteus_maximus', ...ROTATORS]),
  calf: CALFR, bwcalf: CALFR,
  crunch: E(ABS, OBL), revcrunch: E(ABS, [...OBL, ...HIPFLEX]), hlr: LEGRAISE, hanglegraise: LEGRAISE,
  plank: E([...ABS, ...OBL], [...SERR, ...FD, ...GMAX, 'rectus_femoris']),
  pushup: E(CHEST, [...FD, ...TRI, ...SERR, ...ABS]), declpush: E(UPCHEST, [...FD, ...TRI, ...SERR, ...ABS]),
  pikepush: E([...FD, ...SD], [...TRI, 'pectoralis_major_clavicular', ...SERR, ...UPTRAP]),
  snatch: OLY, cleanjerk: OLY, powerclean: E([...GMAX, ...HAMS, ...QUADS, ...UPTRAP], [...ERECT, ...CALF, ...MIDBACK, ...WRISTFLEX, ...BI]),
  // expanded library
  // chest
  declbench: PRESS_DEC, bbincline: PRESS_INC, smithincline: PRESS_INC, mincline: PRESS_INC, smithbench: PRESS_FLAT,
  floorpress: E(CHEST, [...TRI, ...FD]), inclinefly: E(UPCHEST, [...FD, ...BI]),
  lowhighfly: E(['pectoralis_major_clavicular'], ['pectoralis_major_sternocostal', ...FD, ...BI, ...SERR]),
  dbpullover: E([...CHEST, 'latissimus_dorsi'], ['teres_major', 'triceps_long', ...SERR, 'pectoralis_minor']),
  dip: E([...LOWCHEST, ...TRI], [...FD, 'pectoralis_minor', ...SERR, 'pectoralis_major_clavicular']),
  incpush: E(LOWCHEST, [...FD, ...TRI, ...SERR, ...ABS]),
  // back
  tbarrow: E([...LATS, ...MIDBACK], [...RD, ...ELBOWFLEX, ...ERECT, ...HAMS, ...GMAX]), sealrow: ROW, incdbrow: ROW,
  meadows: E([...LATS, ...MIDBACK], [...RD, ...ELBOWFLEX, ...ERECT, ...OBL, ...WRISTFLEX]),
  closepulldown: VPULL,
  rackpull: E([...ERECT, ...UPTRAP, ...GMAX], [...HAMS, ...LATS, ...MIDBACK, ...WRISTFLEX, 'adductor_magnus']),
  backext: E(ERECT, [...GMAX, ...HAMS, 'quadratus_lumborum', 'adductor_magnus']),
  goodmorning: E([...HAMS, ...ERECT], [...GMAX, 'adductor_magnus', 'quadratus_lumborum']),
  bandrow: E([...MIDBACK, ...LATS], [...RD, ...ELBOWFLEX, 'infraspinatus', 'teres_minor']),
  // shoulders
  arnold: E([...FD, ...SD], [...TRI, ...UPTRAP, ...SERR, 'pectoralis_major_clavicular']), smithohp: PRESS_OH,
  landmine: E([...FD, 'pectoralis_major_clavicular'], [...TRI, ...SD, ...SERR, ...UPTRAP, ...OBL]),
  hspu: E([...FD, ...SD, ...TRI], [...UPTRAP, 'pectoralis_major_clavicular', ...SERR, ...ABS]),
  frontraise: FRONTR,
  mlat: E(SD, [...UPTRAP, 'supraspinatus', 'deltoid_anterior']),
  uprow: UPROW,
  yraise: E([...SD, 'trapezius_lower'], [...RD, 'supraspinatus', 'trapezius_middle', 'infraspinatus']),
  luraise: E([...SD, ...FD], [...UPTRAP, 'supraspinatus', ...SERR]),
  revcablefly: REAR, pullapart: E([...RD, 'rhomboid_major', 'rhomboid_minor'], ['trapezius_middle', 'trapezius_lower', 'infraspinatus', 'teres_minor']),
  bandfacepull: E([...RD, 'infraspinatus', 'teres_minor'], [...MIDBACK, ...UPTRAP]),
  // arms
  bbcurl: CURL, cablecurl: CURL, bayesian: E(['biceps_brachii_long', 'biceps_brachii_short'], ['brachialis', 'brachioradialis_muscle', 'deltoid_anterior']),
  conccurl: E([...BI, 'brachialis'], ['brachioradialis_muscle', ...WRISTFLEX]), spidercurl: E([...BI, 'brachialis'], ['brachioradialis_muscle', ...WRISTFLEX]),
  zottman: E([...BI, 'brachialis', 'brachioradialis_muscle'], [...WRISTEXT, ...WRISTFLEX]),
  revcurl: E(['brachioradialis_muscle', 'brachialis'], [...BI, ...WRISTEXT]),
  cgbench: E([...TRI, ...CHEST], [...FD, ...SERR]), jmpress: E(TRI, ['anconeus_muscle', 'pectoralis_major_sternocostal', ...FD]),
  kickback: E(TRI, ['anconeus_muscle', ...RD]), cablekickback: E(TRI, ['anconeus_muscle', ...RD]),
  cgpush: E([...TRI, ...CHEST], [...FD, ...SERR, ...ABS]), diamond: E([...TRI, ...CHEST], [...FD, ...SERR, ...ABS]),
  // quads and glutes
  sumo: E([...GMAX, ...ADD, ...QUADS], [...HAMS, ...ERECT, ...UPTRAP, ...LATS, ...WRISTFLEX]),
  boxsquat: E([...QUADS, ...GMAX], [...HAMS, ...ADD, ...ERECT, ...ABS, ...OBL]), pausesquat: SQUAT,
  smithsplit: LUNGE, bblunge: LUNGE, dbrevlunge: LUNGE, stepup: LUNGE,
  pistol: E([...QUADS, ...GMAX], [...GSIDE, ...ADD, ...CALF, ...ABS, ...HIPFLEX]),
  cossack: E([...QUADS, ...GMAX, ...ADD], [...HAMS, ...GSIDE, ...CALF]),
  sissy: E(QUADS, [...ABS, ...HIPFLEX, ...CALF]),
  sled: E([...QUADS, ...GMAX], [...CALF, ...HAMS, ...ABS, ...TRI, ...FD]),
  hipadd: E(ADD, ['gluteus_maximus', 'obturator_externus']),
  slhipthrust: E(GMAX, [...HAMS, ...GSIDE, 'adductor_magnus', ...OBL]),
  pullthrough: E([...GMAX, ...HAMS], [...ERECT, 'adductor_magnus', ...WRISTFLEX]),
  // hamstrings
  seatcurl: LEGCURL, ghr: E(HAMS, [...GMAX, ...GASTRO, ...ERECT]),
  slrdl: E([...HAMS, ...GMAX], [...GSIDE, ...ERECT, 'adductor_magnus', ...WRISTFLEX]),
  // calves
  seatcalf: E(['soleus'], [...GASTRO, 'tibialis_posterior', 'fibularis_longus', 'fibularis_brevis', 'flexor_hallucis_longus']),
  donkeycalf: CALFR, lpcalf: CALFR,
  tibraise: E(['tibialis_anterior'], ['extensor_digitorum_longus', 'extensor_hallucis_longus', 'fibularis_tertius']),
  // abs and core
  floorcrunch: E(ABS, OBL), situp: E([...ABS, ...HIPFLEX], [...OBL, 'rectus_femoris']), abmachine: E(ABS, OBL),
  lyinglegraise: LEGRAISE, vup: E([...ABS, ...HIPFLEX], [...OBL, 'rectus_femoris']),
  deadbug: E(['rectus_abdominis', 'transversus_abdominis'], ['external_oblique', 'internal_oblique', ...HIPFLEX]),
  birddog: E(['multifidus_lumborum', 'transversus_abdominis', 'gluteus_maximus'], [...ERECT, 'gluteus_medius', 'external_oblique', 'internal_oblique', ...FD]),
  abwheel: E([...ABS, ...OBL], [...LATS, ...SERR, ...HIPFLEX, 'triceps_long']),
  sideplank: E(['external_oblique', 'internal_oblique', 'quadratus_lumborum'], ['transversus_abdominis', 'rectus_abdominis', ...GSIDE]),
  hollow: E([...ABS, 'transversus_abdominis'], ['external_oblique', 'internal_oblique', ...HIPFLEX, 'rectus_femoris']),
  russian: E(['external_oblique', 'internal_oblique'], [...ABS, 'transversus_abdominis', ...HIPFLEX]),
  climber: E([...ABS, ...HIPFLEX], [...OBL, ...FD, ...SERR, 'rectus_femoris']),
  pallof: E(OBL, [...ABS, 'quadratus_lumborum', ...GSIDE]), woodchop: E(OBL, [...ABS, ...SERR, ...FD, 'gluteus_medius']),
  // neck, traps and grip
  necksideraise: E(['sternocleidomastoid', 'scalenus_anterior', 'scalenus_medius', 'scalenus_posterior'], ['splenius_capitis', 'splenius_colli', 'levator_scapulae', 'trapezius_upper']),
  bbshrug: E(UPTRAP, ['trapezius_middle', 'rhomboid_major', 'rhomboid_minor', ...WRISTFLEX]),
  plateshrug: E(UPTRAP, ['trapezius_middle', 'rhomboid_major', 'rhomboid_minor', ...WRISTFLEX]),
  suitcase: E([...WRISTFLEX, 'quadratus_lumborum', 'external_oblique', 'internal_oblique'], [...UPTRAP, ...GSIDE, ...ERECT, 'transversus_abdominis']),
  platepinch: E(['flexor_pollicis_longus', 'flexor_digitorum_profundus', 'humero_ulnar_head_of_flexor_digitorum_superficialis', 'radial_head_of_flexor_digitorum_superficialis'],
    ['flexor_carpi_radialis', 'abductor_pollicis_longus', 'extensor_pollicis_brevis', 'extensor_pollicis_longus']),
  deadhang: E(WRISTFLEX, [...LATS, 'trapezius_lower', 'brachioradialis_muscle', 'pectoralis_major_abdominal']),
  // kettlebell and full body
  kbswing: E([...GMAX, ...HAMS], [...ERECT, ...ABS, ...FD, ...UPTRAP, 'adductor_magnus', ...WRISTFLEX]),
  kbpress: E([...FD, ...SD], [...TRI, ...GMAX, ...HAMS, ...UPTRAP, ...OBL, ...SERR]),
  tgu: E([...OBL, ...ABS, ...FD], [...GMAX, ...QUADS, ...TRI, ...SERR, 'infraspinatus', 'supraspinatus', 'teres_minor', ...SD]),
  burpee: E([...QUADS, ...GMAX, ...CHEST], [...FD, ...TRI, ...ABS, ...CALF, ...HIPFLEX]),
};

/** App muscle group → atlas muscles, for custom exercises and for linking the atlas to Levels. */
export const BY_GROUP = {
  Chest: CHEST, Back: [...LATS, ...MIDBACK, ...ERECT], Quads: QUADS, Hamstrings: HAMS, Glutes: [...GMAX, ...GSIDE],
  'Front delts': FD, 'Side delts': SD, 'Rear delts': RD, Triceps: TRI, Biceps: [...BI, 'brachialis'], Abs: [...ABS, ...OBL],
  Calves: CALF, Forearms: [...WRISTFLEX, ...WRISTEXT, 'brachioradialis_muscle'], Neck: [...NECKFRONT, 'splenius_capitis', 'splenius_colli'],
};

/** Main and helper atlas muscles for an exercise: the detailed map, else its app muscle groups (first = main). */
export function musclesFor(ex) {
  const m = EXERCISE_MUSCLES[ex.id];
  if (m) return m;
  const [first, ...rest] = ex.muscles || [];
  return { main: BY_GROUP[first] || [], help: [...new Set(rest.flatMap(g => BY_GROUP[g] || []))] };
}

/** App muscle group an atlas muscle belongs to (for its level), or null. */
export function groupOf(key) {
  for (const [g, ks] of Object.entries(BY_GROUP)) if (ks.includes(key)) return g;
  return null;
}
