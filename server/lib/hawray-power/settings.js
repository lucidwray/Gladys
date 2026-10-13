// Write side of the Power page (docs/specs/hawray-power-page.md, section 7.3): the mains override.
const { MAINS_OVERRIDE_VARIABLE } = require('./constants');
const { validateMainsDevice } = require('./roles');
const { BadParameters } = require('../../utils/coreErrors');

/**
 * @description Set or clear the mains override (`HAWRAY_POWER_MAINS_DEVICE`). An empty selector
 * clears it, so auto-detection applies again.
 * @param {object} deps - `stateManager` and `variable` (the Gladys managers).
 * @param {*} selector - The device selector, or null / '' to clear.
 * @returns {Promise<object>} { mains_device_selector } (null when cleared).
 * @throws {BadParameters} When the selector is not a string or is not a device with a power feature.
 * @example
 * await setMainsOverride({ stateManager, variable }, 'emporia-main');
 */
async function setMainsOverride(deps, selector) {
  const { stateManager, variable } = deps;
  if (selector === undefined || selector === null || selector === '') {
    await variable.setValue(MAINS_OVERRIDE_VARIABLE, '');
    return { mains_device_selector: null };
  }
  if (typeof selector !== 'string') {
    throw new BadParameters('Invalid mains_device_selector. Must be a device selector or empty.');
  }
  validateMainsDevice(stateManager, selector);
  await variable.setValue(MAINS_OVERRIDE_VARIABLE, selector);
  return { mains_device_selector: selector };
}

module.exports = {
  setMainsOverride,
};
