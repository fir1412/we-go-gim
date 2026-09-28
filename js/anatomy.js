// Anatomical muscle map for the Levels screen: front and back views, male or female build.
// Muscles are drawn once for the left half of a body centred on x = 100 and mirrored; the back
// view sits 220 to the right. The female build reshapes the same outlines (narrower shoulders
// and waist, wider hips), so every muscle keeps one definition.
//
// Each region is one visible muscle (or a clear part of one) with its own name, the app muscle
// group that colours it and earns its XP, and the 3D atlas muscles it stands for
// (keys from anatomy/full-body-map.json). Group choices that are not obvious:
//   trapezius, rhomboids, lats, teres, infraspinatus, lower back -> Back
//   serratus anterior -> Chest (it works in every press and push-up)
//   obliques -> Abs; brachialis -> Biceps; brachioradialis -> Forearms
//   adductors, sartorius, hip flexors -> Quads; tensor fasciae latae -> Glutes
//   tibialis anterior, fibularis, soleus -> Calves; sternocleidomastoid, splenius -> Neck

// Width of the body at height y, female relative to male (1 = same). Head and feet unchanged.
const FEMALE = [[0, 1], [58, 1], [72, 0.86], [118, 0.86], [160, 0.8], [200, 1.12], [240, 1.08], [300, 0.96], [420, 0.96]];
function factor(y) {
  for (let i = 1; i < FEMALE.length; i++) {
    const [y1, f1] = FEMALE[i];
    if (y <= y1) { const [y0, f0] = FEMALE[i - 1]; return f0 + (f1 - f0) * (y - y0) / (y1 - y0); }
  }
  return 1;
}
/** Every "x,y" pair in a path moved toward (or away from) the centre line for the female build. */
const shape = (d, female) => (female ? d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (m, x, y) => `${+(100 - (100 - x) * factor(+y)).toFixed(1)},${y}`) : d);
const mirror = 'translate(200 0) scale(-1 1)';

// Body outline, left half (arm, torso, leg). The head is drawn separately.
const OUTLINE = 'M100,48 L93,48 C93,58 89,63 80,67 C66,71 52,73 45,82 C38,93 37,108 39,122 C40,138 38,156 36,176 C35,190 34,204 33,214 C32,222 41,224 43,214 C45,200 47,186 49,172 C51,158 53,144 56,132 C58,150 62,168 66,182 C62,204 61,230 63,256 C64,278 65,294 69,306 C65,330 65,352 69,372 C70,380 70,386 72,390 C76,394 88,394 90,389 C91,383 91,376 91,370 C93,350 93,330 91,306 C94,284 97,256 98,228 C99,218 100,212 100,208 Z';

const R = (id, view, group, part, atlas, d) => ({ id, view, group, part, atlas, d });

/** Every drawn region, left-half coordinates. view 'f' = front, 'b' = back. */
export const REGIONS = [
  // ---------------- front ----------------
  R('scm', 'f', 'Neck', 'Side of the neck (sternocleidomastoid)', ['sternocleidomastoid'],
    'M91,47 C92,55 94.5,62 97.5,70 L99.5,70 C98.5,62 96,53 93.8,47 Z'),
  R('trap-front', 'f', 'Back', 'Upper traps (upper trapezius)', ['trapezius_upper', 'levator_scapulae'],
    'M92.6,56 C90,63 83,67.5 70,72.5 C79,74 88,72.5 95.5,68.5 C94,65 93,61 92.6,56 Z'),
  R('delt-front', 'f', 'Front delts', 'Front shoulder (anterior deltoid)', ['deltoid_anterior'],
    'M68,75.5 C62,74 55,75 50,79 C47,88 48,100 52,109 C56,100 61,88 68.5,80 Z'),
  R('delt-side-f', 'f', 'Side delts', 'Side shoulder (lateral deltoid)', ['deltoid_lateral'],
    'M48.5,79.5 C43.5,81 40,86.5 39,95 C38.3,102 40,108 43,112 C46,112 49,111 50.5,109.5 C46.5,100 45.8,88 48.5,79.5 Z'),
  R('pec-upper', 'f', 'Chest', 'Upper chest (clavicular pectoralis major)', ['pectoralis_major_clavicular'],
    'M99.3,74.5 C90,72.5 79,73.5 70,78.5 C66,82 63.5,86 62.5,91 C74,89 88,89.5 99.3,91.5 Z'),
  R('pec-lower', 'f', 'Chest', 'Mid and lower chest (sternal pectoralis major)', ['pectoralis_major_sternocostal', 'pectoralis_major_abdominal', 'pectoralis_minor'],
    'M99.3,93.5 C88,91.5 74,91 62,93 C58.5,101 60,110 66,114.5 C76,121 90,121 99.3,117.5 Z'),
  R('serratus', 'f', 'Chest', 'Serratus anterior (under the armpit)', ['serratus_anterior'],
    'M60,113 C58.2,122 58.3,132 60.5,142 L63,140.5 L66.5,135.5 L63.5,132 L67.5,127.5 L65.5,123.5 L68.5,119.5 L66.5,116 Z'),
  R('abs-upper', 'f', 'Abs', 'Upper abs (rectus abdominis)', ['rectus_abdominis'],
    'M99.3,121 L89.2,121.5 C88.2,126 88,131 88.1,135.5 L99.3,136 Z M99.3,138.5 L88.1,138 C87.6,142.5 87.5,147.5 87.7,152 L99.3,152.5 Z'),
  R('abs-mid', 'f', 'Abs', 'Middle abs (rectus abdominis)', ['rectus_abdominis'],
    'M99.3,155 L87.8,154.5 C87.8,160 88,165 88.4,170 L99.3,170.5 Z'),
  R('abs-lower', 'f', 'Abs', 'Lower abs (rectus abdominis)', ['rectus_abdominis'],
    'M99.3,173 L88.6,172.5 C89.2,182 91.2,192 95,199.5 C96.5,201.5 98,202 99.3,202 Z'),
  R('oblique', 'f', 'Abs', 'Obliques (external oblique)', ['external_oblique', 'internal_oblique', 'transversus_abdominis'],
    'M86.2,122 C80,120 74.5,119.5 70.5,121 L67.8,124.5 L70,128 L65.8,132.5 L68.8,136 L64.5,141.5 C62.5,152 63,164 65.8,175 C68,181.5 73,185.5 80,189.5 C84,192 87.5,194.5 90,196 C87.8,180 86.2,160 86.2,140 Z'),
  R('biceps', 'f', 'Biceps', 'Biceps (biceps brachii)', ['biceps_brachii_long', 'biceps_brachii_short'],
    'M52.5,111.5 C47.5,116 44.5,126 44.8,138 C45.3,146 48.3,150.5 52.3,150.5 C56,146 57.2,136 56.8,124.5 C56.2,118 54.5,113.5 52.5,111.5 Z'),
  R('brachialis', 'f', 'Biceps', 'Brachialis (under the biceps)', ['brachialis', 'coracobrachialis'],
    'M43.2,121 C40.5,130 39.8,141 40.8,151 C42.8,154 45.8,154.2 48,152.2 C45,148.5 43.3,142 43.2,134 Z'),
  R('brachiorad', 'f', 'Forearms', 'Brachioradialis (top of the forearm)', ['brachioradialis_muscle'],
    'M40.3,154.5 C37.5,162 36.4,171 36.6,181 C39,177 41.2,171 43.2,164 C44.3,160 45.2,157 45.6,155.2 C43.8,156 42,155.8 40.3,154.5 Z'),
  R('flexors', 'f', 'Forearms', 'Forearm flexors (wrist and grip)', ['flexor_carpi_radialis', 'palmaris_longus_muscle', 'humeral_head_of_flexor_carpi_ulnaris', 'ulnar_head_of_flexor_carpi_ulnaris', 'humero_ulnar_head_of_flexor_digitorum_superficialis', 'radial_head_of_flexor_digitorum_superficialis', 'superficial_head_of_pronator_teres'],
    'M47.8,154.5 C45.5,162 42.4,174 40,187 C38.8,194 38.4,200 38.8,205.5 L41.8,205.5 C43.5,196 45.8,186 48,176.5 C49.8,168.5 51.8,160 53.2,152.5 C51.4,151.2 49.5,152.2 47.8,154.5 Z'),
  R('tfl', 'f', 'Glutes', 'Hip front (tensor fasciae latae)', ['tensor_fasciae_latae', 'gluteus_medius'],
    'M66.3,186.5 C63.6,193 62,200.5 62.2,208.5 C63.3,212 65.5,212 67,209 C68.6,202 69.6,195 69.8,188.5 Z'),
  R('hipflex', 'f', 'Quads', 'Hip flexors (iliopsoas and pectineus)', ['iliacus', 'psoas_major', 'pectineus'],
    'M76.5,193 C80.5,195.5 84.5,198.5 88,201.5 C86.5,205.5 84.5,209 82.4,212 C80.6,205 78.8,199 76.5,193 Z'),
  R('sartorius', 'f', 'Quads', 'Sartorius (the long strap muscle)', ['sartorius'],
    'M71.8,189.5 C76,205 83,229 87.8,254 C90,267 90.8,282 90.6,298 L93.4,298.5 C93.6,282 93,266 91.6,253 C86.4,228 79.6,205 75,190 Z'),
  R('adductors', 'f', 'Quads', 'Inner thigh (adductors)', ['adductor_longus', 'adductor_brevis', 'gracilis', 'adductor_magnus'],
    'M89.5,203.5 C93,206 96.5,208.5 99.4,209.5 C99,221 98,236 96.5,251 C96,256 95,260 94,262 C92,246 88.5,228 83.6,214.5 C85.6,211 87.6,207.2 89.5,203.5 Z'),
  R('rectfem', 'f', 'Quads', 'Front of the thigh (rectus femoris)', ['rectus_femoris', 'vastus_intermedius'],
    'M71.6,201 C68,218 67.4,244 70.6,266 C72.4,280 75.6,290 79.2,294.5 C82.2,287 83.2,275 82.8,262 C82.2,244 78.6,222 73.6,203 Z'),
  R('vastlat', 'f', 'Quads', 'Outer thigh (vastus lateralis)', ['vastus_lateralis'],
    'M69.6,208.5 C65.4,215 63,226 62.2,238 C61.8,254 63,270 65,286 C66.2,295 68.2,300.5 71.5,303 C74.5,304 77,302 77.3,298.5 C72.6,290 69.6,280 68.6,266 C67,250 66.8,226 69.8,210 Z'),
  R('vastmed', 'f', 'Quads', 'Teardrop above the knee (vastus medialis)', ['vastus_medialis'],
    'M84.2,244 C81,256 79.8,274 80.8,290 C83,299.5 87,302 89.6,299 C89.4,290 88.8,278 87.8,266 C87,258 86,250.5 84.2,244 Z'),
  R('tibialis', 'f', 'Calves', 'Shin (tibialis anterior)', ['tibialis_anterior', 'extensor_digitorum_longus', 'extensor_hallucis_longus'],
    'M73,313.5 C70.4,325 70.2,340 71.6,354 C72.6,364 74.6,373 77.5,380 L79.3,379 C78.4,366 78.2,350 78.8,336 C79.2,326 78.4,318 76.6,313 Z'),
  R('fibularis', 'f', 'Calves', 'Outer shin (fibularis)', ['fibularis_longus', 'fibularis_brevis', 'fibularis_tertius'],
    'M70.5,316 C67.4,327 66.6,342 68.2,357 C69,362 70.2,366 71.4,369 C70,356 69.2,340 69.6,327 C69.8,322 70.2,319 70.5,316 Z'),
  R('gastro-f', 'f', 'Calves', 'Inner calf (gastrocnemius, medial head)', ['gastrocnemius_medial'],
    'M85.5,312.5 C89.8,318.5 92.2,330 92.4,342 C92.2,350 90.6,356 88.4,360.5 C86.4,348 85.2,334 84.8,321 C84.8,317.5 85,314.5 85.5,312.5 Z'),
  R('soleus-f', 'f', 'Calves', 'Soleus (lower calf)', ['soleus', 'flexor_digitorum_longus'],
    'M88,364 C90.2,358 92,351.5 92.6,345 C93,356 92,365 90.8,372 C89.4,371.5 88.4,368 88,364 Z'),

  // ---------------- back ----------------
  R('splenius', 'b', 'Neck', 'Back of the neck (splenius)', ['splenius_capitis', 'splenius_colli'],
    'M93.4,47 C93.3,51.5 93.6,55 94.8,58 L99.3,55.5 L99.3,47 Z'),
  R('trap-upper', 'b', 'Back', 'Upper traps (upper trapezius)', ['trapezius_upper', 'levator_scapulae'],
    'M99.3,57.5 L95.4,60 C92.5,64.5 85,68.5 75.5,71.8 C69.5,73.8 65,76 61.5,79 C72,79 85,76.5 99.3,73.5 Z'),
  R('trap-mid', 'b', 'Back', 'Middle traps (middle trapezius)', ['trapezius_middle'],
    'M99.3,75.8 C86,78.5 73,80.5 62.5,81.2 C70,86 78.5,93 85.8,100 L99.3,100 Z'),
  R('trap-lower', 'b', 'Back', 'Lower traps (lower trapezius)', ['trapezius_lower'],
    'M99.3,102.2 L87.2,102.2 C88.2,113 92,129 99.3,146 Z'),
  R('rhomboid', 'b', 'Back', 'Rhomboids (between the shoulder blades)', ['rhomboid_major', 'rhomboid_minor'],
    'M85.8,104.5 C85.8,110.5 85.2,116 84.6,121 C87.2,121.8 89.4,121.2 91,119.8 C89.2,114.5 87.4,109.5 85.8,104.5 Z'),
  R('infraspin', 'b', 'Back', 'Shoulder blade (infraspinatus)', ['infraspinatus', 'teres_minor', 'supraspinatus'],
    'M84.4,102.4 C78.4,97.5 71,92.5 63.6,89.4 C60.6,95 58.6,101.5 58.4,107 C65.4,114.6 73.6,119.6 81.2,122.2 L83.8,121 Z'),
  R('teres', 'b', 'Back', 'Teres major (armpit, behind)', ['teres_major'],
    'M81.4,124.6 C73.8,122.8 65.4,117.6 58.2,109.8 C57.2,113 56.8,116.2 57,119.4 C63.2,126 71,130 77.8,131.2 C80,129.6 81.2,127.4 81.4,124.6 Z'),
  R('lats', 'b', 'Back', 'Lats (latissimus dorsi)', ['latissimus_dorsi'],
    'M83.4,124.4 C86.4,124.6 89.4,124.2 92,122.4 C94,132 96,140 98.4,148 C94,154 88,159.5 80,165.5 C74,169.8 68.5,173.8 64.2,177.6 C62,168 60,156 58.8,146 C57.8,138 57.4,131 57.8,124.8 C60.2,127.4 63.2,130 66.2,131.8 C70.4,133.8 75.4,134 79.4,133.2 C81.4,130.4 82.8,127.4 83.4,124.4 Z'),
  R('lowback', 'b', 'Back', 'Lower back (erector spinae)', ['iliocostalis_lumborum', 'iliocostalis_thoracis', 'longissimus_thoracis', 'spinalis_thoracis', 'multifidus_lumborum', 'quadratus_lumborum'],
    'M99.3,151.5 L91.6,159.6 C90.2,167.4 90,175.6 91,184 C94,185.8 97,186 99.3,186 Z'),
  R('oblique-b', 'b', 'Abs', 'Obliques, seen from behind (external oblique)', ['external_oblique', 'internal_oblique'],
    'M64.8,180.2 C71,175.6 80.4,169.6 88.8,165.6 C88.2,171.8 88.4,178 89.2,184 C82,184.4 74.4,184.6 67.2,184.6 C66.3,183.2 65.5,181.8 64.8,180.2 Z'),
  R('delt-rear', 'b', 'Rear delts', 'Rear shoulder (posterior deltoid)', ['deltoid_posterior'],
    'M61.8,82.2 C57,81.2 52.4,82 49,84 C48,92 49.4,101 52.8,108.6 C54.8,103 57.2,98 59.8,93.4 C61,90 61.6,86 61.8,82.2 Z'),
  R('delt-side-b', 'b', 'Side delts', 'Side shoulder (lateral deltoid)', ['deltoid_lateral'],
    'M47.4,83.4 C42.4,85.4 39.4,92 38.9,100 C38.7,106 40.5,110 43.2,112.2 C46.2,112.2 49.4,111.2 51.2,109.6 C47.8,101 46.2,92 47.4,83.4 Z'),
  R('tri-lat', 'b', 'Triceps', 'Outer triceps (lateral head)', ['triceps_lateral', 'triceps_medial', 'anconeus_muscle'],
    'M43.2,114.6 C40.4,122.4 39.6,132 40.4,142 C41.6,146.4 43.8,147.6 46,146.4 C46,138 47,128 48.8,118.4 C47.4,115.4 45.4,114 43.2,114.6 Z'),
  R('tri-long', 'b', 'Triceps', 'Inner triceps (long head)', ['triceps_long'],
    'M50.6,113.4 C48.6,122 47.6,132 47.6,146 C50,149.2 53,149.2 54.8,146.4 C56.4,138 56.8,128 55.8,120 C54.4,116 52.6,113.8 50.6,113.4 Z'),
  R('extensors', 'b', 'Forearms', 'Forearm extensors (back of the forearm)', ['extensor_digitorum', 'extensor_carpi_radialis_longus', 'extensor_carpi_radialis_brevis', 'ulnar_head_of_extensor_carpi_ulnaris', 'humeral_head_of_extensor_carpi_ulnaris', 'extensor_digiti_minimi', 'brachioradialis_muscle'],
    'M40.8,151.6 C37.6,160 36.4,174 36.3,188 C36.5,196 37.4,201 38.8,205.5 L41.4,205.5 C42.4,194 44,180 45.8,168 C46.8,160 47.2,155 46.8,151.2 C44.8,150 42.6,150.2 40.8,151.6 Z'),
  R('flexors-b', 'b', 'Forearms', 'Wrist flexors, seen from behind (flexor carpi ulnaris)', ['humeral_head_of_flexor_carpi_ulnaris', 'ulnar_head_of_flexor_carpi_ulnaris'],
    'M48.8,151 C49.2,156 48.8,164 47.6,172 C46.2,182 44.4,194 43.2,205 L44.4,204.2 C45.8,192 47.6,180 49.4,169 C50.6,161 51.8,155 52.8,150.2 C51.4,149.6 50,149.8 48.8,151 Z'),
  R('glute-med', 'b', 'Glutes', 'Upper side glute (gluteus medius)', ['gluteus_medius', 'gluteus_minimus'],
    'M66.6,186.4 C73,185.9 81,186.1 88,187.2 C84,190 78,193.6 72,197.4 C70,197.6 67.4,196.8 65.6,195 C65.6,192 66,189 66.6,186.4 Z'),
  R('glute-max', 'b', 'Glutes', 'Glutes (gluteus maximus)', ['gluteus_maximus'],
    'M99.3,188 C95,188 91,188.8 88.4,190.4 C80.4,195 72.4,199.4 66,202.4 C63.6,208 65,215.8 71,219.8 C80,223.8 92,222.2 99.3,217.2 Z'),
  R('bicfem', 'b', 'Hamstrings', 'Outer hamstring (biceps femoris)', ['biceps_femoris_long', 'biceps_femoris_short'],
    'M70.2,224 C65.4,236 63.6,252 64.4,268 C65.4,282 68,294 72,304 L75,303.4 C75,288 76,270 77.8,254 C78.8,242 78.2,232 76.2,224.4 Z'),
  R('semis', 'b', 'Hamstrings', 'Inner hamstrings (semitendinosus and semimembranosus)', ['semitendinosus', 'semimembranosus'],
    'M78.6,224.6 C80.6,234 81.2,246 80.2,258 C79.2,272 78.4,288 78.2,304 L81.2,304 C85,290 88.8,276 89.8,262 C90.8,250 90,236 88.2,224.4 Z'),
  R('addmag', 'b', 'Quads', 'Inner thigh, seen from behind (adductor magnus)', ['adductor_magnus', 'gracilis'],
    'M90.6,223.6 C92.6,236 93.2,250 92.2,264 L94.2,261.6 C96,252 97,240 97.8,226.4 C95.8,223.4 93,222.8 90.6,223.6 Z'),
  R('gastro-lat', 'b', 'Calves', 'Outer calf (gastrocnemius, lateral head)', ['gastrocnemius_lateral', 'plantaris'],
    'M73,310.2 C68.4,318 66.4,330 67.2,342 C68,350 71,354 75,354 C77,344 78,330 78,318 C77.4,313 75.4,310.2 73,310.2 Z'),
  R('gastro-med', 'b', 'Calves', 'Inner calf (gastrocnemius, medial head)', ['gastrocnemius_medial'],
    'M80.6,310.2 C80,322 80.6,336 81.6,350 C83,358 87,358 89,352 C92,340 92,324 88,312 C86,309 83,309 80.6,310.2 Z'),
  R('soleus', 'b', 'Calves', 'Soleus (under the calf)', ['soleus', 'flexor_hallucis_longus', 'tibialis_posterior'],
    'M68.2,347.5 C68,357 69.6,366 72.2,374 C76,372 80,370.4 84,370.4 C87,370.4 89,371.6 90.2,372.4 C91.6,366 92,360 91.6,354.4 C90,359.6 86.4,362 83.2,360.4 C81.6,359.2 81,357.6 80.6,355.6 C78.4,358.6 74,358.8 71,355.4 C69.8,353.4 68.8,350.6 68.2,347.5 Z'),
];
const BY_ID = Object.fromEntries(REGIONS.map(r => [r.id, r]));
/** A region by id, or null. */
export const regionById = id => BY_ID[id] || null;

// Where each muscle group's level number sits (left-half coordinates; shown on the figure's right side).
const TAGS = {
  Chest: [82, 104, 'f'], 'Front delts': [58, 92, 'f'], 'Side delts': [43, 99, 'f'], Biceps: [51, 132, 'f'], Abs: [93.5, 162, 'f'], Quads: [76, 250, 'f'], Calves: [74, 345, 'f'],
  Forearms: [43, 180, 'f'], Neck: [95, 60, 'f'],
  Back: [76, 150, 'b'], 'Rear delts': [55, 94, 'b'], Triceps: [48, 131, 'b'], Glutes: [83, 207, 'b'], Hamstrings: [78, 262, 'b'],
};

/**
 * The whole map as SVG. fill(m) -> {fill, op}; sel is the selected muscle group; region the tapped
 * region id (outlined more strongly); level(m) a group's level (0 = none).
 * Every region carries data-act="muscle" with its group (data-m) and region id (data-r), so tapping one
 * selects its group and remembers the region. Regions of one group sit in one labelled group per view.
 */
export function bodySVG({ female = false, fill, sel = null, region = null, level = () => 0, esc = s => s }) {
  const view = (v, ox) => {
    let g = `<g transform="translate(${ox} 0)">`;
    // silhouette: head, then both halves of the body
    // Hair: framing the face on the front view.
    const hair = !female ? '' : v === 'f' ? '<path class="hair" d="M100,8 C82,8 78,24 80,40 C81,52 78,60 76,66 C84,64 88,56 88,46 C86,30 92,20 100,20 C108,20 114,30 112,46 C112,56 116,64 124,66 C122,60 119,52 120,40 C122,24 118,8 100,8 Z"/>' : '';
    // Back view: the whole head of hair falling past the nape (same outline as the front), drawn on top of the
    // muscles at the end so the body outline doesn't hide it; taps go through to the muscles underneath.
    const hairBack = female && v === 'b' ? '<g class="sil" pointer-events="none"><path class="hair" d="M100,8 C82,8 78,24 80,40 C81,52 78,60 76,66 C86,71 114,71 124,66 C122,60 119,52 120,40 C122,24 118,8 100,8 Z"/></g>' : '';
    g += `<g class="sil"><ellipse cx="100" cy="30" rx="${female ? 15 : 16}" ry="19"/>${hair}<path d="${shape(OUTLINE, female)}"/><path d="${shape(OUTLINE, female)}" transform="${mirror}"/></g>`;
    const groups = [...new Set(REGIONS.filter(r => r.view === v).map(r => r.group))];
    for (const m of groups) {
      const { fill: f, op } = fill(m);
      g += `<g class="mg${m === sel ? ' on' : ''}" role="img" aria-label="${esc(m)}, level ${level(m)}" fill="${f}" fill-opacity="${op}">`;
      for (const r of REGIONS) {
        if (r.view !== v || r.group !== m) continue;
        const p = shape(r.d, female);
        const attrs = `class="mz${r.id === region ? ' hit' : ''}" data-act="muscle" data-m="${esc(m)}" data-r="${r.id}"`;
        g += `<path ${attrs} d="${p}"><title>${esc(r.part)}</title></path><path ${attrs} d="${p}" transform="${mirror}"><title>${esc(r.part)}</title></path>`;
      }
      g += '</g>';
    }
    g += hairBack;
    for (const [m, [x, y, tv]] of Object.entries(TAGS)) {
      const L = level(m);
      if (tv !== v || !L) continue;
      const tx = 200 - +shape(`${x},${y}`, female).split(',')[0];
      g += `<text class="mlv" x="${tx}" y="${y + 5}" text-anchor="middle" aria-hidden="true">${L}</text>`;
    }
    return g + `<text x="100" y="412" text-anchor="middle" class="dlbl">${v === 'f' ? 'FRONT' : 'BACK'}</text></g>`;
  };
  return `<svg class="bodysvg" viewBox="0 0 420 420" role="group" aria-label="Muscle map, ${female ? 'female' : 'male'} body. Tap a muscle">${view('f', 0)}${view('b', 220)}</svg>`;
}
