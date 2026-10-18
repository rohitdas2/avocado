// Unit tests for workoutLogic.ts (pure logic used by Lifts, Progress and Weight).
// Run: npm test   (Node's built-in runner with TypeScript type stripping; no extra dependencies)
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dateKey, formatNumber, fromKg, groupSupersets, lastDays, linePoints, resolveTarget, setsSummary, toKg } from '../workoutLogic.ts';

test('set summaries collapse equal sets and spell out mixed ones', () => {
  assert.equal(setsSummary([]), 'No sets');
  assert.equal(setsSummary([{ reps: 8, weight: 135, unit: 'lb' }, { reps: 8, weight: 135, unit: 'lb' }]), '2 × 8 · 135 lb');
  assert.equal(setsSummary([{ reps: 8, weight: 135, unit: 'lb' }, { reps: 6, weight: 62.5, unit: 'kg' }]), '8 @ 135 lb, 6 @ 62.5 kg');
  assert.equal(formatNumber(2.25), '2.3');
  assert.equal(formatNumber(140), '140');
});

test('unit conversion round-trips', () => {
  assert.ok(Math.abs(fromKg(toKg(225, 'lb'), 'lb') - 225) < 1e-9);
  assert.equal(toKg(100, 'kg'), 100);
  assert.ok(Math.abs(toKg(1, 'lb') - 0.45359237) < 1e-12);
});

test('supersets are grouped where their first member appears; singles stay in order', () => {
  const e = (id, supersetId = null) => ({ id, supersetId });
  const groups = groupSupersets([e('a', 's1'), e('b'), e('c', 's1'), e('d', 's2'), e('e', 's2'), e('f')]);
  assert.deepEqual(groups.map(group => group.map(item => item.id)), [['a', 'c'], ['b'], ['d', 'e'], ['f']]);
  assert.deepEqual(groupSupersets([]), []);
});

test('the next set goes to the active entry, else the latest entry of that exercise, else a new one', () => {
  const entries = [{ id: 'e1', exerciseId: 'bench' }, { id: 'e2', exerciseId: 'row' }, { id: 'e3', exerciseId: 'bench' }, { id: 'legacy', exerciseId: null }];
  assert.equal(resolveTarget(entries, 'e1', 'bench').id, 'e1');      // active and matching
  assert.equal(resolveTarget(entries, 'e2', 'bench').id, 'e3');      // active is another exercise: latest bench
  assert.equal(resolveTarget(entries, null, 'row').id, 'e2');
  assert.equal(resolveTarget(entries, 'e1', 'squat'), undefined);    // new exercise: create an entry
  assert.equal(resolveTarget(entries, 'legacy', null), undefined);   // nothing chosen
  assert.equal(resolveTarget(entries, 'missing', 'bench').id, 'e3'); // stale active id (entry deleted)
});

test('dates are local calendar days, not UTC', () => {
  assert.equal(dateKey(new Date(2026, 0, 1, 23, 59)), '2026-01-01');
  assert.equal(dateKey(new Date(2026, 11, 31, 0, 0)), '2026-12-31');
});

test('the 30-day window has no gaps or repeats across DST, month and year ends', () => {
  for (const today of [new Date(2026, 2, 20), new Date(2026, 10, 10), new Date(2027, 0, 5), new Date(2024, 2, 1)]) {
    const days = lastDays(30, today);
    assert.equal(days.length, 30);
    assert.equal(new Set(days).size, 30);
    assert.equal(days[29], dateKey(today));
    for (let i = 1; i < days.length; i += 1) {
      const gap = (Date.parse(`${days[i]}T00:00:00Z`) - Date.parse(`${days[i - 1]}T00:00:00Z`)) / 86400000;
      assert.equal(gap, 1, `${days[i - 1]} → ${days[i]}`);
    }
  }
  assert.ok(lastDays(30, new Date(2024, 2, 1)).includes('2024-02-29'));
});

test('chart geometry handles empty, single, flat and rising data without NaN', () => {
  assert.deepEqual(linePoints([], [], 300, 150, 1).points, []);
  const single = linePoints([170], [1], 300, 150, 1);
  assert.equal(single.points[0].x, 288);
  assert.ok(Number.isFinite(single.points[0].y));
  const flat = linePoints([170, 170, 170], [0, 0.5, 1], 300, 150, 1);
  assert.ok(flat.points.every(point => Number.isFinite(point.y) && point.y === flat.points[0].y));
  const rising = linePoints([160, 165, 170], [0, 0.5, 1], 300, 150, 1);
  assert.ok(rising.points[0].y > rising.points[2].y, 'higher values are drawn higher');
  assert.ok(rising.points.every(point => point.x >= 12 && point.x <= 288 && point.y >= 10 && point.y <= 140));
  assert.ok(rising.min < 160 && rising.max > 170);
  assert.ok(linePoints([0, 1], [0, 1], 300, 150, 1).min >= 0, 'the scale never goes below zero');
  assert.ok(linePoints([1, 2], [0, 1], 0, 150, 1).points.every(point => Number.isFinite(point.x)), 'zero width before layout');
});
