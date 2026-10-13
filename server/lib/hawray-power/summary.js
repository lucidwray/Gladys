// Power page summary (docs/specs/hawray-power-page.md, sections 4 and 7.3): the detected roles, the
// mains override, the period starts in the house timezone and the table values of one scale.
const db = require('../../models');
const { BadParameters } = require('../../utils/coreErrors');
const { SCALES, KWH_BUCKET_SECONDS, WATT_SECONDS_PER_KWH, BUCKET_ORIGIN } = require('./constants');
const { getHouseTimezone, getPeriodStarts } = require('./period');
const { getMainsOverride, detectRoles } = require('./roles');

// kWh of each feature over [from, to): sum over one-minute buckets of the bucket average power, times the
// bucket length. A bucket without samples contributes 0 (spec section 4).
const KWH_QUERY = (placeholders) => `
  SELECT
      device_feature_id,
      SUM(bucket_avg_w) AS sum_avg_w
  FROM (
      SELECT
          device_feature_id,
          time_bucket(INTERVAL ${KWH_BUCKET_SECONDS} SECOND, created_at, CAST(? AS TIMESTAMPTZ)) AS slot,
          AVG(value) AS bucket_avg_w
      FROM
          t_device_feature_state
      WHERE device_feature_id IN (${placeholders})
      AND created_at >= CAST(? AS TIMESTAMPTZ)
      AND created_at < CAST(? AS TIMESTAMPTZ)
      GROUP BY device_feature_id, slot
  ) buckets
  GROUP BY device_feature_id
`;

/**
 * @description Compute the kWh of each feature for a period so far.
 * @param {Array<string>} featureIds - Device feature ids.
 * @param {string} fromIso - Period start (UTC ISO).
 * @param {string} toIso - Now (UTC ISO).
 * @returns {Promise<Map<string, number>>} The kWh by feature id. Features without samples are absent.
 * @example
 * await getKwhByFeatureId(['…'], '2026-10-01T04:00:00.000Z', '2026-10-13T12:00:00.000Z');
 */
async function getKwhByFeatureId(featureIds, fromIso, toIso) {
  const kwhByFeatureId = new Map();
  if (featureIds.length === 0) {
    return kwhByFeatureId;
  }
  const placeholders = featureIds.map(() => '?').join(', ');
  const rows = await db.duckDbReadConnectionAllAsync(
    KWH_QUERY(placeholders),
    BUCKET_ORIGIN,
    ...featureIds,
    fromIso,
    toIso,
  );
  rows.forEach((row) => {
    kwhByFeatureId.set(row.device_feature_id, (Number(row.sum_avg_w) * KWH_BUCKET_SECONDS) / WATT_SECONDS_PER_KWH);
  });
  return kwhByFeatureId;
}

/**
 * @description Build the Power page summary for one scale.
 * @param {object} deps - `stateManager` and `variable` (the Gladys managers).
 * @param {string} scale - Live, min, hr, day, wk, mo or yr.
 * @param {object} [options] - `nowMs` overrides the clock (tests).
 * @returns {Promise<object>} The summary (roles, override, period starts, values).
 * @throws {BadParameters} When the scale is unknown.
 * @example
 * await getSummary({ stateManager, variable }, 'day');
 */
async function getSummary(deps, scale, options = {}) {
  if (!SCALES.includes(scale)) {
    throw new BadParameters(`Invalid scale parameter. Must be one of: ${SCALES.join(', ')}`);
  }
  const { stateManager, variable } = deps;
  const nowMs = options.nowMs === undefined ? Date.now() : options.nowMs;
  const timezone = await getHouseTimezone(variable);
  const periodStarts = getPeriodStarts(nowMs, timezone);
  const mainsOverride = await getMainsOverride(variable);
  const roles = detectRoles(stateManager, mainsOverride);

  const entries = [
    ...(roles.mains ? [['mains', roles.mains]] : []),
    ...(roles.balance ? [['balance', roles.balance]] : []),
    ...roles.circuits.map((role) => ['circuit', role]),
    ...roles.plugs.map((role) => ['plug', role]),
  ];
  const features = entries.map(([, role]) => stateManager.get('deviceFeature', role.power_feature_selector));

  let kwhByFeatureId = new Map();
  if (scale !== 'live') {
    kwhByFeatureId = await getKwhByFeatureId(
      features.map((feature) => feature.id),
      periodStarts[scale],
      new Date(nowMs).toISOString(),
    );
  }

  const rows = entries.map(([role, power], index) => {
    const feature = features[index];
    return {
      role,
      device_selector: power.device_selector,
      name: power.device_name,
      power_feature_selector: power.power_feature_selector,
      last_value: feature.last_value,
      last_value_changed: feature.last_value_changed,
      kwh: scale === 'live' ? null : kwhByFeatureId.get(feature.id) || 0,
    };
  });

  return {
    scale,
    timezone,
    period_starts: periodStarts,
    // the stored override, only when it is the one in effect (valid and used for mains)
    mains_override: roles.mains_source === 'override' ? mainsOverride : null,
    roles: rows,
  };
}

module.exports = {
  getSummary,
  getKwhByFeatureId,
};
