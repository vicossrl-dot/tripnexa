// Keep the existing zero-based database representation for old and new trips.
export const PLANNING_STEP_COUNT = 5;
export function fromSavedPlanningStep(value) {
  const step = Number(value);
  if (!Number.isInteger(step) || step < 0) return 0;
  return step >= 5 ? 4 : step === 4 ? 3 : step;
}
export function toSavedPlanningStep(step) { return step === 4 ? 5 : step; }
export function planningStepFromSearch(search, saved = 0) {
  const value = Number(search.get('step'));
  if (!search.has('step') || !Number.isInteger(value) || value < 0 || value > 5) return fromSavedPlanningStep(saved);
  return search.get('steps') === '5' ? Math.min(4, value) : fromSavedPlanningStep(value);
}
