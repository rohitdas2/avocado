export function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '0001-01-01') return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function validEntry(body) {
  return body && typeof body.name === 'string' && body.name.trim().length >= 1 &&
    body.name.trim().length <= 120 && Number.isInteger(body.calories) &&
    body.calories >= 0 && body.calories <= 100000 && validDate(body.date) &&
    ['protein', 'carbs', 'fat'].every(key => body[key] == null || (typeof body[key] === 'number' && Number.isFinite(body[key]) && body[key] >= 0 && body[key] <= 100000));
}
export const validId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export function validLift(body) {
  return body && typeof body.exercise === 'string' && body.exercise.trim().length >= 1 && body.exercise.trim().length <= 120 &&
    typeof body.weight === 'number' && Number.isFinite(body.weight) && body.weight >= 0 && body.weight <= 10000 &&
    ['lb','kg'].includes(body.unit) && Number.isInteger(body.sets) && body.sets >= 1 && body.sets <= 100 &&
    Number.isInteger(body.reps) && body.reps >= 1 && body.reps <= 1000 && validDate(body.date);
}
