import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS
} from '../../../../../server/utils/constants';
import {
  kelvinToTemperatureValue,
  temperatureValueToKelvin
} from '../device-in-room/device-features/light/lightFeatures';
import { convertTemperature } from '../../../utils/hawrayTemperature';

// Pure logic of the group control widget: grouping the features of several devices by type, reading
// one aggregate value from them, and spreading a value written on the aggregate back to every member.
// No rendering and no network here.

// The virtual device the group is rendered through: the existing device rows only need one device
// carrying one feature per type.
export const GROUP_DEVICE_ID = 'hawray-group';

const GROUP_FEATURE_PREFIX = 'hawray-group';

export const AGGREGATE_KIND = {
  // on/off: the group is on when any member is on
  BINARY: 'binary',
  // a relative level (a share of the range): each member is read and written through its own range
  RELATIVE: 'relative',
  // a physical setpoint or current: the value is sent as it is, clamped to each member's bounds
  PHYSICAL: 'physical',
  // a light color temperature: converted through kelvins, since integrations use mireds, kelvins or a ratio
  KELVIN: 'kelvin',
  // anything else (color, mode, select...): the group shows the member changed last, and a write is
  // sent unchanged to every member
  LATEST: 'latest'
};

// Every category names its on/off type 'binary', so this one constant covers all of them.
const BINARY_TYPE = DEVICE_FEATURE_TYPES.LIGHT.BINARY;

const getKey = (category, type) => `${category}.${type}`;

// A relative level has no physical unit: the same share of the range is the same effect on every lamp,
// whatever its range (50 % brightness is 127 on a 0-254 lamp and 50 on a 0-100 one).
const RELATIVE_KEYS = new Set([
  getKey(DEVICE_FEATURE_CATEGORIES.LIGHT, DEVICE_FEATURE_TYPES.LIGHT.BRIGHTNESS),
  getKey(DEVICE_FEATURE_CATEGORIES.LIGHT, DEVICE_FEATURE_TYPES.LIGHT.HUE),
  getKey(DEVICE_FEATURE_CATEGORIES.LIGHT, DEVICE_FEATURE_TYPES.LIGHT.SATURATION),
  getKey(DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_TYPES.SWITCH.DIMMER),
  getKey(DEVICE_FEATURE_CATEGORIES.SHUTTER, DEVICE_FEATURE_TYPES.SHUTTER.POSITION),
  getKey(DEVICE_FEATURE_CATEGORIES.CURTAIN, DEVICE_FEATURE_TYPES.CURTAIN.POSITION),
  getKey(DEVICE_FEATURE_CATEGORIES.FAN, DEVICE_FEATURE_TYPES.FAN.PERCENT),
  getKey(DEVICE_FEATURE_CATEGORIES.TELEVISION, DEVICE_FEATURE_TYPES.TELEVISION.VOLUME)
]);

// A setpoint, a current or a charge target is a physical quantity: 20 degrees on a thermostat means 20
// degrees whatever its bounds, and a charge limit of 80 % is the car's own target, not a share of the
// device's range. These are never scaled between ranges.
const PHYSICAL_KEYS = new Set([
  getKey(DEVICE_FEATURE_CATEGORIES.THERMOSTAT, DEVICE_FEATURE_TYPES.THERMOSTAT.TARGET_TEMPERATURE),
  getKey(DEVICE_FEATURE_CATEGORIES.AIR_CONDITIONING, DEVICE_FEATURE_TYPES.AIR_CONDITIONING.TARGET_TEMPERATURE),
  getKey(DEVICE_FEATURE_CATEGORIES.WATER_HEATER, DEVICE_FEATURE_TYPES.WATER_HEATER.TARGET_TEMPERATURE),
  getKey(
    DEVICE_FEATURE_CATEGORIES.ELECTRICAL_VEHICLE_CLIMATE,
    DEVICE_FEATURE_TYPES.ELECTRICAL_VEHICLE_CLIMATE.TARGET_TEMPERATURE
  ),
  getKey(DEVICE_FEATURE_CATEGORIES.SWITCH, DEVICE_FEATURE_TYPES.SWITCH.TARGET_CURRENT),
  getKey(
    DEVICE_FEATURE_CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
    DEVICE_FEATURE_TYPES.ELECTRICAL_VEHICLE_CHARGE.TARGET_CHARGE_LIMIT
  ),
  getKey(
    DEVICE_FEATURE_CATEGORIES.ELECTRICAL_VEHICLE_CHARGE,
    DEVICE_FEATURE_TYPES.ELECTRICAL_VEHICLE_CHARGE.TARGET_CURRENT
  )
]);

const LIGHT_TEMPERATURE_KEY = getKey(DEVICE_FEATURE_CATEGORIES.LIGHT, DEVICE_FEATURE_TYPES.LIGHT.TEMPERATURE);

// The fan speed type has no unit of its own in the catalog: its own unit decides, a percentage (or no
// unit) is a relative level, an absolute unit is physical.
const FAN_SPEED_KEY = getKey(DEVICE_FEATURE_CATEGORIES.FAN, DEVICE_FEATURE_TYPES.FAN.SPEED);

// Members are grouped by category AND type: the same type string is shared by several categories
// (a fan mode and an air conditioning mode, for example), and they must never be averaged together.
const getFeatureKey = feature => getKey(feature.category, feature.type);

const isSet = value => value !== null && value !== undefined;

const isTextSelectFeature = feature =>
  feature.category === DEVICE_FEATURE_CATEGORIES.TEXT && feature.type === DEVICE_FEATURE_TYPES.TEXT.SELECT;

/**
 * @description Tells how the value of a group of features is aggregated and written.
 * @param {object} feature - A member feature, or a group feature (same category and type).
 * @returns {string} One of AGGREGATE_KIND.
 * @example getAggregateKind({ category: 'light', type: 'binary' });
 */
export const getAggregateKind = feature => {
  if (feature.type === BINARY_TYPE) {
    return AGGREGATE_KIND.BINARY;
  }
  const key = getFeatureKey(feature);
  if (key === LIGHT_TEMPERATURE_KEY) {
    return AGGREGATE_KIND.KELVIN;
  }
  if (RELATIVE_KEYS.has(key)) {
    return AGGREGATE_KIND.RELATIVE;
  }
  if (PHYSICAL_KEYS.has(key)) {
    return AGGREGATE_KIND.PHYSICAL;
  }
  if (key === FAN_SPEED_KEY) {
    const isAbsolute = Boolean(feature.unit) && feature.unit !== DEVICE_FEATURE_UNITS.PERCENT;
    return isAbsolute ? AGGREGATE_KIND.PHYSICAL : AGGREGATE_KIND.RELATIVE;
  }
  return AGGREGATE_KIND.LATEST;
};

// Same defaults as the rest of the widgets: a relative feature without bounds reads as a percentage.
const getRange = feature => ({
  min: Number.isFinite(feature.min) ? feature.min : 0,
  max: Number.isFinite(feature.max) ? feature.max : 100
});

// Clamps to the bounds the feature declares; a missing bound does not restrict the value.
const clampToBounds = (value, feature) => {
  let result = value;
  if (Number.isFinite(feature.min)) {
    result = Math.max(feature.min, result);
  }
  if (Number.isFinite(feature.max)) {
    result = Math.min(feature.max, result);
  }
  return result;
};

/**
 * @description Moves a value from one range onto another, keeping its position in the range.
 * @param {number} value - The value, in fromRange.
 * @param {object} fromRange - The range the value is read in ({ min, max }).
 * @param {object} toRange - The range to move the value onto ({ min, max }).
 * @returns {number} The value in toRange.
 * @example scaleToRange(50, { min: 0, max: 100 }, { min: 0, max: 254 });
 */
export const scaleToRange = (value, fromRange, toRange) => {
  const ratio =
    fromRange.max === fromRange.min
      ? 0
      : Math.min(1, Math.max(0, (value - fromRange.min) / (fromRange.max - fromRange.min)));
  return toRange.min + ratio * (toRange.max - toRange.min);
};

// toFixed drops the floating point noise the multiplication brings (0.1 * 3 is not 0.3).
const roundToStep = (value, step) => {
  const safeStep = Number.isFinite(step) && step > 0 ? step : 1;
  return Number((Math.round(value / safeStep) * safeStep).toFixed(10));
};

const getChangedAt = feature => {
  const time = feature.last_value_changed ? new Date(feature.last_value_changed).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
};

// The feature written last. Ties keep the first one, so the result follows the box order.
const getLastChanged = features =>
  features.reduce((latest, feature) => (getChangedAt(feature) > getChangedAt(latest) ? feature : latest));

// Features of the same category and type, in the order the box lists them.
const groupMembersByType = members => {
  const membersByKey = {};
  const keys = [];
  members.forEach(member => {
    const key = getFeatureKey(member);
    if (!membersByKey[key]) {
      membersByKey[key] = [];
      keys.push(key);
    }
    membersByKey[key].push(member);
  });
  return keys.map(key => membersByKey[key]);
};

// The options a group offers are those every member supports. Members that declare no
// supported_options do not restrict the list. If the members have no option in common, the first
// member's own list is kept: an empty list would make the rows fall back to the full catalog, which
// is exactly what offering only supported options prevents. Writes a member rejects surface as an error.
const getCommonSupportedOptions = members => {
  const lists = members
    .map(member => member.supported_options)
    .filter(options => Array.isArray(options) && options.length > 0);
  if (lists.length === 0) {
    return undefined;
  }
  const [firstList] = lists;
  const common = firstList.filter(option => lists.every(list => list.some(item => item.value === option.value)));
  return common.length > 0 ? common : firstList;
};

// A temperature target can be held by members in different units (a Celsius thermostat next to a
// Fahrenheit one): the group reads and writes in the first member's unit, so a member's value or bound
// is moved onto it. Same-unit members, and values that are not numbers, are returned unchanged.
const toGroupUnit = (member, value, groupUnit) =>
  Number.isFinite(value) ? convertTemperature(value, member.unit, groupUnit) : value;

// A physical group spans every member's bounds, so each member's full range can be reached from the
// group slider (a member's own bounds still clamp what it actually receives). A side is left open when
// any member declares no bound on it.
const getUnionOfBounds = (members, groupUnit) => {
  const mins = members.map(member => toGroupUnit(member, member.min, groupUnit));
  const maxs = members.map(member => toGroupUnit(member, member.max, groupUnit));
  return {
    min: mins.every(Number.isFinite) ? Math.min(...mins) : undefined,
    max: maxs.every(Number.isFinite) ? Math.max(...maxs) : undefined
  };
};

// Builds the one virtual feature standing for a group of same-type members. The category, type,
// step and unit come from the first member; the bounds are the first member's, except for physical
// groups (see getUnionOfBounds). The value is the aggregate.
const aggregateGroup = members => {
  const [first] = members;
  const key = getFeatureKey(first);
  const supportedOptions = getCommonSupportedOptions(members);
  const kind = getAggregateKind(first);
  const bounds =
    kind === AGGREGATE_KIND.PHYSICAL ? getUnionOfBounds(members, first.unit) : { min: first.min, max: first.max };
  const feature = {
    id: `${GROUP_FEATURE_PREFIX}:${key}`,
    selector: `${GROUP_FEATURE_PREFIX}:${key}`,
    name: first.name,
    category: first.category,
    type: first.type,
    unit: first.unit,
    min: bounds.min,
    max: bounds.max,
    step: first.step,
    read_only: false,
    ...(supportedOptions ? { supported_options: supportedOptions } : {})
  };

  if (kind === AGGREGATE_KIND.BINARY) {
    const known = members.filter(member => isSet(member.last_value));
    if (known.length === 0) {
      return { ...feature, last_value: null, last_value_changed: null };
    }
    return {
      ...feature,
      last_value: known.some(member => member.last_value === 1) ? 1 : 0,
      last_value_changed: getLastChanged(known).last_value_changed
    };
  }

  if (kind === AGGREGATE_KIND.RELATIVE) {
    const known = members.filter(member => Number.isFinite(member.last_value));
    if (known.length === 0) {
      return { ...feature, last_value: null, last_value_changed: null };
    }
    const range = getRange(first);
    const total = known.reduce((sum, member) => sum + scaleToRange(member.last_value, getRange(member), range), 0);
    return {
      ...feature,
      last_value: roundToStep(total / known.length, first.step),
      last_value_changed: getLastChanged(known).last_value_changed
    };
  }

  if (kind === AGGREGATE_KIND.PHYSICAL) {
    const known = members.filter(member => Number.isFinite(member.last_value));
    if (known.length === 0) {
      return { ...feature, last_value: null, last_value_changed: null };
    }
    const total = known.reduce((sum, member) => sum + toGroupUnit(member, member.last_value, first.unit), 0);
    return {
      ...feature,
      // Clamped to the union of the members' bounds, the same range the group slider offers
      last_value: clampToBounds(roundToStep(total / known.length, first.step), feature),
      last_value_changed: getLastChanged(known).last_value_changed
    };
  }

  if (kind === AGGREGATE_KIND.KELVIN) {
    const known = members.filter(member => Number.isFinite(member.last_value));
    if (known.length === 0) {
      return { ...feature, last_value: null, last_value_changed: null };
    }
    // Averaged in kelvins, the one unit every lamp shares, then read back in the group scale
    const totalKelvin = known.reduce((sum, member) => sum + temperatureValueToKelvin(member, member.last_value), 0);
    const averageValue = kelvinToTemperatureValue(first, totalKelvin / known.length);
    return {
      ...feature,
      last_value: clampToBounds(roundToStep(averageValue, first.step), first),
      last_value_changed: getLastChanged(known).last_value_changed
    };
  }

  const known = members.filter(member => isSet(member.last_value) || isSet(member.last_value_string));
  if (known.length === 0) {
    return { ...feature, last_value: null, last_value_string: null, last_value_changed: null };
  }
  const latest = getLastChanged(known);
  return {
    ...feature,
    last_value: latest.last_value,
    last_value_string: latest.last_value_string,
    last_value_changed: latest.last_value_changed
  };
};

/**
 * @description Builds the virtual features of a group: one feature per type, aggregated from its members.
 * @param {Array} members - The member features, each carrying its device, in the box order.
 * @returns {Array} The virtual features, in the order their types first appear in the box.
 * @example buildGroupFeatures(members);
 */
export const buildGroupFeatures = members => groupMembersByType(members).map(aggregateGroup);

/**
 * @description Converts a value written on the group into the value each member receives.
 * @param {object} member - The member feature.
 * @param {object} groupFeature - The virtual feature the value is written on.
 * @param {string} kind - The aggregate kind of the group.
 * @param {number} value - The value written, in the group scale.
 * @returns {number} The value to send to the member.
 */
const getMemberValue = (member, groupFeature, kind, value) => {
  if (kind === AGGREGATE_KIND.RELATIVE) {
    return roundToStep(scaleToRange(value, getRange(groupFeature), getRange(member)), member.step);
  }
  if (kind === AGGREGATE_KIND.KELVIN) {
    const kelvin = temperatureValueToKelvin(groupFeature, value);
    return clampToBounds(roundToStep(kelvinToTemperatureValue(member, kelvin), member.step), member);
  }
  // A physical value written on the group is in the group's unit: moved onto the member's own unit first
  return clampToBounds(roundToStep(convertTemperature(value, groupFeature.unit, member.unit), member.step), member);
};

/**
 * @description Lists the value to write on each member of a group feature, for a value written on
 * the group. Relative members get the value scaled into their own range, color temperature members
 * the same color through kelvins, physical members the value itself clamped to their bounds; on/off
 * and shared values are sent unchanged.
 * @param {Array} members - The member features of the group.
 * @param {object} groupFeature - The virtual feature the value is written on.
 * @param {number|string} value - The value written, in the group feature scale.
 * @returns {Array} One { selector, value } per member of the same type.
 * @example planGroupWrites(members, groupFeature, 50);
 */
export const planGroupWrites = (members, groupFeature, value) => {
  const kind = getAggregateKind(groupFeature);
  const groupKey = getFeatureKey(groupFeature);
  const numericValue = Number(value);
  return members
    .filter(member => getFeatureKey(member) === groupKey)
    .map(member => ({
      selector: member.selector,
      value:
        kind === AGGREGATE_KIND.BINARY || kind === AGGREGATE_KIND.LATEST
          ? value
          : getMemberValue(member, groupFeature, kind, numericValue)
    }));
};

/**
 * @description Converts the value of a single feature to the type its widget writes: a range slider
 * hands over the DOM string, which must not reach the aggregate as text.
 * @param {object} feature - The feature written.
 * @param {number|string} value - The raw value.
 * @returns {number|string} The value to store and send.
 * @example normalizeMemberValue({ category: 'light', type: 'brightness' }, '50');
 */
export const normalizeMemberValue = (feature, value) =>
  getAggregateKind(feature) === AGGREGATE_KIND.LATEST ? value : Number(value);

const applyFeatureValue = (feature, value, changedAt) =>
  isTextSelectFeature(feature)
    ? { ...feature, last_value_string: `${value}`, last_value_changed: changedAt }
    : { ...feature, last_value: value, last_value_changed: changedAt };

/**
 * @description Shows written values on the members before the device confirms them.
 * @param {Array} members - The member features.
 * @param {Array} writes - { selector, value } pairs, as planGroupWrites returns them.
 * @param {Date} changedAt - When the values were written.
 * @returns {Array} The member features, with the written values applied.
 * @example applyWritesToMembers(members, [{ selector: 'a', value: 1 }], new Date());
 */
export const applyWritesToMembers = (members, writes, changedAt) => {
  const valueBySelector = new Map(writes.map(write => [write.selector, write.value]));
  return members.map(member =>
    valueBySelector.has(member.selector)
      ? applyFeatureValue(member, valueBySelector.get(member.selector), changedAt)
      : member
  );
};

/**
 * @description Applies a websocket state change to the member it concerns.
 * @param {Array} members - The member features.
 * @param {string} selector - The selector of the feature that changed.
 * @param {number} lastValue - The new value.
 * @param {string} changedAt - When it changed.
 * @returns {Array} The member features.
 * @example applyStateUpdate(members, 'a', 1, '2026-10-09T10:00:00.000Z');
 */
export const applyStateUpdate = (members, selector, lastValue, changedAt) =>
  members.map(member => (member.selector === selector ? applyFeatureValue(member, lastValue, changedAt) : member));

/**
 * @description Applies a websocket string state change (dynamic select) to the member it concerns.
 * @param {Array} members - The member features.
 * @param {string} selector - The selector of the feature that changed.
 * @param {string} lastValueString - The new string value.
 * @param {string} changedAt - When it changed.
 * @returns {Array} The member features.
 * @example applyStringStateUpdate(members, 'a', 'Netflix', '2026-10-09T10:00:00.000Z');
 */
export const applyStringStateUpdate = (members, selector, lastValueString, changedAt) =>
  members.map(member =>
    member.selector === selector
      ? { ...member, last_value_string: lastValueString, last_value_changed: changedAt }
      : member
  );

/**
 * @description Flattens the devices returned by the API into their features, each carrying its device,
 * sorted in the order the box lists the selectors.
 * @param {Array} devices - The devices returned by GET /api/v1/device.
 * @param {Array} selectors - The feature selectors of the box.
 * @returns {Array} The member features.
 * @example flattenMemberFeatures(devices, ['a', 'b']);
 */
export const flattenMemberFeatures = (devices, selectors) => {
  const features = [];
  devices.forEach(device => {
    device.features.forEach(feature => {
      features.push({ ...feature, device });
    });
  });
  return features.sort((a, b) => selectors.indexOf(a.selector) - selectors.indexOf(b.selector));
};

/**
 * @description Counts the distinct devices behind a list of member features.
 * @param {Array} members - The member features, each carrying its device.
 * @returns {number} The number of devices.
 * @example countDevices(members);
 */
export const countDevices = members => new Set(members.map(member => member.device.id)).size;
