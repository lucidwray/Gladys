const { expect } = require('chai');
const { randomUUID } = require('crypto');
const EventEmitter = require('events');
const StateManager = require('../../../lib/state');
const Variable = require('../../../lib/variable');
const { BadParameters } = require('../../../utils/coreErrors');
const { MAINS_OVERRIDE_VARIABLE } = require('../../../lib/hawray-power/constants');
const {
  isPowerFeature,
  findPowerFeature,
  getMainsOverride,
  validateMainsDevice,
  detectRoles,
} = require('../../../lib/hawray-power/roles');

const EMPORIA = 'Emporia Vue channel';

const buildFeature = (selector, category, type) => ({
  id: randomUUID(),
  selector,
  name: `${selector} name`,
  external_id: `${selector}-ext`,
  category,
  type,
  unit: 'W',
});

const buildDevice = (selector, externalId, model, features) => ({
  id: randomUUID(),
  selector,
  name: `${selector} name`,
  external_id: externalId,
  model,
  features,
});

const emporiaChannel = (selector, externalId) =>
  buildDevice(selector, externalId, EMPORIA, [
    buildFeature(`${selector}-power`, 'energy-sensor', 'power'),
    buildFeature(`${selector}-index`, 'energy-sensor', 'index'),
  ]);

const buildStateManager = (devices) => {
  const stateManager = new StateManager(new EventEmitter());
  devices.forEach((device) => stateManager.setState('device', device.selector, device));
  return stateManager;
};

// A house with mains 1-2-3, a Balance, two circuits, a Zigbee plug and a non-Emporia energy meter.
const houseDevices = () => [
  emporiaChannel('emporia-mains', 'emporia-56472:1-2-3'),
  emporiaChannel('emporia-balance', 'emporia-56472:Balance'),
  emporiaChannel('emporia-kitchen', 'emporia-56472:1-7'),
  emporiaChannel('emporia-garage', 'emporia-56472:9-16'),
  buildDevice('zigbee-plug', 'zigbee-plug-ext', 'Zigbee plug', [
    buildFeature('zigbee-plug-power', 'switch', 'power'),
    buildFeature('zigbee-plug-energy', 'switch', 'energy'),
  ]),
];

describe('hawray power roles', () => {
  describe('isPowerFeature / findPowerFeature', () => {
    it('accepts energy-sensor/power and switch/power only', () => {
      expect(isPowerFeature({ category: 'energy-sensor', type: 'power' })).to.equal(true);
      expect(isPowerFeature({ category: 'switch', type: 'power' })).to.equal(true);
      expect(isPowerFeature({ category: 'switch', type: 'energy' })).to.equal(false);
      expect(isPowerFeature({ category: 'light', type: 'power' })).to.equal(false);
    });

    it('prefers the energy-sensor power feature over a switch power feature', () => {
      const switchPower = buildFeature('a-switch', 'switch', 'power');
      const energyPower = buildFeature('a-energy', 'energy-sensor', 'power');
      expect(findPowerFeature({ features: [switchPower, energyPower] })).to.equal(energyPower);
      expect(findPowerFeature({ features: [switchPower] })).to.equal(switchPower);
    });

    it('returns null for a device without power features or without features', () => {
      expect(findPowerFeature({ features: [buildFeature('x', 'energy-sensor', 'index')] })).to.equal(null);
      expect(findPowerFeature({})).to.equal(null);
    });
  });

  describe('detectRoles', () => {
    it('detects mains, balance, circuits and plugs from the Emporia naming', () => {
      const roles = detectRoles(buildStateManager(houseDevices()), null);
      expect(roles.mains_source).to.equal('auto');
      expect(roles.mains.device_selector).to.equal('emporia-mains');
      expect(roles.mains.power_feature_selector).to.equal('emporia-mains-power');
      expect(roles.balance.device_selector).to.equal('emporia-balance');
      expect(roles.circuits.map((role) => role.device_selector)).to.deep.equal(['emporia-garage', 'emporia-kitchen']);
      expect(roles.plugs.map((role) => role.power_feature_selector)).to.deep.equal(['zigbee-plug-power']);
    });

    it('matches the balance suffix case-insensitively', () => {
      ['emporia-56472:balance', 'emporia-56472:Balance', 'emporia-56472:BALANCE'].forEach((externalId) => {
        const roles = detectRoles(
          buildStateManager([emporiaChannel('mains', 'emporia-56472:1-2-3'), emporiaChannel('bal', externalId)]),
          null,
        );
        expect(roles.balance.device_selector).to.equal('bal');
        expect(roles.circuits).to.deep.equal([]);
      });
    });

    it('does not treat a device without the Emporia model as an Emporia channel', () => {
      const lookalike = buildDevice('lookalike', 'emporia-56472:1-2-3', 'Other model', [
        buildFeature('lookalike-power', 'energy-sensor', 'power'),
      ]);
      const roles = detectRoles(buildStateManager([lookalike]), null);
      expect(roles.mains).to.equal(null);
      expect(roles.mains_source).to.equal(null);
      expect(roles.plugs.map((role) => role.device_selector)).to.deep.equal(['lookalike']);
    });

    it('skips an Emporia channel that has no power feature', () => {
      const noPower = buildDevice('no-power', 'emporia-56472:1-7', EMPORIA, [
        buildFeature('no-power-index', 'energy-sensor', 'index'),
      ]);
      const roles = detectRoles(buildStateManager([noPower]), null);
      expect(roles.circuits).to.deep.equal([]);
    });

    it('returns no mains and no balance when the house has no Emporia channel', () => {
      const roles = detectRoles(buildStateManager([houseDevices()[4]]), null);
      expect(roles.mains).to.equal(null);
      expect(roles.balance).to.equal(null);
      expect(roles.circuits).to.deep.equal([]);
      expect(roles.plugs).to.have.lengthOf(1);
    });

    it('lets a valid override device win for mains, and turns the Emporia 1-2-3 into a circuit', () => {
      const roles = detectRoles(buildStateManager(houseDevices()), 'zigbee-plug');
      expect(roles.mains_source).to.equal('override');
      expect(roles.mains.device_selector).to.equal('zigbee-plug');
      expect(roles.mains.power_feature_selector).to.equal('zigbee-plug-power');
      expect(roles.circuits.map((role) => role.device_selector)).to.deep.equal([
        'emporia-garage',
        'emporia-kitchen',
        'emporia-mains',
      ]);
      expect(roles.plugs).to.deep.equal([]);
    });

    it('falls back to auto-detection when the override is unknown or has no power feature', () => {
      const unknown = detectRoles(buildStateManager(houseDevices()), 'no-such-device');
      expect(unknown.mains_source).to.equal('auto');
      expect(unknown.mains.device_selector).to.equal('emporia-mains');

      const noPower = buildDevice('no-power-device', 'x', 'Other', []);
      const withoutPower = detectRoles(buildStateManager([...houseDevices(), noPower]), 'no-power-device');
      expect(withoutPower.mains_source).to.equal('auto');
    });

    it('uses the first matching 1-2-3 device by selector when two Emporia meters share it', () => {
      const roles = detectRoles(
        buildStateManager([emporiaChannel('b-meter', 'emporia-2:1-2-3'), emporiaChannel('a-meter', 'emporia-1:1-2-3')]),
        null,
      );
      expect(roles.mains.device_selector).to.equal('a-meter');
      expect(roles.circuits.map((role) => role.device_selector)).to.deep.equal(['b-meter']);
    });
  });

  describe('getMainsOverride', () => {
    it('returns null when the variable is unset or empty, and the selector otherwise', async () => {
      const values = new Map();
      const variable = { getValue: async (key) => (values.has(key) ? values.get(key) : null) };
      expect(await getMainsOverride(variable)).to.equal(null);
      values.set(MAINS_OVERRIDE_VARIABLE, '');
      expect(await getMainsOverride(variable)).to.equal(null);
      values.set(MAINS_OVERRIDE_VARIABLE, 'zigbee-plug');
      expect(await getMainsOverride(variable)).to.equal('zigbee-plug');
    });

    it('reads the HAWRAY_POWER_MAINS_DEVICE variable from the real variable manager', async () => {
      const variable = new Variable(new EventEmitter());
      expect(await getMainsOverride(variable)).to.equal(null);
    });
  });

  describe('validateMainsDevice', () => {
    it('returns the device when it exists and has a power feature', () => {
      const stateManager = buildStateManager(houseDevices());
      expect(validateMainsDevice(stateManager, 'zigbee-plug').selector).to.equal('zigbee-plug');
    });

    it('rejects an unknown device and a device without a power feature', () => {
      const stateManager = buildStateManager([...houseDevices(), buildDevice('bare', 'b', 'Other', [])]);
      expect(() => validateMainsDevice(stateManager, 'nope')).to.throw(BadParameters, 'Unknown device selector');
      expect(() => validateMainsDevice(stateManager, 'bare')).to.throw(BadParameters, 'has no power feature');
    });
  });
});
