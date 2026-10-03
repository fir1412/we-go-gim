// Stored weights always use kg. Levels and bodyweight are separate load types.
export const LOAD_TYPES = ['kg', 'kg/DB', 'L', 'bw'];
export function setExercise(ex = {}, set) {
  return { ...ex, unit: LOAD_TYPES.includes(set?.loadUnit) ? set.loadUnit : ex.unit,
    ...(set?.disp === 'kg' || set?.disp === 'lb' ? { disp: set.disp } : {}) };
}
export function compatibleSet(ex, set) {
  return setExercise(ex, set).unit === ex.unit;
}
export function loadMeta(set) {
  return { ...(LOAD_TYPES.includes(set?.loadUnit) ? { loadUnit: set.loadUnit } : {}),
    ...(set?.disp === 'kg' || set?.disp === 'lb' ? { disp: set.disp } : {}) };
}
/** Switch this and later unticked sets. Completed sets retain their load type and display unit. */
export function switchSetUnit(entry, index, choice, ex, defaultDisp = 'kg') {
  if (!['kg', 'lb', 'L', 'bw'].includes(choice) || !entry.sets[index]) return false;
  for (const set of entry.sets) {
    set.loadUnit ||= ex.unit;
    set.disp ||= ex.disp || defaultDisp;
  }
  const current = entry.sets[index];
  const changesType = choice === 'L' || choice === 'bw' ? current.loadUnit !== choice : !['kg', 'kg/DB'].includes(current.loadUnit);
  // Editing a completed set's type would destroy its meaning. Start from the next unticked set instead.
  if (current.done && changesType) return false;
  for (const set of entry.sets.slice(index)) {
    if (set.done && set !== current) continue;
    const before = set.loadUnit;
    set.loadUnit = choice === 'L' || choice === 'bw' ? choice : ex.unit === 'kg/DB' ? 'kg/DB' : 'kg';
    if (choice === 'kg' || choice === 'lb') set.disp = choice;
    if (set.loadUnit !== before) set.w = set.loadUnit === 'bw' ? 0 : null;
  }
  return true;
}
