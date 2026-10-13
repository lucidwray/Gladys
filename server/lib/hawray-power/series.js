// Time-bucketed power series of the Power page (docs/specs/hawray-power-page.md, section 7.2).
const db = require('../../models');
const { BadParameters } = require('../../utils/coreErrors');
const {
  MIN_BUCKET_SECONDS,
  AUTO_BUCKET_STEPS_SECONDS,
  MAX_POINTS_PER_SERIES,
  MAX_BUCKET_SECONDS,
  MAX_FEATURES_PER_SERIES,
  MAX_SPAN_MS,
  BUCKET_ORIGIN,
} = require('./constants');
const { isPowerFeature } = require('./roles');

const SERIES_QUERY = (bucketSeconds, placeholders) => `
  SELECT
      device_feature_id,
      epoch_ms(time_bucket(INTERVAL ${bucketSeconds} SECOND, created_at, CAST(? AS TIMESTAMPTZ))) AS slot,
      AVG(value) AS avg_w
  FROM
      t_device_feature_state
  WHERE device_feature_id IN (${placeholders})
  AND created_at >= CAST(? AS TIMESTAMPTZ)
  AND created_at < CAST(? AS TIMESTAMPTZ)
  GROUP BY device_feature_id, slot
  ORDER BY device_feature_id, slot
`;

/**
 * @description Number of buckets of a width that can hold samples of [from, to].
 * @param {number} fromMs - Window start (ms).
 * @param {number} toMs - Window end (ms).
 * @param {number} bucketSeconds - Bucket width (s).
 * @returns {number} The bucket count on the epoch-aligned grid.
 * @example
 * pointCount(0, 86400000, 3600); // 25
 */
function pointCount(fromMs, toMs, bucketSeconds) {
  const widthMs = bucketSeconds * 1000;
  return Math.floor(toMs / widthMs) - Math.floor(fromMs / widthMs) + 1;
}

/**
 * @description Parse an ISO date query parameter.
 * @param {*} value - The raw parameter.
 * @param {string} name - Parameter name, for the error message.
 * @returns {Date} The parsed date.
 * @throws {BadParameters} When it is missing or not a date.
 * @example
 * parseDateParameter('2026-10-12T00:00:00Z', 'from');
 */
function parseDateParameter(value, name) {
  const date = typeof value === 'string' && value !== '' ? new Date(value) : null;
  if (date === null || Number.isNaN(date.getTime())) {
    throw new BadParameters(`Invalid ${name} parameter. Must be an ISO date.`);
  }
  return date;
}

/**
 * @description Parse the comma-separated feature selectors and check that each one exists.
 * @param {*} value - The raw `features` parameter.
 * @param {object} stateManager - State manager.
 * @returns {Array<object>} The distinct device feature states, in request order.
 * @throws {BadParameters} When the list is empty or a selector is unknown.
 * @example
 * parseFeatures('a,b', stateManager);
 */
function parseFeatures(value, stateManager) {
  const selectors =
    typeof value === 'string'
      ? [
          ...new Set(
            value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          ),
        ]
      : [];
  if (selectors.length === 0) {
    throw new BadParameters('Invalid features parameter. Must be a non-empty comma-separated list.');
  }
  if (selectors.length > MAX_FEATURES_PER_SERIES) {
    throw new BadParameters(`Invalid features parameter. At most ${MAX_FEATURES_PER_SERIES} features per request.`);
  }
  return selectors.map((selector) => {
    const feature = stateManager.get('deviceFeature', selector);
    if (feature === null) {
      throw new BadParameters(`Unknown device feature selector: ${selector}`);
    }
    if (!isPowerFeature(feature)) {
      throw new BadParameters(`Device feature ${selector} is not a power feature`);
    }
    return feature;
  });
}

/**
 * @description Resolve the bucket width: the parameter when given (an integer of at least
 * MIN_BUCKET_SECONDS whose grid stays under the point cap), otherwise the smallest automatic step
 * that keeps the window under the point cap.
 * @param {*} value - The raw `bucket` parameter (may be undefined).
 * @param {number} fromMs - Window start (ms).
 * @param {number} toMs - Window end (ms).
 * @returns {number} The bucket width in seconds.
 * @throws {BadParameters} When the bucket is invalid or the window needs too many points.
 * @example
 * resolveBucketSeconds(undefined, from, to); // 60 for 24 h
 */
function resolveBucketSeconds(value, fromMs, toMs) {
  if (value === undefined || value === null || value === '') {
    const step = AUTO_BUCKET_STEPS_SECONDS.find((s) => pointCount(fromMs, toMs, s) <= MAX_POINTS_PER_SERIES);
    if (step === undefined) {
      throw new BadParameters(`The window is too long: more than ${MAX_POINTS_PER_SERIES} points per series.`);
    }
    return step;
  }
  const bucketSeconds = Number(value);
  if (!Number.isInteger(bucketSeconds) || bucketSeconds < MIN_BUCKET_SECONDS) {
    throw new BadParameters(`Invalid bucket parameter. Must be an integer of at least ${MIN_BUCKET_SECONDS} seconds.`);
  }
  if (bucketSeconds > MAX_BUCKET_SECONDS) {
    throw new BadParameters(`Invalid bucket parameter. Must be at most ${MAX_BUCKET_SECONDS} seconds.`);
  }
  if (pointCount(fromMs, toMs, bucketSeconds) > MAX_POINTS_PER_SERIES) {
    throw new BadParameters(`Invalid bucket parameter. More than ${MAX_POINTS_PER_SERIES} points per series.`);
  }
  return bucketSeconds;
}

/**
 * @description Average power per time bucket for several features, on one shared grid. Empty buckets
 * are omitted; values are raw (not clamped).
 * @param {object} stateManager - State manager (feature lookup).
 * @param {object} params - Raw query parameters: `features`, `from`, `to`, `bucket` (optional).
 * @returns {Promise<object>} { bucket_seconds, series: { [selector]: [{ t, avg_w }] } }.
 * @example
 * await getSeries(stateManager, { features: 'a,b', from: '...', to: '...' });
 */
async function getSeries(stateManager, params = {}) {
  const features = parseFeatures(params.features, stateManager);
  const from = parseDateParameter(params.from, 'from');
  const to = parseDateParameter(params.to, 'to');
  if (from.getTime() >= to.getTime()) {
    throw new BadParameters('Invalid from/to parameters. from must be before to.');
  }
  if (to.getTime() - from.getTime() > MAX_SPAN_MS) {
    throw new BadParameters('Invalid from/to parameters. The span must be at most 400 days.');
  }
  const bucketSeconds = resolveBucketSeconds(params.bucket, from.getTime(), to.getTime());

  const placeholders = features.map(() => '?').join(', ');
  const rows = await db.duckDbReadConnectionAllAsync(
    SERIES_QUERY(bucketSeconds, placeholders),
    BUCKET_ORIGIN,
    ...features.map((feature) => feature.id),
    from.toISOString(),
    to.toISOString(),
  );

  const pointsByFeatureId = new Map(features.map((feature) => [feature.id, []]));
  rows.forEach((row) => {
    pointsByFeatureId.get(row.device_feature_id).push({
      t: new Date(Number(row.slot)).toISOString(),
      avg_w: row.avg_w,
    });
  });

  const series = {};
  features.forEach((feature) => {
    series[feature.selector] = pointsByFeatureId.get(feature.id);
  });
  return {
    bucket_seconds: bucketSeconds,
    series,
  };
}

module.exports = {
  getSeries,
  pointCount,
  resolveBucketSeconds,
  parseDateParameter,
  parseFeatures,
};
