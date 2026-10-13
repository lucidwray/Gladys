import dayjs from 'dayjs';

// Demo of the Power page (spec §11): a mains meter, the Balance channel, six circuits and two plugs. Every value is
// a function of the time, so the series, the last values and the kWh of a period agree with each other. The demo
// session pushes no websocket event: the live path is covered by the page's own tests (see the smoke test).

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const BUCKET_STEPS_SECONDS = [60, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400];
const POINT_CAP = 1500;

// `on` minutes out of every `cycle` minutes, at `watts`: a switching appliance
const cycling = (t, cycle, on, watts) => (Math.floor(t / MINUTE) % cycle < on ? watts : 0);

const CIRCUITS = {
  'demo-power-oven': t => cycling(t, 360, 30, 2400),
  'demo-power-dishwasher': t => cycling(t, 135, 45, 1840),
  'demo-power-water-heater': t => cycling(t, 120, 25, 4000),
  'demo-power-hvac': t => 700 + 450 * Math.sin(t / (3 * HOUR)),
  'demo-power-fridge': t => 60 + 40 * Math.sin(t / (25 * MINUTE)),
  'demo-power-lighting': t => 90 + 60 * Math.sin(t / (8 * HOUR))
};

// Balance: what the circuits do not account for (the Emporia Balance channel)
const balance = t => 120 + 50 * Math.sin(t / (2 * HOUR));

const WATTS = {
  ...CIRCUITS,
  'demo-power-balance': balance,
  'demo-power-plug-office': t => 165 + 20 * Math.sin(t / (40 * MINUTE)),
  'demo-power-plug-tv': t => 80 + 15 * Math.sin(t / (90 * MINUTE)),
  // The mains is the sum of the circuits and the balance: the plugs sit downstream of a circuit
  'demo-power-mains': t => Object.values(CIRCUITS).reduce((sum, circuit) => sum + circuit(t), 0) + balance(t)
};

// Roles as the server detects them (spec §3): one mains, one balance, the circuits and the plugs
const ROLES = [
  { role: 'mains', device_selector: 'demo-power-meter', name: 'Mains', power_feature_selector: 'demo-power-mains' },
  {
    role: 'balance',
    device_selector: 'demo-power-meter',
    name: 'Balance',
    power_feature_selector: 'demo-power-balance'
  },
  { role: 'circuit', device_selector: 'demo-circuit-oven', name: 'Oven', power_feature_selector: 'demo-power-oven' },
  {
    role: 'circuit',
    device_selector: 'demo-circuit-dishwasher',
    name: 'Dishwasher',
    power_feature_selector: 'demo-power-dishwasher'
  },
  {
    role: 'circuit',
    device_selector: 'demo-circuit-water-heater',
    name: 'Water heater',
    power_feature_selector: 'demo-power-water-heater'
  },
  {
    role: 'circuit',
    device_selector: 'demo-circuit-hvac',
    name: 'Heat pump',
    power_feature_selector: 'demo-power-hvac'
  },
  {
    role: 'circuit',
    device_selector: 'demo-circuit-fridge',
    name: 'Fridge',
    power_feature_selector: 'demo-power-fridge'
  },
  {
    role: 'circuit',
    device_selector: 'demo-circuit-lighting',
    name: 'Lighting',
    power_feature_selector: 'demo-power-lighting'
  },
  {
    role: 'plug',
    device_selector: 'demo-plug-office',
    name: 'Office plug',
    power_feature_selector: 'demo-power-plug-office'
  },
  { role: 'plug', device_selector: 'demo-plug-tv', name: 'TV plug', power_feature_selector: 'demo-power-plug-tv' }
];

// The mains override the settings panel stored (spec §3): null is auto-detection
let mainsOverride = null;

// Start of the current period, in the browser's zone, weeks from Monday (spec §4)
const periodStart = (scale, now) => {
  const day = dayjs(now);
  switch (scale) {
    case 'min':
      return day.startOf('minute');
    case 'hr':
      return day.startOf('hour');
    case 'day':
      return day.startOf('day');
    case 'wk':
      return day.startOf('day').subtract((day.day() + 6) % 7, 'day');
    case 'mo':
      return day.startOf('month');
    case 'yr':
      return day.startOf('year');
    default:
      return null;
  }
};

// kWh of the period so far: the average power of each step times its length. A demo estimate: the step grows
// for the long periods, so a year stays a few tens of thousands of steps
const kwhSince = (watts, startMs, endMs) => {
  const spanSeconds = (endMs - startMs) / 1000;
  const stepSeconds = spanSeconds > 7 * 24 * 3600 ? 900 : 60;
  let wattHours = 0;
  for (let t = startMs; t < endMs; t += stepSeconds * 1000) {
    wattHours += watts(t + (stepSeconds * 1000) / 2) * stepSeconds;
  }
  return wattHours / 3600000;
};

const roundWatts = value => Math.round(value * 10) / 10;

const getPowerSummary = (query = {}) => {
  const scale = query.scale || 'live';
  const now = Date.now();
  const period_starts = {};
  ['min', 'hr', 'day', 'wk', 'mo', 'yr'].forEach(key => {
    period_starts[key] = periodStart(key, now).toISOString();
  });
  return {
    scale,
    timezone: 'Europe/Paris',
    period_starts,
    mains_override: mainsOverride,
    roles: ROLES.map(role => {
      const watts = WATTS[role.power_feature_selector];
      const start = periodStart(scale, now);
      return {
        ...role,
        last_value: roundWatts(watts(now)),
        last_value_changed: new Date(now).toISOString(),
        kwh: start ? Number(kwhSince(watts, start.valueOf(), now).toFixed(4)) : null
      };
    })
  };
};

// Bucket of the series: the smallest step giving at most POINT_CAP points (spec §7.2)
const autoBucketSeconds = spanSeconds => BUCKET_STEPS_SECONDS.find(step => spanSeconds / step <= POINT_CAP) || 86400;

const getPowerSeries = (query = {}) => {
  const features = (query.features || '').split(',').filter(selector => selector.length > 0);
  const fromMs = Date.parse(query.from);
  const toMs = Date.parse(query.to);
  const bucketSeconds = Number(query.bucket) || autoBucketSeconds((toMs - fromMs) / 1000);
  const stepMs = bucketSeconds * 1000;
  const series = {};
  features.forEach(selector => {
    const watts = WATTS[selector];
    const points = [];
    if (watts) {
      for (let t = Math.ceil(fromMs / stepMs) * stepMs; t < toMs; t += stepMs) {
        points.push({ t: new Date(t).toISOString(), avg_w: roundWatts(watts(t + stepMs / 2)) });
      }
    }
    series[selector] = points;
  });
  return { bucket_seconds: bucketSeconds, series };
};

const setPowerSettings = body => {
  mainsOverride = body.mains_device_selector || null;
  return { mains_override: mainsOverride };
};

export const powerFixtures = {
  'get /api/v1/hawray/power/summary': getPowerSummary,
  'get /api/v1/hawray/power/series': getPowerSeries,
  'post /api/v1/hawray/power/settings': setPowerSettings
};
