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

// Chart text for a Fahrenheit user. A reading (a tooltip value) is a temperature: whole degrees. An axis tick is a
// gridline position the chart library picks: on a narrow range it can sit half a degree apart, and printing those as
// whole degrees would label two gridlines alike, so a tick keeps one decimal when it is not a whole degree.
export const formatWholeFahrenheitReading = value =>
  value === null || value === undefined || Number.isNaN(value) ? value : String(Math.round(value));
export const formatFahrenheitAxisTick = value => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return value;
  }
  const tenths = Math.round(value * 10) / 10;
  return Number.isInteger(tenths) ? String(tenths) : tenths.toFixed(1);
};

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

// The one rule of the fork for what a user reads: a user whose preference is Fahrenheit reads every temperature in
// whole degrees Fahrenheit, whatever unit the feature holds it in. Any other user (Celsius, or a preference not loaded
// yet) keeps the display upstream Gladys gives, so the helpers below return null for them and the caller keeps its
// own code path untouched.
export const prefersFahrenheit = user =>
  Boolean(user) && user.temperature_unit_preference === DEVICE_FEATURE_UNITS.FAHRENHEIT;

// True when a value held in `unit` is shown to `user` in whole degrees Fahrenheit.
export const showsWholeFahrenheit = (unit, user) => isTemperatureUnit(unit) && prefersFahrenheit(user);

// { value, unit } of a temperature held in `unit`, as `user` reads it, or null when the caller's display applies.
export const getUserTemperatureDisplay = (value, unit, user) => {
  if (!showsWholeFahrenheit(unit, user) || value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  return {
    value: toDisplayValue(number, unit, DEVICE_FEATURE_UNITS.FAHRENHEIT),
    unit: DEVICE_FEATURE_UNITS.FAHRENHEIT
  };
};

// { min, max, unit } of a range held in `unit`, as `user` reads it (whole degrees, rounded inward so the range shown
// never goes past the device's own), or null when the caller's display applies.
export const getUserTemperatureRange = (min, max, unit, user) => {
  if (!showsWholeFahrenheit(unit, user)) {
    return null;
  }
  return {
    min: toDisplayBound(min, unit, DEVICE_FEATURE_UNITS.FAHRENHEIT, false),
    max: toDisplayBound(max, unit, DEVICE_FEATURE_UNITS.FAHRENHEIT, true),
    unit: DEVICE_FEATURE_UNITS.FAHRENHEIT
  };
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

// The editors (scene trigger / action, gauge thresholds) show a stored value in whole degrees Fahrenheit to a Fahrenheit
// user. The value an editor stores is only converted when the user actually changed the field: a value shown as
// 72 F that is "typed" again as 72 stays what it was (22.3 C stays 22.3, not 22.5). Anything else is converted to the
// feature's unit on its grid (0.5 C, or the feature's own step), within the bounds given.
export const fromEditedTemperature = (displayValue, storedValue, setpoint) => {
  const stored = Number(storedValue);
  if (
    storedValue !== null &&
    storedValue !== undefined &&
    storedValue !== '' &&
    Number.isFinite(stored) &&
    toDisplayValue(stored, setpoint.featureUnit, setpoint.displayUnit) === displayValue
  ) {
    return storedValue;
  }
  return toFeatureSetpoint(displayValue, setpoint);
};

// The setpoint description of a Fahrenheit user editing a value held in `unit`.
export const getEditorSetpoint = (unit, featureStep, min, max) => ({
  featureUnit: unit,
  displayUnit: DEVICE_FEATURE_UNITS.FAHRENHEIT,
  featureStep,
  min,
  max
});

// What a Fahrenheit user types in a temperature field is held as text while the field is being edited ("7", "72.",
// "-", "" are all steps on the way to a value) and only read when the edit is committed (blur / Enter).
// A number in the text (a comma counts as the decimal point), or null for text that is not one yet.
export const parseTemperatureText = text => {
  const normalized = String(text)
    .trim()
    .replace(',', '.');
  return /^-?(\d+\.?\d*|\.\d+)$/.test(normalized) ? Number(normalized) : null;
};

// The value to store when a typed text is committed: { value } in the feature's unit (on its grid, within its bounds),
// { value: '' } for an emptied field, or null when the text is not a number (the stored value is kept).
export const commitTemperatureText = (text, storedValue, setpoint) => {
  const number = parseTemperatureText(text);
  if (number !== null) {
    return { value: fromEditedTemperature(number, storedValue, setpoint) };
  }
  return String(text).trim() === '' ? { value: '' } : null;
};
