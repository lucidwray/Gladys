// Constants of the fork-only Power page (docs/specs/hawray-power-page.md, sections 3, 7 and 13).

// Gladys variable holding the device selector of the mains override (section 3). Empty = auto-detect.
const MAINS_OVERRIDE_VARIABLE = 'HAWRAY_POWER_MAINS_DEVICE';

// Model set by the Emporia bridge on each channel device (maijordomo emporia_bridge/gladys.py:81-95).
const EMPORIA_CHANNEL_MODEL = 'Emporia Vue channel';
const MAINS_EXTERNAL_ID_SUFFIX = ':1-2-3';
// Compared case-insensitively: the Balance slug case is UNVERIFIED (spec section 3).
const BALANCE_EXTERNAL_ID_SUFFIX = ':balance';

// Smallest bucket of the series API in Phase 1: the Emporia sample interval (spec section 7.2).
const MIN_BUCKET_SECONDS = 60;
const AUTO_BUCKET_STEPS_SECONDS = [60, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400];
const MAX_POINTS_PER_SERIES = 1500;
// Request limits of the series API (security review, LOW-1 and LOW-2): the largest bucket is one year,
// a request names at most 64 power features, and its span is at most 400 days.
const MAX_BUCKET_SECONDS = 31536000;
const MAX_FEATURES_PER_SERIES = 64;
const MAX_SPAN_MS = 400 * 24 * 60 * 60 * 1000;

// The kWh of a period is computed on fixed one-minute buckets (spec section 4): a bucket without
// samples counts 0, so a bridge outage lowers the kWh instead of being interpolated.
const KWH_BUCKET_SECONDS = MIN_BUCKET_SECONDS;
const WATT_SECONDS_PER_KWH = 3600 * 1000;

// Buckets are aligned on the Unix epoch, so every feature shares one grid.
const BUCKET_ORIGIN = '1970-01-01T00:00:00Z';

const SCALES = ['live', 'min', 'hr', 'day', 'wk', 'mo', 'yr'];

module.exports = {
  MAINS_OVERRIDE_VARIABLE,
  EMPORIA_CHANNEL_MODEL,
  MAINS_EXTERNAL_ID_SUFFIX,
  BALANCE_EXTERNAL_ID_SUFFIX,
  MIN_BUCKET_SECONDS,
  AUTO_BUCKET_STEPS_SECONDS,
  MAX_POINTS_PER_SERIES,
  MAX_BUCKET_SECONDS,
  MAX_FEATURES_PER_SERIES,
  MAX_SPAN_MS,
  KWH_BUCKET_SECONDS,
  WATT_SECONDS_PER_KWH,
  BUCKET_ORIGIN,
  SCALES,
};
