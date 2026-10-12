const { EVENTS } = require('../../../utils/constants');
const { clearSceneSwitchTimers } = require('./buildSceneSwitchAccessory');

/**
 * @description Reset HomeKit bridge.
 * @returns {Promise} New HomeKit bridge to expose.
 * @example
 * resetBridge()
 */
async function resetBridge() {
  clearSceneSwitchTimers.call(this);
  if (this.notifyCb) {
    this.gladys.event.removeListener(EVENTS.TRIGGERS.CHECK, this.notifyCb);
    this.notifyCb = null;
  }

  if (this.bridge) {
    await this.bridge.destroy();
    this.bridge = null;
  }

  return this.createBridge();
}

module.exports = {
  resetBridge,
};
