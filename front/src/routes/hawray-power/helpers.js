import dayjs from 'dayjs';

// Pure helpers of the Power page: the table rows, the live updates and the remembered choices. No DOM, no request.

export const TABS = ['live', 'min', 'hr', 'day', 'wk', 'mo', 'yr'];
export const DEFAULT_TAB = 'live';

// Chart ranges, in minutes back from now. The server picks the bucket size (spec §7.2)
export const RANGES = [
  { key: '15m', minutes: 15 },
  { key: '1h', minutes: 60 },
  { key: '6h', minutes: 6 * 60 },
  { key: '24h', minutes: 24 * 60 },
  { key: '7d', minutes: 7 * 24 * 60 },
  { key: '30d', minutes: 30 * 24 * 60 },
  { key: '1y', minutes: 365 * 24 * 60 }
];
export const DEFAULT_RANGE = '24h';

export const TAB_STORAGE_KEY = 'hawrayPower.tab';
export const RANGE_STORAGE_KEY = 'hawrayPower.range';

// The Min..Yr kWh figures are refetched at most once a minute (spec §8)
export const SUMMARY_REFRESH_MS = 60 * 1000;

export const ROLE_MAINS = 'mains';
export const ROLE_BALANCE = 'balance';
export const ROLE_CIRCUIT = 'circuit';
export const ROLE_PLUG = 'plug';

// Reads a remembered choice; a missing, unknown or unreadable value (private window, blocked storage) falls back
export const readStoredChoice = (storageKey, allowed, fallback) => {
  try {
    const value = window.localStorage.getItem(storageKey);
    return allowed.includes(value) ? value : fallback;
  } catch (e) {
    return fallback;
  }
};

// Storage can be unavailable: then the choice is simply not remembered
export const storeChoice = (storageKey, value) => {
  try {
    window.localStorage.setItem(storageKey, value);
  } catch (e) {
    // not remembered
  }
};

// Every displayed value is clamped at 0; the stored and API values stay raw (spec §4)
export const clampValue = value => (Number.isFinite(value) && value > 0 ? value : 0);

export const findRange = rangeKey => RANGES.find(range => range.key === rangeKey) || RANGES[3];

// The window of the chart, in ISO UTC instants, ending now
export const rangeWindow = (rangeKey, now = new Date()) => {
  const range = findRange(rangeKey);
  return {
    from: new Date(now.getTime() - range.minutes * 60 * 1000).toISOString(),
    to: now.toISOString()
  };
};

export const rolesOf = (summary, role) => (summary && summary.roles ? summary.roles.filter(r => r.role === role) : []);

// The mains is one device; with none detected and none chosen the table has no Total
export const mainsOf = summary => rolesOf(summary, ROLE_MAINS)[0] || null;

// Power features the chart needs: mains, Other (balance) and every circuit
export const chartSelectors = summary =>
  (summary && summary.roles ? summary.roles : []).filter(r => r.role !== ROLE_PLUG).map(r => r.power_feature_selector);

// Live shows kW (W / 1000); the other tabs show kWh for the period so far
const valueOf = (role, tab) => {
  if (tab === 'live') {
    return Number.isFinite(role.last_value) ? clampValue(role.last_value) / 1000 : null;
  }
  return Number.isFinite(role.kwh) ? clampValue(role.kwh) : null;
};

// A value shows 3 decimals; 0.000 is a visible value, and that exact text greys the row
const formatValue = value => (value === null ? '—' : value.toFixed(3));

const toRow = (role, tab, totalValue) => {
  const value = valueOf(role, tab);
  const display = formatValue(value);
  return {
    selector: role.power_feature_selector,
    name: role.name,
    value,
    display,
    watts: Number.isFinite(role.last_value) ? clampValue(role.last_value) : null,
    share: totalValue && value !== null ? (value / totalValue) * 100 : null,
    muted: value === null || display === '0.000'
  };
};

// A row without a value sorts last
const sortKey = value => (value === null ? -1 : value);
const byValueDesc = (a, b) => sortKey(b.value) - sortKey(a.value);

// The table of Section A (spec §4): Total = mains only; circuits sorted by value; Other = the balance channel;
// plugs in their own section without a share
export const buildTable = (summary, tab) => {
  const mains = mainsOf(summary);
  const totalValue = mains ? valueOf(mains, tab) : null;
  const circuits = rolesOf(summary, ROLE_CIRCUIT)
    .map(role => toRow(role, tab, totalValue))
    .sort(byValueDesc);
  const balance = rolesOf(summary, ROLE_BALANCE)[0];
  const plugs = rolesOf(summary, ROLE_PLUG)
    .map(role => ({ ...toRow(role, tab, null), share: null }))
    .sort(byValueDesc);
  return {
    total: mains ? toRow(mains, tab, totalValue) : null,
    circuits,
    other: balance ? toRow(balance, tab, totalValue) : null,
    plugs
  };
};

// Live update from DEVICE.NEW_STATE (spec §8): the matching role takes the new value, the others are untouched
export const applyLiveValue = (summary, payload) => {
  if (!summary || !summary.roles) {
    return summary;
  }
  const index = summary.roles.findIndex(r => r.power_feature_selector === payload.device_feature_selector);
  if (index === -1) {
    return summary;
  }
  const roles = summary.roles.slice();
  roles[index] = {
    ...roles[index],
    last_value: payload.last_value,
    last_value_changed: payload.last_value_changed
  };
  return { ...summary, roles };
};

export const isDisplayedSelector = (summary, selector) =>
  Boolean(summary && summary.roles && summary.roles.some(r => r.power_feature_selector === selector));

// The live samples come once a minute (spec §9): a bucket coarser than that is not extended with raw samples
export const LIVE_SAMPLE_SECONDS = 60;
// A coarse series is refetched about once per bucket, but at most this often
export const MAX_REFRESH_SECONDS = 15 * 60;
// The charts keep their window on the last 'range' minutes, moved on at this pace when nothing arrives
export const WINDOW_TICK_MS = 60 * 1000;

export const windowStartOf = (nowMs, rangeKey) => nowMs - findRange(rangeKey).minutes * 60 * 1000;

export const isCoarseBucket = bucketSeconds => bucketSeconds > LIVE_SAMPLE_SECONDS;

// A coarse series is refetched about once per bucket; every series is refetched at least every 15 minutes, which
// corrects the drift of missed websocket events (the 60 s series are otherwise never refetched)
export const refreshDueMs = bucketSeconds =>
  (isCoarseBucket(bucketSeconds) ? Math.min(bucketSeconds, MAX_REFRESH_SECONDS) : MAX_REFRESH_SECONDS) * 1000;

// Points older than the window start are dropped; the same array comes back when nothing is older
export const trimPoints = (points, windowStartMs) => {
  if (!points || points.length === 0) {
    return points;
  }
  const first = points.findIndex(point => Date.parse(point.t) >= windowStartMs);
  if (first === 0) {
    return points;
  }
  return first === -1 ? [] : points.slice(first);
};

// The same map back when no series had a point to drop, so the charts it feeds are not redrawn
export const trimSeries = (series, windowStartMs) => {
  if (!series) {
    return series;
  }
  let changed = false;
  const trimmed = {};
  Object.keys(series).forEach(selector => {
    trimmed[selector] = trimPoints(series[selector], windowStartMs);
    changed = changed || trimmed[selector] !== series[selector];
  });
  return changed ? trimmed : series;
};

// Live update of the charts (spec §8): the raw sample is pushed at the right edge, and the points that left the
// window are dropped. A coarse bucket gets no raw sample: its series is refetched instead.
export const appendSeriesPoint = (series, payload, windowStartMs, bucketSeconds) => {
  const selector = payload.device_feature_selector;
  if (!series || !Object.prototype.hasOwnProperty.call(series, selector) || isCoarseBucket(bucketSeconds)) {
    return series;
  }
  const point = {
    t: payload.last_value_changed || new Date().toISOString(),
    avg_w: payload.last_value
  };
  return { ...series, [selector]: [...trimPoints(series[selector], windowStartMs), point] };
};

// The circuits in the order of a summary fetch: the stacked charts keep it while live values change
export const stackOrderOf = (summary, tab) => buildTable(summary, tab).circuits.map(row => row.selector);

// Rows in a given order; a row not in the order goes last, in the order it came
export const orderRows = (rows, order) => {
  const rank = selector => (order.includes(selector) ? order.indexOf(selector) : order.length);
  return rows.slice().sort((a, b) => rank(a.selector) - rank(b.selector));
};

// ApexCharts data: [epoch ms, W], clamped at 0 (spec §4)
export const toChartPoints = points => (points || []).map(point => [Date.parse(point.t), clampValue(point.avg_w)]);

export const seriesOf = (series, selector) => (series && series[selector]) || [];

// Whether the chart lines changed: compared by reference of their points, so an unchanged chart is not redrawn
export const linesChanged = (previous, next) =>
  previous.length !== next.length ||
  next.some((line, index) => line.name !== previous[index].name || line.points !== previous[index].points);

// The time axis of the stacked rows (spec §6). A label needs about AXIS_LABEL_PX of strip width, so the strip holds at
// most one label per that many pixels, and the ticks snap to nice boundaries of the visible span.
export const AXIS_LABEL_PX = 70;

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MONTH_MS = 30.44 * DAY_MS;

// The step ladder per span band, smallest first. The first step that fits the width is the one shown; the larger
// steps are the fallback for a narrow strip. A "clock" step is in minutes of local time, a "day" step in local days, a
// "month" step in months, all aligned to local boundaries.
const AXIS_BANDS = [
  { maxSpan: 30 * MINUTE_MS, unit: 'clock', steps: [1, 2, 5, 10, 15, 30] },
  { maxSpan: 60 * MINUTE_MS, unit: 'clock', steps: [10, 15, 30, 60] },
  { maxSpan: 2 * 60 * MINUTE_MS, unit: 'clock', steps: [30, 60, 120] },
  { maxSpan: 6 * 60 * MINUTE_MS, unit: 'clock', steps: [60, 120, 180, 360] },
  { maxSpan: DAY_MS, unit: 'clock', steps: [120, 180, 240, 360, 720] },
  { maxSpan: 7 * DAY_MS, unit: 'day', steps: [1, 2, 3, 7] },
  { maxSpan: 90 * DAY_MS, unit: 'day', steps: [5, 7, 10, 15, 30] },
  { maxSpan: Infinity, unit: 'month', steps: [1, 2, 3, 6, 12] }
];

const stepMsOf = (band, step) => {
  if (band.unit === 'clock') return step * MINUTE_MS;
  return band.unit === 'day' ? step * DAY_MS : step * MONTH_MS;
};

// Local midnights, every `step` days, from the first midnight at or after `start`
const dayTicks = (start, end, step) => {
  const first = dayjs(start).startOf('day');
  const begin = first.valueOf() < start ? first.add(1, 'day') : first;
  const ticks = [];
  for (let k = 0; begin.add(k * step, 'day').valueOf() <= end; k += 1) {
    ticks.push(begin.add(k * step, 'day').valueOf());
  }
  return ticks;
};

// Local month starts whose month number is a multiple of `step`, so the ticks do not move as the window slides
const monthTicks = (start, end, step) => {
  let cursor = dayjs(start).startOf('month');
  if (cursor.valueOf() < start) {
    cursor = cursor.add(1, 'month');
  }
  while ((cursor.year() * 12 + cursor.month()) % step !== 0) {
    cursor = cursor.add(1, 'month');
  }
  const ticks = [];
  for (let k = 0; cursor.add(k * step, 'month').valueOf() <= end; k += 1) {
    ticks.push(cursor.add(k * step, 'month').valueOf());
  }
  return ticks;
};

// The first instant at or after `from` whose local clock time is a multiple of `step` minutes. It walks real minutes,
// so a clock time that the local calendar skips (02:xx on the spring-forward day) is never picked
const clockBoundaryFrom = (from, step) => {
  const clockMinutes = instant => dayjs(instant).hour() * 60 + dayjs(instant).minute();
  let instant = Math.ceil(from / MINUTE_MS) * MINUTE_MS;
  while (clockMinutes(instant) % step !== 0) {
    instant += MINUTE_MS;
  }
  return instant;
};

// Clock ticks every `step` minutes of local time. The first is the first local boundary at or after the span start,
// and the next ones are `step` minutes of real elapsed time apart: a skipped hour is not listed, and a repeated hour is
// listed twice, each time with its own instant. A span under a minute with no minute boundary in it keeps one label,
// on the whole second nearest its middle
const clockTicks = (start, end, step) => {
  const ticks = [];
  for (let tick = clockBoundaryFrom(start, step); tick <= end; tick += step * MINUTE_MS) {
    ticks.push(tick);
  }
  if (ticks.length === 0 && end - start < MINUTE_MS) {
    const second = Math.round((start + end) / 2000) * 1000;
    if (second >= start && second <= end) {
      ticks.push(second);
    }
  }
  return ticks;
};

const ticksOf = (band, step, start, end) => {
  if (band.unit === 'day') return dayTicks(start, end, step);
  if (band.unit === 'month') return monthTicks(start, end, step);
  return clockTicks(start, end, step);
};

// The label format follows the span: a day shows the hour, a longer span the day, then the month (from 90 days)
const formatOf = (spanBand, tick) => {
  if (spanBand.unit === 'month') return 'MMM YYYY';
  if (spanBand.unit === 'day') return 'D MMM';
  // The first tick after a midnight shows the date too
  const local = dayjs(tick);
  return local.hour() === 0 && local.minute() === 0 ? 'D MMM HH:mm' : 'HH:mm';
};

// The ticks of the time axis for the x range [start, end] (ms) on a strip `width` px wide. Returns the tick position
// as a ratio of the span (0 to 1), its label format and its time (ms). The step is the first in the band's ladder
// whose ticks fit the width: at most floor(width / AXIS_LABEL_PX) of them, and at least AXIS_LABEL_PX apart.
export const timeAxisTicks = ({ start, end, width }) => {
  const span = end - start;
  if (!(span > 0) || !(width > 0)) {
    return [];
  }
  const maxLabels = Math.max(1, Math.floor(width / AXIS_LABEL_PX));
  const spanBand = AXIS_BANDS.find(band => span <= band.maxSpan);
  // The ladder continues into the larger bands when none of this band's steps fits a very narrow strip
  const candidates = AXIS_BANDS.slice(AXIS_BANDS.indexOf(spanBand)).flatMap(band =>
    band.steps.map(step => ({ band, step }))
  );
  const chosen =
    candidates.find(({ band: candidateBand, step }) => {
      const pxPerStep = (width * stepMsOf(candidateBand, step)) / span;
      return pxPerStep >= AXIS_LABEL_PX && ticksOf(candidateBand, step, start, end).length <= maxLabels;
    }) || candidates[candidates.length - 1];
  // The final list keeps each instant once, and drops a tick that sits closer than AXIS_LABEL_PX to the one kept before
  // it. A day or a month is not always the same real length, so its nominal step can fall short by a few pixels
  const spaced = [];
  ticksOf(chosen.band, chosen.step, start, end).forEach(tick => {
    const last = spaced[spaced.length - 1];
    if (last === undefined || ((tick - last) * width) / span >= AXIS_LABEL_PX) {
      spaced.push(tick);
    }
  });
  return spaced.map(tick => ({
    ratio: (tick - start) / span,
    format: formatOf(spanBand, tick),
    time: tick
  }));
};
