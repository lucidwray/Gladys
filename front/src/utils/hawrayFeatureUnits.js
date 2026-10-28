import { useEffect, useState } from 'preact/hooks';
import { prefersFahrenheit } from './hawrayTemperature';

// selector -> unit of every device feature, fetched once and shared (the scene cards each need it to write a
// temperature in the unit their user reads). Only a Fahrenheit user asks for it: any other user never calls the API.
// The cards of a scene editor open together, so they share one fetch; it is kept for a short while only, and the next
// editor opened after that fetches again (a feature added or whose unit changed shows up without a reload).
// While it loads, or if it fails, the hook gives null and the summary shows no unit conversion.
const UNITS_CACHE_MS = 15000;
let unitsPromise = null;
let unitsFetchedAt = 0;
const fetchFeatureUnits = async httpClient => {
  const devices = await httpClient.get('/api/v1/device');
  const units = {};
  devices.forEach(device => (device.features || []).forEach(feature => (units[feature.selector] = feature.unit)));
  return units;
};
const loadFeatureUnits = async httpClient => {
  if (!unitsPromise || Date.now() - unitsFetchedAt > UNITS_CACHE_MS) {
    unitsFetchedAt = Date.now();
    unitsPromise = fetchFeatureUnits(httpClient);
  }
  const current = unitsPromise;
  try {
    return await current;
  } catch (e) {
    if (unitsPromise === current) {
      unitsPromise = null;
    }
    throw e;
  }
};

// The units of the device features, for a user who reads temperatures in Fahrenheit; null for any other user.
export const useFeatureUnitsForFahrenheitUser = (httpClient, user, enabled) => {
  const [units, setUnits] = useState(null);
  const wanted = Boolean(enabled) && Boolean(httpClient) && prefersFahrenheit(user);
  useEffect(() => {
    if (!wanted) {
      return undefined;
    }
    let active = true;
    const load = async () => {
      try {
        const loaded = await loadFeatureUnits(httpClient);
        if (active) {
          setUnits(loaded);
        }
      } catch (e) {
        console.error(e);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [wanted, httpClient]);
  return wanted ? units : null;
};
