import { Text } from 'preact-i18n';
import { connect } from 'unistore/preact';
import get from 'get-value';

import {
  DEVICE_FEATURE_CATEGORIES,
  DEVICE_FEATURE_TYPES,
  DEVICE_FEATURE_UNITS,
  OPENING_SENSOR_STATE
} from '../../../../server/utils/constants';
import withIntlAsProp from '../../utils/withIntlAsProp';
import { isTemperatureUnit, toDisplayValue } from '../../utils/hawrayTemperature';

const roundValue = value => Math.round(value * 10) / 10;

// Compact text rendering of a device feature's last value, used by widgets
// that display a state inline (chips bar, scene status subtitle, house-view
// pins). Enum values (vacuum state, shutter state, thermostat mode…) resolve
// through the app's existing per-category value labels.
const TEMPERATURE_CATEGORIES = [DEVICE_FEATURE_CATEGORIES.TEMPERATURE_SENSOR, DEVICE_FEATURE_CATEGORIES.THERMOSTAT];

const DeviceFeatureValueText = ({ feature, intl, user }) => {
  if (!feature || feature.last_value === null || feature.last_value === undefined) {
    return <Text id="deviceFeatureValueText.noValue" />;
  }
  if (feature.category === DEVICE_FEATURE_CATEGORIES.OPENING_SENSOR) {
    return feature.last_value === OPENING_SENSOR_STATE.OPEN ? (
      <Text id="deviceFeatureValueText.open" />
    ) : (
      <Text id="deviceFeatureValueText.closed" />
    );
  }
  const enumLabelPath = `deviceFeatureValue.category.${feature.category}.${feature.type}.${feature.last_value}`;
  if (get(intl.dictionary, enumLabelPath)) {
    return <Text id={enumLabelPath} />;
  }
  if (feature.type === DEVICE_FEATURE_TYPES.SENSOR.BINARY || feature.type === DEVICE_FEATURE_TYPES.LIGHT.BINARY) {
    return feature.last_value ? <Text id="deviceFeatureValueText.on" /> : <Text id="deviceFeatureValueText.off" />;
  }
  // A Fahrenheit user reads a temperature in whole degrees Fahrenheit, converted from the feature's own unit
  if (
    TEMPERATURE_CATEGORIES.includes(feature.category) &&
    isTemperatureUnit(feature.unit) &&
    user &&
    user.temperature_unit_preference === DEVICE_FEATURE_UNITS.FAHRENHEIT
  ) {
    return (
      <span>
        {toDisplayValue(feature.last_value, feature.unit, DEVICE_FEATURE_UNITS.FAHRENHEIT)}{' '}
        <Text id={`deviceFeatureUnitShort.${DEVICE_FEATURE_UNITS.FAHRENHEIT}`} />
      </span>
    );
  }
  return (
    <span>
      {roundValue(feature.last_value)}
      {feature.unit && (
        <span>
          {' '}
          <Text id={`deviceFeatureUnitShort.${feature.unit}`} />
        </span>
      )}
    </span>
  );
};

export default connect('user', {})(withIntlAsProp(DeviceFeatureValueText));
