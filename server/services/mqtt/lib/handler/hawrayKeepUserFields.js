// fork-only (hawray): the mAIjorDomo bridges resend their device create message on every restart,
// reconnect and every 24 h. Those messages carry an automatic name and no room, so applying them as
// they are overwrote the name and room the owner set in the UI.
const USER_OWNED_DEVICE_FIELDS = ['name', 'room_id'];

/**
 * @description Remove the user-owned fields from a device create message when the device already exists.
 * The stored name and room are kept, every other field is still applied by device.create.
 * @param {object} stateManager - Gladys state manager, holding the devices in RAM by external_id.
 * @param {object} device - The device parsed from the MQTT create message.
 * @returns {object} The message to hand to device.create.
 * @example
 * keepUserFieldsOfExistingDevice(gladys.stateManager, { external_id: 'midea-1', name: 'Midea AC' });
 */
function keepUserFieldsOfExistingDevice(stateManager, device) {
  if (!device || !device.external_id) {
    return device;
  }
  const existingDevice = stateManager.get('deviceByExternalId', device.external_id);
  if (!existingDevice) {
    return device;
  }
  const deviceToCreate = { ...device };
  USER_OWNED_DEVICE_FIELDS.forEach((field) => delete deviceToCreate[field]);
  return deviceToCreate;
}

module.exports = {
  keepUserFieldsOfExistingDevice,
};
