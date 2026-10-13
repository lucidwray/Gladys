// Period starts of the Power page summary (docs/specs/hawray-power-page.md, section 4): the start of
// the current minute, hour, day, week (Monday), month and year in the house timezone, as UTC instants.
const { SYSTEM_VARIABLE_NAMES, DEFAULT_TIMEZONE } = require('../../utils/constants');
const { getLocalContext, localToUtcMs, addDays, MS_PER_MINUTE } = require('../energy-contract/tariff.time');

/**
 * @description The house timezone: the TIMEZONE system variable, or DEFAULT_TIMEZONE when unset.
 * @param {object} variable - Variable manager.
 * @returns {Promise<string>} An IANA timezone name.
 * @example
 * await getHouseTimezone(gladys.variable); // 'America/New_York'
 */
async function getHouseTimezone(variable) {
  const timezone = await variable.getValue(SYSTEM_VARIABLE_NAMES.TIMEZONE);
  return timezone || DEFAULT_TIMEZONE;
}

/**
 * @description Start of the current minute, hour, day, week, month and year, in a timezone.
 * Weeks start on Monday.
 * @param {number} nowMs - The instant (ms since epoch).
 * @param {string} timezone - IANA timezone name.
 * @returns {object} The period starts { min, hr, day, wk, mo, yr }, as UTC ISO strings.
 * @example
 * getPeriodStarts(Date.now(), 'America/New_York');
 */
function getPeriodStarts(nowMs, timezone) {
  const local = getLocalContext(nowMs, timezone);
  // min and hr come from the UTC instant: the local clock reads the repeated hour twice on a fall-back
  // day, so a wall-clock lookup would pick the first pass. Offsets are whole minutes, so the UTC minute
  // and the local minute match, and the start of the local hour is the instant less the local minute of
  // the hour and the milliseconds since the minute began.
  const msIntoMinute = nowMs % MS_PER_MINUTE;
  const minuteStartMs = nowMs - msIntoMinute;
  const hourStartMs = minuteStartMs - (local.minutes % 60) * MS_PER_MINUTE;
  // weekday: 0 = Sunday ... 6 = Saturday; Monday is 1, so the Monday of the week is (weekday + 6) % 7 days back
  const mondayOffset = (local.weekday + 6) % 7;
  const starts = {
    min: minuteStartMs,
    hr: hourStartMs,
    day: localToUtcMs(local.date, timezone),
    wk: localToUtcMs(addDays(local.date, -mondayOffset), timezone),
    mo: localToUtcMs(`${local.year}-${String(local.month).padStart(2, '0')}-01`, timezone),
    yr: localToUtcMs(`${local.year}-01-01`, timezone),
  };
  return Object.fromEntries(Object.entries(starts).map(([scale, ms]) => [scale, new Date(ms).toISOString()]));
}

module.exports = {
  getHouseTimezone,
  getPeriodStarts,
};
