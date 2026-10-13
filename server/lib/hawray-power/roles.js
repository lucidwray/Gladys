// Role detection of the Power page (docs/specs/hawray-power-page.md, section 3): mains, balance,
// circuits and plugs, from the device and feature states of the state manager.
const { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } = require('../../utils/constants');
const {
  MAINS_OVERRIDE_VARIABLE,
  EMPORIA_CHANNEL_MODEL,
  MAINS_EXTERNAL_ID_SUFFIX,
  BALANCE_EXTERNAL_ID_SUFFIX,
} = require('./constants');
const { BadParameters } = require('../../utils/coreErrors');

/**
 * @description Is the feature a power feature the page can show: `energy-sensor/power` or `switch/power`.
 * @param {object} feature - Device feature state.
 * @returns {boolean} True for a power feature.
 * @example
 * isPowerFeature({ category: 'switch', type: 'power' }); // true
 */
function isPowerFeature(feature) {
  return (
    (feature.category === DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR ||
      feature.category === DEVICE_FEATURE_CATEGORIES.SWITCH) &&
    feature.type === DEVICE_FEATURE_TYPES.ENERGY_SENSOR.POWER
  );
}

/**
 * @description The power feature of a device: its `energy-sensor/power` first, then its `switch/power`.
 * @param {object} device - Device state, with its `features`.
 * @returns {object|null} The power feature or null.
 * @example
 * findPowerFeature(device);
 */
function findPowerFeature(device) {
  const features = device.features || [];
  return (
    features.find(
      (feature) =>
        feature.category === DEVICE_FEATURE_CATEGORIES.ENERGY_SENSOR &&
        feature.type === DEVICE_FEATURE_TYPES.ENERGY_SENSOR.POWER,
    ) ||
    features.find(
      (feature) =>
        feature.category === DEVICE_FEATURE_CATEGORIES.SWITCH && feature.type === DEVICE_FEATURE_TYPES.SWITCH.POWER,
    ) ||
    null
  );
}

/**
 * @description Build the role entry of a device and its power feature.
 * @param {object} device - Device state.
 * @param {object} feature - Its power feature.
 * @returns {object} The role: device_selector, device_name, power_feature_selector, power_feature_name.
 * @example
 * toRole(device, feature);
 */
function toRole(device, feature) {
  return {
    device_selector: device.selector,
    device_name: device.name,
    power_feature_selector: feature.selector,
    power_feature_name: feature.name,
  };
}

/**
 * @description Read the mains override variable (`HAWRAY_POWER_MAINS_DEVICE`).
 * @param {object} variable - Variable manager.
 * @returns {Promise<string|null>} The device selector, or null when auto-detect applies.
 * @example
 * await getMainsOverride(gladys.variable);
 */
async function getMainsOverride(variable) {
  const value = await variable.getValue(MAINS_OVERRIDE_VARIABLE);
  return value || null;
}

/**
 * @description Check that a device selector can be the mains: an existing device with a power feature.
 * @param {object} stateManager - State manager.
 * @param {string} selector - Device selector.
 * @returns {object} The device state (its power feature is checked here too).
 * @throws {BadParameters} When the device does not exist or has no power feature.
 * @example
 * validateMainsDevice(stateManager, 'emporia-main');
 */
function validateMainsDevice(stateManager, selector) {
  const device = stateManager.get('device', selector);
  if (device === null) {
    throw new BadParameters(`Unknown device selector: ${selector}`);
  }
  if (findPowerFeature(device) === null) {
    throw new BadParameters(`Device ${selector} has no power feature`);
  }
  return device;
}

/**
 * @description Detect the roles of the Power page. The override device wins for mains when it is
 * valid; otherwise the Emporia channel whose external_id ends in `:1-2-3` is the mains. Balance is
 * the Emporia channel ending in `:balance` (case-insensitive). The other Emporia channels are the
 * circuits; every other power feature is a plug.
 * @param {object} stateManager - State manager.
 * @param {string|null} overrideSelector - The mains override (null for auto-detect).
 * @returns {object} { mains_source, mains, balance, circuits, plugs } (roles, or null / arrays).
 * @example
 * detectRoles(stateManager, null);
 */
function detectRoles(stateManager, overrideSelector) {
  const devices = stateManager
    .getAllKeys('device')
    .sort()
    .map((selector) => stateManager.get('device', selector))
    .filter((device) => device !== null);

  const emporiaChannels = devices.filter(
    (device) => device.model === EMPORIA_CHANNEL_MODEL && findPowerFeature(device) !== null,
  );

  const overrideDevice = overrideSelector ? stateManager.get('device', overrideSelector) : null;
  const overrideIsValid = overrideDevice !== null && findPowerFeature(overrideDevice) !== null;

  let mainsDevice = null;
  let mainsSource = null;
  if (overrideIsValid) {
    mainsDevice = overrideDevice;
    mainsSource = 'override';
  } else {
    mainsDevice = emporiaChannels.find((device) => device.external_id.endsWith(MAINS_EXTERNAL_ID_SUFFIX)) || null;
    mainsSource = mainsDevice === null ? null : 'auto';
  }

  const balanceDevice =
    emporiaChannels.find(
      (device) => device !== mainsDevice && device.external_id.toLowerCase().endsWith(BALANCE_EXTERNAL_ID_SUFFIX),
    ) || null;

  const circuitDevices = emporiaChannels.filter((device) => device !== mainsDevice && device !== balanceDevice);

  const circuits = circuitDevices.map((device) => toRole(device, findPowerFeature(device)));
  const mains = mainsDevice === null ? null : toRole(mainsDevice, findPowerFeature(mainsDevice));
  const balance = balanceDevice === null ? null : toRole(balanceDevice, findPowerFeature(balanceDevice));

  const classified = new Set(
    [mains, balance, ...circuits].filter((role) => role !== null).map((role) => role.power_feature_selector),
  );
  const plugs = [];
  devices.forEach((device) => {
    device.features.filter(isPowerFeature).forEach((feature) => {
      if (!classified.has(feature.selector)) {
        plugs.push(toRole(device, feature));
      }
    });
  });

  return { mains_source: mainsSource, mains, balance, circuits, plugs };
}

module.exports = {
  isPowerFeature,
  findPowerFeature,
  getMainsOverride,
  validateMainsDevice,
  detectRoles,
};
