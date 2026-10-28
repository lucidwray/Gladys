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

// A Fahrenheit user sees whole degrees, rounded the conventional way (72.5 is 73); any other unit keeps one decimal.
export const roundForUnit = (value, unit) =>
  unit === DEVICE_FEATURE_UNITS.FAHRENHEIT ? Math.round(value) : roundDisplayValue(value);

// The text of a temperature already in the displayed unit: whole degrees Fahrenheit, otherwise one decimal kept.
export const formatTemperature = (value, unit) =>
  unit === DEVICE_FEATURE_UNITS.FAHRENHEIT ? String(Math.round(value)) : Number(value).toFixed(1);

// A value held in fromUnit, as it is shown in displayUnit.
export const toDisplayValue = (value, fromUnit, displayUnit) =>
  roundForUnit(convertTemperature(value, fromUnit, displayUnit), displayUnit);

// A bound held in the feature's unit, as it is shown in displayUnit. In whole degrees Fahrenheit a bound is rounded
// inward (the minimum up, the maximum down) so a value picked within it is never outside the device range.
// The small epsilon keeps a bound that is already whole (21.1111 C = 70 F) from being pushed a degree inward.
export const toDisplayBound = (bound, fromUnit, displayUnit, isMax) => {
  if (!Number.isFinite(bound)) {
    return bound;
  }
  const converted = convertTemperature(bound, fromUnit, displayUnit);
  if (displayUnit !== DEVICE_FEATURE_UNITS.FAHRENHEIT) {
    return converted;
  }
  return isMax ? Math.floor(converted + 1e-9) : Math.ceil(converted - 1e-9);
};

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
// when that is coarser (a 2 C step shown in F moves 4 F per press, otherwise it would never move). In Fahrenheit
// the step is a whole number of degrees.
export const getDisplayStep = (setpoint, defaultDisplayStep) => {
  const featureStepInDisplayUnit = setpoint.featureStep
    ? convertTemperatureDelta(setpoint.featureStep, setpoint.featureUnit, setpoint.displayUnit)
    : 0;
  const step = Math.max(defaultDisplayStep, featureStepInDisplayUnit);
  return setpoint.displayUnit === DEVICE_FEATURE_UNITS.FAHRENHEIT ? Math.max(1, Math.round(step)) : step;
};

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
  const displayValue = toDisplayValue(value, setpoint.featureUnit, setpoint.displayUnit);
  const displayStep = getDisplayStep(setpoint, defaultDisplayStep);
  const stepped = toFeatureSetpoint(Number((displayValue + direction * displayStep).toFixed(6)), setpoint);
  if (stepped !== value) {
    return stepped;
  }
  const roundingStep = getRoundingStep(setpoint.featureStep, setpoint.featureUnit);
  return clampToBounds(roundToStep(value + direction * roundingStep, roundingStep), setpoint.min, setpoint.max);
};
