// Unit tests of the pure helpers of the Power page (spec §8, §11). Run from front/ with Node 22.7+ (module syntax is
// detected) or Node 24:
//   node --test src/routes/hawray-power/helpers.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  appendSeriesPoint,
  applyLiveValue,
  isCoarseBucket,
  orderRows,
  refreshDueMs,
  stackOrderOf,
  trimPoints,
  trimSeries,
  windowStartOf
} from './helpers.js';

const MINUTE = 60 * 1000;
const T0 = Date.parse('2026-10-13T12:00:00.000Z');
const iso = ms => new Date(ms).toISOString();
const point = (minutesAfterT0, avgW) => ({ t: iso(T0 + minutesAfterT0 * MINUTE), avg_w: avgW });
const sample = (minutesAfterT0, value) => ({
  device_feature_selector: 'oven',
  last_value: value,
  last_value_changed: iso(T0 + minutesAfterT0 * MINUTE)
});

test('a raw live sample is appended to a 1-minute series', () => {
  const series = { oven: [point(0, 100), point(1, 110)], other: [point(0, 5)] };
  const next = appendSeriesPoint(series, sample(2, 120), T0 - 60 * MINUTE, 60);
  assert.deepEqual(next.oven.at(-1), { t: iso(T0 + 2 * MINUTE), avg_w: 120 });
  assert.equal(next.oven.length, 3);
  assert.equal(next.other, series.other, 'the other series are kept as they are');
  assert.equal(series.oven.length, 2, 'the input is not mutated');
});

test('points older than the window start are dropped on append', () => {
  const series = { oven: [point(0, 100), point(10, 110), point(20, 120)] };
  const windowStart = T0 + 5 * MINUTE;
  const next = appendSeriesPoint(series, sample(25, 130), windowStart, 60);
  assert.deepEqual(
    next.oven.map(p => p.avg_w),
    [110, 120, 130]
  );
});

test('a coarse bucket gets no raw sample: the series is refetched instead', () => {
  const series = { oven: [point(0, 100)] };
  assert.equal(appendSeriesPoint(series, sample(1, 120), T0 - MINUTE, 3600), series);
  assert.equal(isCoarseBucket(60), false);
  assert.equal(isCoarseBucket(600), true);
});

test('a series that does not show the feature is returned as it is', () => {
  const series = { oven: [point(0, 100)] };
  assert.equal(appendSeriesPoint(series, { ...sample(1, 5), device_feature_selector: 'x' }, T0, 60), series);
  assert.equal(appendSeriesPoint(null, sample(1, 5), T0, 60), null);
});

test('a missing sample time is replaced by the current time', () => {
  const next = appendSeriesPoint({ oven: [] }, { device_feature_selector: 'oven', last_value: 7 }, 0, 60);
  assert.equal(next.oven.length, 1);
  assert.ok(Number.isFinite(Date.parse(next.oven[0].t)));
});

test('trimPoints keeps the same array when nothing is older than the window start', () => {
  const points = [point(5, 1), point(6, 2)];
  assert.equal(trimPoints(points, T0), points);
  assert.equal(trimPoints([], T0).length, 0);
  assert.deepEqual(trimPoints(points, T0 + 6 * MINUTE), [points[1]]);
  assert.deepEqual(trimPoints(points, T0 + 60 * MINUTE), []);
});

test('trimSeries returns the same map when no point is dropped', () => {
  const series = { oven: [point(5, 1)] };
  assert.equal(trimSeries(series, T0), series);
  const trimmed = trimSeries({ oven: [point(0, 1), point(9, 2)] }, T0 + 5 * MINUTE);
  assert.deepEqual(
    trimmed.oven.map(p => p.avg_w),
    [2]
  );
  assert.equal(trimSeries(null, T0), null);
});

test('the window ends at now and spans the range', () => {
  assert.equal(windowStartOf(T0, '15m'), T0 - 15 * MINUTE);
  assert.equal(windowStartOf(T0, 'unknown'), T0 - 24 * 60 * MINUTE, 'unknown range falls back to 24 h');
});

test('a coarse series is refetched about once per bucket, at most every 15 minutes', () => {
  assert.equal(refreshDueMs(600), 600 * 1000);
  assert.equal(refreshDueMs(21600), 15 * 60 * 1000);
});

const summary = {
  roles: [
    { role: 'mains', name: 'Mains', power_feature_selector: 'mains', last_value: 3000 },
    { role: 'circuit', name: 'Oven', power_feature_selector: 'oven', last_value: 100 },
    { role: 'circuit', name: 'Dishwasher', power_feature_selector: 'dish', last_value: 1800 }
  ]
};

test('the stacked order is fixed at the fetch and survives live values that reorder the table', () => {
  const order = stackOrderOf(summary, 'live');
  assert.deepEqual(order, ['dish', 'oven']);
  const live = applyLiveValue(summary, { device_feature_selector: 'oven', last_value: 2500 });
  const table = orderRows(
    [
      { selector: 'oven', name: 'Oven' },
      { selector: 'dish', name: 'Dishwasher' }
    ],
    order
  );
  assert.deepEqual(
    table.map(row => row.selector),
    ['dish', 'oven']
  );
  assert.equal(live.roles[1].last_value, 2500);
});

test('a circuit that is not in the fixed order goes last', () => {
  const rows = orderRows([{ selector: 'new' }, { selector: 'dish' }], ['dish']);
  assert.deepEqual(
    rows.map(row => row.selector),
    ['dish', 'new']
  );
});
