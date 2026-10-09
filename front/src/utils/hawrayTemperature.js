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

// Rounds a value on a grid of the given step, dropping the floating point noise the multiplication brings.
export const roundToStep = (value, step) => Number((Math.round(value / step) * step).toFixed(10));
