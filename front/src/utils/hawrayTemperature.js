import { DEVICE_FEATURE_UNITS } from '../../../server/utils/constants';
import { celsiusToFahrenheit, fahrenheitToCelsius } from '../../../server/utils/units';

export const isTemperatureUnit = unit =>
  unit === DEVICE_FEATURE_UNITS.CELSIUS || unit === DEVICE_FEATURE_UNITS.FAHRENHEIT;

// Moves a temperature from one unit to the other. Anything that is not a Celsius/Fahrenheit pair
// (same unit, a missing unit, a non-temperature unit) is returned as it is.
export const convertTemperature = (value, fromUnit, toUnit) => {
  if (fromUnit === toUnit || !isTemperatureUnit(fromUnit) || !isTemperatureUnit(toUnit)) {
    return value;
  }
  return fromUnit === DEVICE_FEATURE_UNITS.CELSIUS ? celsiusToFahrenheit(value) : fahrenheitToCelsius(value);
};

// A difference between two temperatures is scaled, not offset: a 2 C step is 3.6 F, a 2 F step is about 1.11 C.
const convertTemperatureDelta = (delta, fromUnit, toUnit) => {
  if (fromUnit === toUnit || !isTemperatureUnit(fromUnit) || !isTemperatureUnit(toUnit)) {
    return delta;
  }
  return fromUnit === DEVICE_FEATURE_UNITS.CELSIUS ? delta * 1.8 : delta / 1.8;
};

// Rounds a value on a grid of the given step, dropping the floating point noise the multiplication brings.
export const roundToStep = (value, step) => Number((Math.round(value / step) * step).toFixed(10));

// A value shown in the displayed unit keeps one decimal.
export const roundDisplayValue = value => Math.round(value * 10) / 10;

const clampToBounds = (value, min, max) => {
  let result = value;
  if (Number.isFinite(min)) {
    result = Math.max(min, result);
  }
  if (Number.isFinite(max)) {
    result = Math.min(max, result);
  }
  return result;
};

// The step a feature's value lands on in its own unit: its own step, or 0.5 C / 1 F when it declares none.
const getRoundingStep = (featureStep, featureUnit) =>
  featureStep || (featureUnit === DEVICE_FEATURE_UNITS.CELSIUS ? 0.5 : 1);

// setpoint: { featureUnit, displayUnit, featureStep, min, max }, where min and max are in the feature unit.
// The step of one press, in the displayed unit: the default step of that unit, or the feature's own step
// when that is coarser (a 2 C step shown in F moves 3.6 F per press, otherwise it would never move).
export const getDisplayStep = (setpoint, defaultDisplayStep) =>
  Math.max(
    defaultDisplayStep,
    setpoint.featureStep ? convertTemperatureDelta(setpoint.featureStep, setpoint.featureUnit, setpoint.displayUnit) : 0
  );

// Converts a value typed or stepped in the displayed unit to the feature's unit, on its step, within its bounds.
export const toFeatureSetpoint = (displayValue, setpoint) =>
  clampToBounds(
    roundToStep(
      convertTemperature(displayValue, setpoint.displayUnit, setpoint.featureUnit),
      getRoundingStep(setpoint.featureStep, setpoint.featureUnit)
    ),
    setpoint.min,
    setpoint.max
  );

// One press of the - (direction -1) or + (direction 1) button on a value held in the feature's unit.
// The press moves by the display step. If that rounds back to the value already held, the press moves one
// feature step instead, so a press never leaves the value where it is (unless a bound stops it).
export const stepSetpoint = (value, direction, setpoint, defaultDisplayStep) => {
  const displayValue = roundDisplayValue(convertTemperature(value, setpoint.featureUnit, setpoint.displayUnit));
  const displayStep = getDisplayStep(setpoint, defaultDisplayStep);
  const stepped = toFeatureSetpoint(Number((displayValue + direction * displayStep).toFixed(6)), setpoint);
  if (stepped !== value) {
    return stepped;
  }
  const roundingStep = getRoundingStep(setpoint.featureStep, setpoint.featureUnit);
  return clampToBounds(roundToStep(value + direction * roundingStep, roundingStep), setpoint.min, setpoint.max);
};
