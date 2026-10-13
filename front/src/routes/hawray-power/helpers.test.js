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
  timeAxisTicks,
  trimPoints,
  trimSeries,
  windowStartOf
} from './helpers.js';
import dayjs from 'dayjs';

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
  assert.equal(refreshDueMs(60), 15 * 60 * 1000, 'a 60 s series is refetched every 15 minutes too');
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

// The time axis (spec §6): the ticks of the strip for a span and a width
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Not on a tick boundary: a window that starts and ends on one would count both of its ends as labels
const NOW = Date.parse('2026-10-13T12:07:31.000Z');
const RANGE_SPANS = {
  '15m': 15 * MINUTE,
  '1h': HOUR,
  '6h': 6 * HOUR,
  '24h': DAY,
  '7d': 7 * DAY,
  '30d': 30 * DAY,
  '1y': 365 * DAY
};
const WIDTH_1280 = 966;
const WIDTH_390 = 316;

const axisOf = (span, width) => timeAxisTicks({ start: NOW - span, end: NOW, width });
const timesOf = ticks => ticks.map(tick => tick.time);

// Runs fn with the process zone set, then restores it (Node reads TZ at runtime)
const withTimeZone = (zone, fn) => {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    process.env.TZ = previous;
  }
};

// The ticks are consecutive steps of the expected unit: minutes of clock time, or calendar days or months
const assertSteps = (ticks, unit, step) => {
  const times = timesOf(ticks);
  for (let i = 1; i < times.length; i += 1) {
    const expected =
      unit === 'clock'
        ? times[i - 1] + step * MINUTE
        : dayjs(times[i - 1])
            .add(step, unit === 'day' ? 'day' : 'month')
            .valueOf();
    assert.equal(times[i], expected, `tick ${i} is ${step} ${unit} after tick ${i - 1}`);
  }
};

test('the axis holds at most one label per 70 px, and its labels are 70 px apart, for every range and width', () => {
  for (const span of Object.values(RANGE_SPANS)) {
    for (const width of [WIDTH_390, WIDTH_1280]) {
      const ticks = axisOf(span, width);
      assert.ok(ticks.length >= 1, `a ${span} ms span has labels at ${width} px`);
      assert.ok(ticks.length <= Math.floor(width / 70), `${ticks.length} labels at ${width} px`);
      for (let i = 1; i < ticks.length; i += 1) {
        assert.ok((ticks[i].ratio - ticks[i - 1].ratio) * width >= 70, `labels ${i - 1} and ${i} are 70 px apart`);
      }
    }
  }
});

test('on a 140 px strip a 5 min span keeps its labels 70 px apart, even when that leaves one label', () => {
  // The count alone would allow two labels here, 56 px apart: the step must also be 70 px wide
  const ticks = axisOf(5 * MINUTE, 140);
  for (let i = 1; i < ticks.length; i += 1) {
    assert.ok((ticks[i].ratio - ticks[i - 1].ratio) * 140 >= 70, `labels ${i - 1} and ${i} are closer than 70 px`);
  }
});

test('the 15 min range steps every 2 min at 1280 px and every 5 min at 390 px', () => {
  assertSteps(axisOf(RANGE_SPANS['15m'], WIDTH_1280), 'clock', 2);
  assertSteps(axisOf(RANGE_SPANS['15m'], WIDTH_390), 'clock', 5);
});

test('the 1 h range steps every 10 min at 1280 px and every 15 min at 390 px', () => {
  assertSteps(axisOf(RANGE_SPANS['1h'], WIDTH_1280), 'clock', 10);
  assertSteps(axisOf(RANGE_SPANS['1h'], WIDTH_390), 'clock', 15);
});

test('the 6 h range steps every hour at 1280 px and every 2 h at 390 px', () => {
  assertSteps(axisOf(RANGE_SPANS['6h'], WIDTH_1280), 'clock', 60);
  assertSteps(axisOf(RANGE_SPANS['6h'], WIDTH_390), 'clock', 120);
});

test('the 24 h range steps every 2 h at 1280 px and every 6 h at 390 px', () => {
  assertSteps(axisOf(RANGE_SPANS['24h'], WIDTH_1280), 'clock', 120);
  assertSteps(axisOf(RANGE_SPANS['24h'], WIDTH_390), 'clock', 360);
});

test('the 7 d range puts one tick at each local midnight, 1 day apart at 1280 px and 2 days apart at 390 px', () => {
  const wide = axisOf(RANGE_SPANS['7d'], WIDTH_1280);
  assertSteps(wide, 'day', 1);
  assert.ok(wide.every(tick => dayjs(tick.time).hour() === 0 && dayjs(tick.time).minute() === 0));
  assertSteps(axisOf(RANGE_SPANS['7d'], WIDTH_390), 'day', 2);
});

test('the 30 d range steps 5 days apart at 1280 px and 7 or 10 days apart at 390 px', () => {
  assertSteps(axisOf(RANGE_SPANS['30d'], WIDTH_1280), 'day', 5);
  const narrow = axisOf(RANGE_SPANS['30d'], WIDTH_390);
  const step = Math.round((narrow[1].time - narrow[0].time) / DAY);
  assert.ok(step === 7 || step === 10, `narrow step ${step} days`);
  assertSteps(narrow, 'day', step);
});

test('the 1 y range puts ticks on month starts, every month at 1280 px and every 3 months at 390 px', () => {
  const wide = axisOf(RANGE_SPANS['1y'], WIDTH_1280);
  assertSteps(wide, 'month', 1);
  assert.ok(wide.every(tick => dayjs(tick.time).date() === 1));
  const narrow = axisOf(RANGE_SPANS['1y'], WIDTH_390);
  assertSteps(narrow, 'month', 3);
  assert.ok(narrow.every(tick => dayjs(tick.time).month() % 3 === 0));
});

test('a short zoom keeps a fine step, so it is not left with a single label', () => {
  // 18 min at 966 px: a 10 min step would leave one label, the 2 min step gives about nine
  const ticks = timeAxisTicks({ start: NOW - 18 * MINUTE, end: NOW, width: WIDTH_1280 });
  assertSteps(ticks, 'clock', 2);
  assert.ok(ticks.length >= 8, `${ticks.length} labels`);
});

test('a zoomed span follows the same rule, and the ticks stay inside the span', () => {
  const ticks = timeAxisTicks({ start: NOW - 40 * MINUTE, end: NOW, width: WIDTH_390 });
  assertSteps(ticks, 'clock', 10);
  assert.ok(ticks.every(tick => tick.ratio > 0 && tick.ratio < 1));
});

test('a zero width or an empty span has no ticks', () => {
  assert.deepEqual(timeAxisTicks({ start: NOW - HOUR, end: NOW, width: 0 }), []);
  assert.deepEqual(timeAxisTicks({ start: NOW, end: NOW, width: WIDTH_1280 }), []);
});

test('the label format follows the span: a time within a day, the day, then the month from 90 days', () => {
  assert.ok(axisOf(RANGE_SPANS['15m'], WIDTH_1280).every(tick => tick.format === 'HH:mm'));
  assert.ok(axisOf(RANGE_SPANS['7d'], WIDTH_1280).every(tick => tick.format === 'D MMM'));
  assert.ok(axisOf(RANGE_SPANS['30d'], WIDTH_1280).every(tick => tick.format === 'D MMM'));
  assert.ok(axisOf(RANGE_SPANS['1y'], WIDTH_390).every(tick => tick.format === 'MMM YYYY'));
});

test('the first tick after a local midnight shows the date with the time, within a day', () => {
  withTimeZone('America/New_York', () => {
    // 12:30 on 12 Oct to 12:30 on 13 Oct, local: the 4 ticks are 18:00, 00:00 (13 Oct), 06:00 and 12:00
    const ticks = timeAxisTicks({
      start: dayjs('2026-10-12T12:30:00').valueOf(),
      end: dayjs('2026-10-13T12:30:00').valueOf(),
      width: WIDTH_390
    });
    const dated = ticks.filter(tick => tick.format === 'D MMM HH:mm');
    assert.equal(dated.length, 1);
    assert.equal(dayjs(dated[0].time).format('YYYY-MM-DD HH:mm'), '2026-10-13 00:00');
    assert.equal(ticks.filter(tick => tick.format === 'HH:mm').length, ticks.length - 1);
  });
});

test('the 7 d day ticks stay one per local midnight across the New York DST change', () => {
  withTimeZone('America/New_York', () => {
    // DST starts on 8 Mar 2026 at 02:00 in New York, so that day is 23 h long
    const start = dayjs('2026-03-05T12:30:00').valueOf();
    const end = dayjs('2026-03-12T12:30:00').valueOf();
    const ticks = timeAxisTicks({ start, end, width: WIDTH_1280 });
    const days = ticks.map(tick => dayjs(tick.time).format('YYYY-MM-DD HH:mm'));
    assert.deepEqual(days, [
      '2026-03-06 00:00',
      '2026-03-07 00:00',
      '2026-03-08 00:00',
      '2026-03-09 00:00',
      '2026-03-10 00:00',
      '2026-03-11 00:00',
      '2026-03-12 00:00'
    ]);
    assert.equal(ticks[3].time - ticks[2].time, 23 * HOUR);
    assert.equal(ticks[2].time - ticks[1].time, 24 * HOUR);
  });
});

// The DST axes: every tick is its own instant, the ticks are at least 70 px apart on the strip, no tick falls in the
// 02:xx hour of the spring-forward day, and the labels are the expected local times
const assertDstAxis = (ticks, span, width, labels) => {
  const times = timesOf(ticks);
  assert.equal(new Set(times).size, times.length);
  for (let i = 1; i < times.length; i += 1) {
    assert.ok(((times[i] - times[i - 1]) * width) / span >= 70, `ticks ${i} and ${i + 1} are at least 70 px apart`);
  }
  assert.ok(times.every(time => dayjs(time).hour() !== 2));
  assert.deepEqual(
    ticks.map(tick => dayjs(tick.time).format(tick.format)),
    labels
  );
};

test('the spring-forward 1 h span at 316 px steps 30 min in real time and skips 02:xx', () => {
  withTimeZone('America/New_York', () => {
    // 01:30 EST to 03:30 EDT is one real hour: the clocks go from 01:59 to 03:00
    const start = dayjs('2026-03-08T01:30:00').valueOf();
    const ticks = timeAxisTicks({ start, end: start + HOUR, width: WIDTH_390 });
    assertDstAxis(ticks, HOUR, WIDTH_390, ['01:30', '03:00', '03:30']);
  });
});

test('the spring-forward 1 h span at 966 px steps 10 min in real time: 01:50 is followed by 03:00', () => {
  withTimeZone('America/New_York', () => {
    const start = dayjs('2026-03-08T01:30:00').valueOf();
    const ticks = timeAxisTicks({ start, end: start + HOUR, width: WIDTH_1280 });
    assertDstAxis(ticks, HOUR, WIDTH_1280, ['01:30', '01:40', '01:50', '03:00', '03:10', '03:20', '03:30']);
  });
});

test('the spring-forward 6 h span at 966 px steps every hour in real time and skips 02:xx', () => {
  withTimeZone('America/New_York', () => {
    // 00:30 EST to 07:30 EDT
    const start = dayjs('2026-03-08T00:30:00').valueOf();
    const ticks = timeAxisTicks({ start, end: start + 6 * HOUR, width: WIDTH_1280 });
    assertDstAxis(ticks, 6 * HOUR, WIDTH_1280, ['01:00', '03:00', '04:00', '05:00', '06:00', '07:00']);
  });
});

test('the spring-forward 24 h span at 1200 px steps every 2 h in real time and skips 02:xx', () => {
  withTimeZone('America/New_York', () => {
    const start = dayjs('2026-03-07T12:00:00').valueOf();
    const ticks = timeAxisTicks({ start, end: start + DAY, width: 1200 });
    assertDstAxis(ticks, DAY, 1200, [
      '12:00',
      '14:00',
      '16:00',
      '18:00',
      '20:00',
      '22:00',
      '8 Mar 00:00',
      '03:00',
      '05:00',
      '07:00',
      '09:00',
      '11:00',
      '13:00'
    ]);
  });
});

test('the fall-back 1 h span at 966 px lists the repeated 01:xx hour twice, with distinct instants', () => {
  withTimeZone('America/New_York', () => {
    // 01:30 EDT to 01:30 EST: the hour from 01:30 to 02:30 happens twice, and the span covers the repeat
    const start = Date.parse('2026-11-01T05:30:00Z');
    const ticks = timeAxisTicks({ start, end: start + HOUR, width: WIDTH_1280 });
    assert.deepEqual(
      timesOf(ticks).map(time => time - start),
      [0, 10, 20, 30, 40, 50, 60].map(min => min * MINUTE)
    );
    assertDstAxis(ticks, HOUR, WIDTH_1280, ['01:30', '01:40', '01:50', '01:00', '01:10', '01:20', '01:30']);
  });
});

test('the fall-back 24 h span at 1200 px steps every 2 h in real time and labels the repeated hour', () => {
  withTimeZone('America/New_York', () => {
    const start = dayjs('2026-10-31T12:00:00').valueOf();
    const ticks = timeAxisTicks({ start, end: start + DAY, width: 1200 });
    assertDstAxis(ticks, DAY, 1200, [
      '12:00',
      '14:00',
      '16:00',
      '18:00',
      '20:00',
      '22:00',
      '1 Nov 00:00',
      '01:00',
      '03:00',
      '05:00',
      '07:00',
      '09:00',
      '11:00'
    ]);
  });
});

test('a 30 s zoom keeps one label: the whole second nearest its middle, or the minute boundary inside it', () => {
  // 14:37:10 to 14:37:40 holds no minute boundary, so the label sits at 14:37:25
  const start = new Date(2026, 9, 13, 14, 37, 10).getTime();
  const quiet = timeAxisTicks({ start, end: start + 30 * 1000, width: WIDTH_1280 });
  assert.deepEqual(timesOf(quiet), [new Date(2026, 9, 13, 14, 37, 25).getTime()]);
  assert.equal(quiet[0].format, 'HH:mm');
  // 14:37:50 to 14:38:20 holds the 14:38 boundary, which is the label
  const later = new Date(2026, 9, 13, 14, 37, 50).getTime();
  const boundary = timeAxisTicks({ start: later, end: later + 30 * 1000, width: WIDTH_1280 });
  assert.deepEqual(timesOf(boundary), [new Date(2026, 9, 13, 14, 38).getTime()]);
});

test('the 7 d midnights at 500 px drop the one 23 h after 8 Mar, which would sit 68 px from its neighbour', () => {
  withTimeZone('America/New_York', () => {
    // The midnight of 9 Mar is 23 h after 8 Mar, so its gap is 68 px, under the 70 px rule: it is dropped
    const start = dayjs('2026-03-05T12:30:00').valueOf();
    const end = dayjs('2026-03-12T12:30:00').valueOf();
    const ticks = timeAxisTicks({ start, end, width: 500 });
    assertDstAxis(ticks, end - start, 500, ['6 Mar', '7 Mar', '8 Mar', '10 Mar', '11 Mar', '12 Mar']);
  });
});
