import dayjs from 'dayjs';
import get from 'get-value';

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '../../../../server/utils/constants';
import { checkAndConvertUnit } from '../../../../server/utils/units';

export const BINARY_TYPE = DEVICE_FEATURE_TYPES.LIGHT.BINARY;
const BRIGHTNESS_TYPE = DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS;
const COLOR_TYPE = DEVICE_FEATURE_TYPES.LIGHT.COLOR;
const PUSH_TYPE = DEVICE_FEATURE_TYPES.BUTTON.PUSH;

// Values whose params hold a credential: shown masked on the device page
const SECRET_PARAM_NAME = /password|token|secret|key/i;

// Ranges of the history charts and of the log, the same windows for both
export const RANGES = [
  { key: '24h', interval: 'last-day', hours: 24 },
  { key: '7d', interval: 'last-week', hours: 7 * 24 },
  { key: '30d', interval: 'last-month', hours: 30 * 24 }
];

export const DEFAULT_RANGE_KEY = '24h';

export const getRange = key => RANGES.find(range => range.key === key) || RANGES[0];

export const isBinaryFeature = feature => feature.type === BINARY_TYPE;

export const isWritableBinaryFeature = feature => isBinaryFeature(feature) && feature.read_only === false;

// Numeric features: a binary switch, a colour or a button press is not a quantity a chart can draw,
// and a text feature (dynamic select) holds a string
export const isChartableFeature = feature =>
  feature.category !== DEVICE_FEATURE_CATEGORIES.TEXT && ![BINARY_TYPE, COLOR_TYPE, PUSH_TYPE].includes(feature.type);

export const hasFeatureValue = feature => feature.last_value !== null && feature.last_value !== undefined;

// A dynamic select holds a string state: its value lives in last_value_string
const isTextSelectFeature = feature =>
  feature.category === DEVICE_FEATURE_CATEGORIES.TEXT && feature.type === DEVICE_FEATURE_TYPES.TEXT.SELECT;

// Same rule as DevicesBox: the branch is on the FEATURE, not on the type of the value
export const getValuePatch = (feature, lastValue, lastValueChanged) => {
  if (isTextSelectFeature(feature)) {
    return { last_value_string: `${lastValue}`, last_value_changed: lastValueChanged };
  }
  return { last_value: lastValue, last_value_changed: lastValueChanged };
};

export const patchFeature = (features, selector, patch) =>
  features.map(feature => (feature.selector === selector ? { ...feature, ...patch } : feature));

// Applies a value received from the websocket or set by the user to the matching feature
export const applyFeatureValue = (features, selector, lastValue, lastValueChanged) =>
  features.map(feature =>
    feature.selector === selector ? { ...feature, ...getValuePatch(feature, lastValue, lastValueChanged) } : feature
  );

// Same as applyFeatureValue, for a NEW_STRING_STATE event
export const applyFeatureString = (features, selector, lastValueString, lastValueChanged) =>
  patchFeature(features, selector, { last_value_string: lastValueString, last_value_changed: lastValueChanged });

// The device list: only the devices holding the feature are rebuilt
export const applyDeviceFeatureValue = (devices, selector, lastValue, lastValueChanged) =>
  devices.map(device =>
    device.features.some(feature => feature.selector === selector)
      ? { ...device, features: applyFeatureValue(device.features, selector, lastValue, lastValueChanged) }
      : device
  );

export const applyDeviceFeatureString = (devices, selector, lastValueString, lastValueChanged) =>
  devices.map(device =>
    device.features.some(feature => feature.selector === selector)
      ? { ...device, features: applyFeatureString(device.features, selector, lastValueString, lastValueChanged) }
      : device
  );

// Light panel state of a device: on as soon as one writable light is on (the all-lights switch)
export const getLightStatus = features =>
  features.some(
    feature =>
      feature.category === DEVICE_FEATURE_CATEGORIES.LIGHT &&
      isWritableBinaryFeature(feature) &&
      feature.last_value === 1
  )
    ? 1
    : 0;

// The values of the numeric features are rounded for display, whole numbers stay whole
const roundValue = value => (Number.isInteger(value) ? value : Math.round(value * 100) / 100);

/**
 * @description Formats the last value of a feature for display.
 * @param {object} feature - The device feature, with its last value.
 * @param {object} options - The user preferences and the i18n dictionary.
 * @returns {string|null} The displayed value, or null when the feature has no value yet.
 * @example formatFeatureValue({ type: 'binary', last_value: 1 }, { dictionary }); // 'On'
 */
export const formatFeatureValue = (feature, { user, dictionary }) => {
  if (isTextSelectFeature(feature)) {
    return feature.last_value_string || null;
  }
  if (!hasFeatureValue(feature)) {
    return null;
  }
  if (isBinaryFeature(feature)) {
    return get(dictionary, feature.last_value === 1 ? 'deviceFeatureValueText.on' : 'deviceFeatureValueText.off');
  }
  const { value, unit } = checkAndConvertUnit(feature.last_value, feature.unit, user && user.distance_unit_preference);
  const shortUnit = unit ? get(dictionary, `deviceFeatureUnitShort.${unit}`) : null;
  return shortUnit ? `${roundValue(value)} ${shortUnit}` : `${roundValue(value)}`;
};

/**
 * @description Builds the one-line state of a device for the list: its switch state with the brightness when
 * it has one, else its first value, else the time it was last seen.
 * @param {Array} features - The features of the device.
 * @param {object} options - The user preferences and the i18n dictionary.
 * @returns {object} { binary, text } or { lastSeen } (a date) or { empty: true }.
 * @example getDeviceSummary(device.features, { user, dictionary });
 */
export const getDeviceSummary = (features, options) => {
  const binary = features.find(isWritableBinaryFeature);
  if (binary) {
    const brightness = features.find(feature => feature.type === BRIGHTNESS_TYPE && hasFeatureValue(feature));
    const binaryText = formatFeatureValue(binary, options);
    const brightnessText = brightness ? formatFeatureValue(brightness, options) : null;
    return { binary, text: brightnessText ? `${binaryText} · ${brightnessText}` : binaryText };
  }
  const valued = features.find(feature => isChartableFeature(feature) && hasFeatureValue(feature));
  if (valued) {
    return { text: formatFeatureValue(valued, options) };
  }
  const lastChanged = features.reduce((latest, feature) => {
    if (!feature.last_value_changed) {
      return latest;
    }
    return !latest || new Date(feature.last_value_changed) > new Date(latest) ? feature.last_value_changed : latest;
  }, null);
  return lastChanged ? { lastSeen: lastChanged } : { empty: true };
};

// Icon of a device: its switch when it has one, else its first feature
export const getDeviceIconFeature = features => features.find(isWritableBinaryFeature) || features[0] || {};

export const isSecretParam = name => SECRET_PARAM_NAME.test(name || '');

export const formatAbsoluteDate = (date, language) =>
  dayjs(date)
    .locale(language || 'en')
    .format('D MMM YYYY, HH:mm:ss');

const NO_ROOM = 'no-room';

/**
 * @description Groups devices by room, following the order of the rooms. Devices without a known room come last.
 * @param {Array} devices - The devices to group.
 * @param {Array} rooms - The rooms of the house.
 * @returns {Array} The groups: { key, name, devices }, the name being null for devices without room.
 * @example groupDevicesByRoom(devices, rooms);
 */
export const groupDevicesByRoom = (devices, rooms) => {
  const roomIds = new Set(rooms.map(room => room.id));
  const byRoom = new Map();
  devices.forEach(device => {
    const key = device.room_id && roomIds.has(device.room_id) ? device.room_id : NO_ROOM;
    if (!byRoom.has(key)) {
      byRoom.set(key, []);
    }
    byRoom.get(key).push(device);
  });
  const groups = rooms
    .filter(room => byRoom.has(room.id))
    .map(room => ({ key: room.id, name: room.name, devices: byRoom.get(room.id) }));
  if (byRoom.has(NO_ROOM)) {
    groups.push({ key: NO_ROOM, name: null, devices: byRoom.get(NO_ROOM) });
  }
  groups.forEach(group =>
    group.devices.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }))
  );
  return groups;
};

export const matchesSearch = (device, search) => {
  const query = search.trim().toLowerCase();
  if (!query.length) {
    return true;
  }
  return [device.name, device.selector, device.external_id].some(value => value && value.toLowerCase().includes(query));
};

// Identity of a history entry: the same state received live and read back from the history is one entry
export const getLogEntryKey = (createdAt, featureId) => `${new Date(createdAt).getTime()}-${featureId}`;
