import get from 'get-value';
import { Text } from 'preact-i18n';
import cx from 'classnames';

import { DeviceFeatureCategoriesIcon } from '../../../../utils/consts';
import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_UNITS } from '../../../../../../server/utils/constants';
import { decimalsOf } from '../../../../../../server/utils/units';
import {
  convertTemperature,
  getDisplayStep,
  isTemperatureUnit,
  roundDisplayValue,
  stepSetpoint,
  toFeatureSetpoint
} from '../../../../utils/hawrayTemperature';

import style from './style.css';

const isNullOrUndefined = val => val === null || val === undefined;

// adding a decimal step in binary floating point drifts (20.1 + 0.1 =
// 20.200000000000003), so the sum is rounded on the finest grid of its two
// operands: rounding on the step alone would snap a 20.5 set from the
// physical remote to 21 as soon as the step is a whole degree
const addToValue = (value, step) =>
  Number((value + step).toFixed(Math.min(100, Math.max(decimalsOf(value), decimalsOf(step)))));

const SETPOINT_STEP_BY_CATEGORY = {
  [DEVICE_FEATURE_CATEGORIES.AIR_CONDITIONING]: 1,
  [DEVICE_FEATURE_CATEGORIES.SWITCH]: 1,
  [DEVICE_FEATURE_CATEGORIES.ELECTRICAL_VEHICLE_CHARGE]: 1,
  // A storage tank is set in whole degrees; the 0.5 default is room-thermostat granularity.
  [DEVICE_FEATURE_CATEGORIES.WATER_HEATER]: 1
};

const DEFAULT_VALUE_BY_CATEGORY = {
  [DEVICE_FEATURE_CATEGORIES.AIR_CONDITIONING]: 18,
  [DEVICE_FEATURE_CATEGORIES.THERMOSTAT]: 18,
  [DEVICE_FEATURE_CATEGORIES.ELECTRICAL_VEHICLE_CLIMATE]: 18,
  [DEVICE_FEATURE_CATEGORIES.SWITCH]: 0,
  [DEVICE_FEATURE_CATEGORIES.ELECTRICAL_VEHICLE_CHARGE]: 5,
  [DEVICE_FEATURE_CATEGORIES.WATER_HEATER]: 55
};

const SetpointDeviceFeature = ({ children, ...props }) => {
  const SETPOINT_STEP = props.deviceFeature.step || SETPOINT_STEP_BY_CATEGORY[props.deviceFeature.category] || 0.5;
  const DEFAULT_VALUE_IN_CASE_EMPTY = DEFAULT_VALUE_BY_CATEGORY[props.deviceFeature.category] || 0;

  // A temperature setpoint is shown and stepped in the user's unit when it differs from the feature's own
  // unit. The value sent back is always in the feature's unit, so the device never sees a converted value
  // labelled with the wrong unit.
  const featureUnit = props.deviceFeature.unit;
  const userUnit = props.user && props.user.temperature_unit_preference;
  const isConverted = isTemperatureUnit(featureUnit) && isTemperatureUnit(userUnit) && userUnit !== featureUnit;
  const displayUnit = isConverted ? userUnit : featureUnit;
  const setpoint = {
    featureUnit,
    displayUnit: userUnit,
    featureStep: props.deviceFeature.step,
    min: props.deviceFeature.min,
    max: props.deviceFeature.max
  };
  // The step the buttons move by, in the displayed unit: a whole degree Fahrenheit, otherwise the step above
  const DEFAULT_DISPLAY_STEP = userUnit === DEVICE_FEATURE_UNITS.FAHRENHEIT ? 1 : SETPOINT_STEP;
  const displayStep = isConverted ? getDisplayStep(setpoint, DEFAULT_DISPLAY_STEP) : SETPOINT_STEP;

  const toDisplayBound = bound =>
    isConverted && Number.isFinite(bound) ? convertTemperature(bound, featureUnit, userUnit) : bound;

  const displayValue =
    isConverted && !isNullOrUndefined(props.deviceFeature.last_value)
      ? roundDisplayValue(convertTemperature(props.deviceFeature.last_value, featureUnit, userUnit))
      : props.deviceFeature.last_value;

  function updateValue(value) {
    props.updateValueWithDebounce(props.deviceFeature, value);
  }

  function updateValueEvent(e) {
    const typed = Number(e.target.value);
    if (isConverted && e.target.value !== '' && Number.isFinite(typed)) {
      updateValue(toFeatureSetpoint(typed, setpoint));
      return;
    }
    updateValue(e.target.value);
  }

  function add() {
    const prevValue = isNullOrUndefined(props.deviceFeature.last_value)
      ? DEFAULT_VALUE_IN_CASE_EMPTY
      : props.deviceFeature.last_value;
    if (isConverted) {
      updateValue(stepSetpoint(prevValue, 1, setpoint, DEFAULT_DISPLAY_STEP));
      return;
    }
    updateValue(addToValue(prevValue, SETPOINT_STEP));
  }

  function substract() {
    const prevValue = isNullOrUndefined(props.deviceFeature.last_value)
      ? DEFAULT_VALUE_IN_CASE_EMPTY
      : props.deviceFeature.last_value;
    if (isConverted) {
      updateValue(stepSetpoint(prevValue, -1, setpoint, DEFAULT_DISPLAY_STEP));
      return;
    }
    updateValue(addToValue(prevValue, -SETPOINT_STEP));
  }

  return (
    <tr>
      <td>
        <i
          class={`fe fe-${get(
            DeviceFeatureCategoriesIcon,
            `${props.deviceFeature.category}.${props.deviceFeature.type}`,
            { default: 'hash' }
          )}`}
        />
      </td>
      <td>{props.rowName}</td>

      {/* One horizontal − value + capsule at every width: in a card too narrow
          for it next to the name, the compact card mode of the device widget
          (routes/dashboard/style.css) drops it under the name instead — which
          replaced the stacked +/value/− variant this row used to carry for
          the 992-1300px viewports. */}
      <td class="py-0">
        <div class="d-flex justify-content-end">
          <div class={cx('input-group', style.setpointHorizontalControls)}>
            <div class="input-group-prepend">
              <button class="btn btn-outline-secondary" type="button" onClick={substract}>
                <Text id="dashboard.boxes.devicesInRoom.substractButton" />
              </button>
            </div>
            <input
              type="number"
              value={displayValue}
              class={cx('form-control text-center', style.removeNumberArrow, style.setpointValue)}
              onChange={updateValueEvent}
              step={isConverted ? displayStep : SETPOINT_STEP}
              min={toDisplayBound(props.deviceFeature.min)}
              max={toDisplayBound(props.deviceFeature.max)}
            />
            {isTemperatureUnit(displayUnit) && (
              <div class="input-group-append">
                <span class="input-group-text">
                  <Text id={`deviceFeatureUnitShort.${displayUnit}`} />
                </span>
              </div>
            )}
            <div class="input-group-append">
              <button class="btn btn-outline-secondary" type="button" onClick={add}>
                <Text id="dashboard.boxes.devicesInRoom.addButton" />
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  );
};

export default SetpointDeviceFeature;
