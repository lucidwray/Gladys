import { Text } from 'preact-i18n';
import { smartRound } from '../../../../../../../server/utils/units';
import { getUserTemperatureDisplay } from '../../../../../utils/hawrayTemperature';

// A read-only temperature feature outside the temperature-sensor category (a thermostat or air conditioner setpoint
// reported back, a water heater target) lands here: a Fahrenheit user reads it in whole degrees Fahrenheit
const RawDeviceValue = ({ deviceFeature, user }) => {
  const temperature = getUserTemperatureDisplay(deviceFeature.last_value, deviceFeature.unit, user);
  return (
    <div>
      {deviceFeature.last_value === null && <Text id="dashboard.boxes.devicesInRoom.noValue" />}
      {deviceFeature.last_value !== null && (
        <span>
          {`${temperature ? temperature.value : smartRound(deviceFeature.last_value)} `}
          <Text id={`deviceFeatureUnitShort.${temperature ? temperature.unit : deviceFeature.unit}`} />
        </span>
      )}
    </div>
  );
};

export default RawDeviceValue;
