// Pure logic shared by the Lifts, Progress and Weight screens. No React Native imports, so it is
// unit-tested directly with Node's test runner (tests/logic.test.mjs).
export type Unit = 'lb' | 'kg';
export type SetValue = { reps: number; weight: number; unit: Unit };

export const KG_PER_LB = 0.45359237;
export const fromKg = (kg: number, unit: Unit) => unit === 'kg' ? kg : kg / KG_PER_LB;
export const toKg = (weight: number, unit: Unit) => unit === 'kg' ? weight : weight * KG_PER_LB;
// One decimal at most. Rounds first, so a kg↔lb round trip (145.00000001) prints "145", not "145.0".
export const formatNumber = (value: number) => { const rounded = Math.round(value * 10) / 10; return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1); };

// The x-axis window for a daily chart: from the first logged day (or `minSpan` days back if that is
// more recent) to the last day. Few logs then spread across the chart instead of sitting in the
// last few pixels of a fixed 30-day axis. Returns each day's 0–1 position and the first day shown.
export function dayWindow(loggedIndexes: number[], dayCount: number, minSpan = 6) {
  const last = dayCount - 1;
  const first = loggedIndexes.length ? Math.min(...loggedIndexes) : last - minSpan;
  const start = Math.max(0, Math.min(first, last - minSpan));
  return { start, position: (index: number) => (index - start) / (last - start) };
}

// "3 × 8 · 135 lb" when every set matches; otherwise each set, so pyramids and drop sets stay visible.
export function setsSummary(sets: SetValue[]) {
  if (!sets.length) return 'No sets';
  const [first] = sets;
  if (sets.every(set => set.reps === first.reps && set.weight === first.weight && set.unit === first.unit)) return `${sets.length} × ${first.reps} · ${formatNumber(first.weight)} ${first.unit}`;
  return sets.map(set => `${set.reps} @ ${formatNumber(set.weight)} ${set.unit}`).join(', ');
}

// Superset members shown together, each group placed where its first member appears.
export function groupSupersets<T extends { id: string; supersetId: string | null }>(entries: T[]): T[][] {
  const result: T[][] = [];
  const seen = new Map<string, T[]>();
  for (const entry of entries) {
    if (!entry.supersetId) { result.push([entry]); continue; }
    const group = seen.get(entry.supersetId);
    if (group) group.push(entry);
    else { const created = [entry]; seen.set(entry.supersetId, created); result.push(created); }
  }
  return result;
}

// Which exercise entry the next set belongs to: the active entry if it is the chosen exercise,
// otherwise the latest entry of that exercise in the workout; undefined means create a new entry.
// Migrated rows without a catalog id (exerciseId null) never match.
export function resolveTarget<T extends { id: string; exerciseId: string | null }>(entries: T[], activeId: string | null, choiceId: string | null): T | undefined {
  if (!choiceId) return undefined;
  const active = entries.find(entry => entry.id === activeId);
  if (active && active.exerciseId === choiceId) return active;
  return [...entries].reverse().find(entry => entry.exerciseId === choiceId);
}

// Local calendar date (not UTC), so a late-evening log stays on the day it happened.
export function dateKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// The last `count` calendar days ending on `today`, oldest first. Built by calendar arithmetic so
// daylight-saving changes and month/year ends never skip or repeat a day.
export function lastDays(count: number, today: Date = new Date()) {
  return Array.from({ length: count }, (_, index) => dateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1 - index))));
}

// Line-chart geometry: x from each point's 0–1 position, y scaled to the values' range plus
// padding (minPad keeps flat or single-point data from dividing by zero). Higher values sit higher.
export function linePoints(values: number[], positions: number[], width: number, height: number, minPad: number, inset = 12, vInset = 10) {
  const low = values.length ? Math.min(...values) : 0, high = values.length ? Math.max(...values) : 0;
  const pad = Math.max((high - low) * 0.2, minPad);
  const min = Math.max(0, low - pad), max = high + pad;
  const points = values.map((value, index) => ({
    value,
    x: inset + positions[index] * (width - inset * 2),
    y: vInset + (1 - (value - min) / (max - min)) * (height - vInset * 2),
  }));
  return { points, min, max };
}

// A USDA household measure for one food ("1 large (8" to 8-7/8" long)" = 136 g per unit).
export type Portion = { label: string; grams: number };
// The serving an amount of a portion makes: whole grams (1–10,000, as the gram field allows) and a
// short label for the diary entry ("1 large", "1.5 × large"); null when the amount is not 0–100.
export function portionServing(amountText: string, portion: Portion) {
  if (!/^\d+(\.\d+)?$/.test(amountText.trim())) return null;
  const amount = Number(amountText);
  if (!(amount > 0 && amount <= 100)) return null;
  const grams = Math.round(amount * portion.grams);
  if (grams < 1 || grams > 10000) return null;
  const unit = portion.label.replace(/^\d+(\.\d+)?\s+/, '').replace(/\s*\(.*\)\s*$/, '');
  return { grams, label: amount === 1 ? `1 ${unit}` : `${formatNumber(amount)} × ${unit}`, unit };
}
