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

// Live update of the charts: the raw sample is pushed at the right edge until the next series fetch (spec §8)
export const appendSeriesPoint = (series, payload) => {
  const selector = payload.device_feature_selector;
  if (!series || !Object.prototype.hasOwnProperty.call(series, selector)) {
    return series;
  }
  const point = {
    t: payload.last_value_changed || new Date().toISOString(),
    avg_w: payload.last_value
  };
  return { ...series, [selector]: [...series[selector], point] };
};

// ApexCharts data: [epoch ms, W], clamped at 0 (spec §4)
export const toChartPoints = points => (points || []).map(point => [Date.parse(point.t), clampValue(point.avg_w)]);

export const seriesOf = (series, selector) => (series && series[selector]) || [];

// Whether the chart lines changed: compared by reference of their points, so an unchanged chart is not redrawn
export const linesChanged = (previous, next) =>
  previous.length !== next.length ||
  next.some((line, index) => line.name !== previous[index].name || line.points !== previous[index].points);
