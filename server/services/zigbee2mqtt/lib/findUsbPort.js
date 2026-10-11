const fs = require('fs');

const BY_ID_PREFIX = '/dev/serial/by-id/';

/**
 * @description Find the USB port matching a stored Zigbee2mqtt driver path. The path can be the kernel path
 * (/dev/ttyACM0), which changes after a reboot, or a stable /dev/serial/by-id/ path.
 * @param {Array} usbList - Ports returned by the USB service.
 * @param {string} driverPath - Stored driver path.
 * @returns {Promise<object|undefined>} The matching port, or undefined.
 * @example
 * const port = await findUsbPort(usbList, '/dev/serial/by-id/usb-ITead_Sonoff-if00');
 */
async function findUsbPort(usbList, driverPath) {
  if (!driverPath) {
    return undefined;
  }

  const exactMatch = usbList.find((port) => port.path === driverPath);
  if (exactMatch) {
    return exactMatch;
  }

  const pnpIdMatch = usbList.find((port) => port.pnpId && `${BY_ID_PREFIX}${port.pnpId}` === driverPath);
  if (pnpIdMatch) {
    return pnpIdMatch;
  }

  if (!driverPath.startsWith(BY_ID_PREFIX)) {
    return undefined;
  }

  let resolvedPath;
  try {
    resolvedPath = await fs.promises.realpath(driverPath);
  } catch (e) {
    // The by-id link is missing (dongle unplugged or renamed): no port can match it
    return undefined;
  }
  return usbList.find((port) => port.path === resolvedPath);
}

module.exports = findUsbPort;
