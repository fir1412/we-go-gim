// Anatomical muscle map for the Levels screen: front and back views, male or female build.
// Muscles are drawn once for the left half of a body centred on x = 100 and mirrored; the back
// view sits 220 to the right. The female build reshapes the same outlines (narrower shoulders
// and waist, wider hips), so every muscle keeps one definition.

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

// Muscle outlines, left half. [muscle, path, view] with view 'f' (front) or 'b' (back).
const PARTS = [
  // ---- front ----
  ['Chest', 'M99,77 C90,72 72,72 62,80 C56,88 56,102 64,112 C74,120 90,120 99,114 Z', 'f'],
  ['Front delts', 'M62,76 C54,74 46,80 44,90 C44,98 48,104 54,104 C56,94 60,86 66,80 Z', 'f'],
  ['Side delts', 'M44,86 C39,92 38,102 41,110 C45,108 47,100 48,92 Z', 'f'],
  ['Biceps', 'M53,108 C46,114 43,128 45,144 C48,151 55,150 58,143 C60,130 59,118 57,108 Z', 'f'],
  ['Abs', 'M99,121 L89,122 C87,140 87,164 90,186 L99,191 Z', 'f'],
  ['Abs', 'M87,123 C79,130 75,148 76,166 C79,178 85,184 89,186 C86,164 86,140 87,123 Z', 'f'],
  ['Forearms', 'M45,150 C40,160 37,176 36,194 C38,201 43,201 45,196 C48,182 51,166 56,150 C53,145 48,145 45,150 Z', 'f'],
  ['Neck', 'M93,50 C92,58 90,64 85,70 C90,73 96,70 98,65 C99,59 97,54 96,50 Z', 'f'],
  ['Quads', 'M72,198 C66,218 64,248 67,276 C70,290 81,296 89,289 C93,270 96,240 96,214 C92,204 82,198 72,198 Z', 'f'],
  ['Calves', 'M73,314 C69,328 69,346 73,360 C77,365 82,363 84,356 C86,340 86,326 84,314 Z', 'f'],
  // ---- back ----
  ['Back', 'M100,58 C92,64 80,70 64,78 C76,84 90,92 100,114 Z', 'b'],
  ['Back', 'M68,90 C61,108 63,130 75,150 C83,158 94,160 100,160 L100,116 C92,104 80,94 68,90 Z', 'b'],
  ['Rear delts', 'M62,78 C52,78 45,86 44,98 C49,102 57,98 64,88 Z', 'b'],
  ['Side delts', 'M44,88 C39,94 38,104 41,112 C45,108 46,100 47,92 Z', 'b'],
  ['Triceps', 'M52,106 C45,114 43,130 46,146 C50,151 56,149 58,142 C59,128 57,116 55,106 Z', 'b'],
  ['Forearms', 'M45,150 C40,160 37,176 36,194 C38,201 43,201 45,196 C48,182 51,166 56,150 C53,145 48,145 45,150 Z', 'b'],
  ['Neck', 'M93,47 C93,53 94,57 97,61 L100,62 L100,47 Z', 'b'],
  ['Glutes', 'M100,174 C88,170 73,176 69,191 C67,205 77,216 91,214 C97,212 100,206 100,199 Z', 'b'],
  ['Hamstrings', 'M71,218 C67,238 67,262 71,284 C77,292 88,292 92,284 C96,262 96,238 94,220 C86,213 77,213 71,218 Z', 'b'],
  ['Calves', 'M71,302 C65,317 65,336 71,350 C77,356 86,352 88,343 C90,328 88,313 84,302 Z', 'b'],
];
// Fibre and definition lines drawn over the muscles (no fill), for a more anatomical look.
const LINES = {
  f: 'M99,96 C88,94 76,96 64,104 M89,138 L99,138 M89,154 L99,154 M89,170 L99,170 M80,210 C82,236 84,262 86,286 M88,206 C90,230 92,256 92,280 M55,82 C52,90 50,98 50,104',
  b: 'M100,130 C92,124 82,118 72,114 M100,146 C90,142 80,136 74,130 M86,180 C84,194 84,204 88,212 M82,222 C82,246 82,268 84,288',
};
// Where each muscle's level number sits (left-half coordinates; shown on the figure's right side).
const TAGS = {
  Chest: [82, 96, 'f'], 'Front delts': [54, 90, 'f'], 'Side delts': [42, 100, 'f'], Biceps: [51, 128, 'f'], Abs: [94, 150, 'f'], Quads: [81, 245, 'f'], Calves: [78, 338, 'f'],
  Forearms: [45, 176, 'f'], Neck: [93, 62, 'f'],
  Back: [84, 126, 'b'], 'Rear delts': [54, 90, 'b'], Triceps: [51, 128, 'b'], Glutes: [85, 194, 'b'], Hamstrings: [82, 252, 'b'],
};

/**
 * The whole map as SVG. fill(m) -> {fill, op}; sel is the selected muscle; level(m) its level (0 = none).
 * Muscles carry data-act="muscle" so tapping one selects it.
 */
export function bodySVG({ female = false, fill, sel = null, level = () => 0, esc = s => s }) {
  const view = (v, ox) => {
    let g = `<g transform="translate(${ox} 0)">`;
    // silhouette: head, then both halves of the body
    // Hair: framing the face on the front view, a ponytail on the back view.
    const hair = !female ? '' : v === 'f' ? '<path class="hair" d="M100,8 C82,8 78,24 80,40 C81,52 78,60 76,66 C84,64 88,56 88,46 C86,30 92,20 100,20 C108,20 114,30 112,46 C112,56 116,64 124,66 C122,60 119,52 120,40 C122,24 118,8 100,8 Z"/>' : '<path class="hair" d="M100,9 C84,9 81,22 82,34 C83,44 90,50 100,50 C110,50 117,44 118,34 C119,22 116,9 100,9 Z M96,46 C94,58 95,72 100,82 C105,72 106,58 104,46 Z"/>';
    g += `<g class="sil"><ellipse cx="100" cy="30" rx="${female ? 15 : 16}" ry="19"/>${hair}<path d="${shape(OUTLINE, female)}"/><path d="${shape(OUTLINE, female)}" transform="${mirror}"/></g>`;
    for (const [m, d, pv] of PARTS) {
      if (pv !== v) continue;
      const { fill: f, op } = fill(m);
      const attrs = `class="mz ${m === sel ? 'on' : ''}" data-act="muscle" data-m="${esc(m)}" fill="${f}" fill-opacity="${op}" role="button" tabindex="-1" aria-label="${esc(m)}, level ${level(m)}"`;
      const p = shape(d, female);
      g += `<path ${attrs} d="${p}"><title>${esc(m)}</title></path><path ${attrs} d="${p}" transform="${mirror}"><title>${esc(m)}</title></path>`;
    }
    const lines = shape(LINES[v], female);
    g += `<g class="fib"><path d="${lines}"/><path d="${lines}" transform="${mirror}"/></g>`;
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
