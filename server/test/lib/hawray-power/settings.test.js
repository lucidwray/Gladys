const { expect } = require('chai');
const { randomUUID } = require('crypto');
const EventEmitter = require('events');
const StateManager = require('../../../lib/state');
const { BadParameters } = require('../../../utils/coreErrors');
const { MAINS_OVERRIDE_VARIABLE } = require('../../../lib/hawray-power/constants');
const { setMainsOverride } = require('../../../lib/hawray-power/settings');

const buildDeps = () => {
  const stateManager = new StateManager(new EventEmitter());
  const powerDevice = {
    id: randomUUID(),
    selector: 'settings-plug',
    name: 'Settings plug',
    features: [{ id: randomUUID(), selector: 'settings-plug-power', category: 'switch', type: 'power' }],
  };
  stateManager.setState('device', powerDevice.selector, powerDevice);
  powerDevice.features.forEach((feature) => stateManager.setState('deviceFeature', feature.selector, feature));
  const bare = { id: randomUUID(), selector: 'settings-bare', name: 'Bare', features: [] };
  stateManager.setState('device', bare.selector, bare);
  const writes = [];
  const variable = {
    setValue: async (key, value) => {
      writes.push([key, value]);
      return { name: key, value };
    },
  };
  return { deps: { stateManager, variable }, writes };
};

describe('hawray power settings', () => {
  it('stores a valid device selector under HAWRAY_POWER_MAINS_DEVICE', async () => {
    const { deps, writes } = buildDeps();
    const result = await setMainsOverride(deps, 'settings-plug');
    expect(result).to.deep.equal({ mains_device_selector: 'settings-plug' });
    expect(writes).to.deep.equal([[MAINS_OVERRIDE_VARIABLE, 'settings-plug']]);
  });

  it('clears the override with an empty, null or missing selector', async () => {
    const { deps, writes } = buildDeps();
    expect(await setMainsOverride(deps, '')).to.deep.equal({ mains_device_selector: null });
    expect(await setMainsOverride(deps, null)).to.deep.equal({ mains_device_selector: null });
    expect(await setMainsOverride(deps, undefined)).to.deep.equal({ mains_device_selector: null });
    expect(writes).to.deep.equal([
      [MAINS_OVERRIDE_VARIABLE, ''],
      [MAINS_OVERRIDE_VARIABLE, ''],
      [MAINS_OVERRIDE_VARIABLE, ''],
    ]);
  });

  it('refuses a non-string selector, an unknown device and a device without power, and writes nothing', async () => {
    const { deps, writes } = buildDeps();
    let error;
    try {
      await setMainsOverride(deps, 42);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(BadParameters);
    expect(error.message).to.include('Invalid mains_device_selector');

    try {
      await setMainsOverride(deps, 'settings-unknown');
    } catch (e) {
      error = e;
    }
    expect(error.message).to.include('Unknown device selector: settings-unknown');

    try {
      await setMainsOverride(deps, 'settings-bare');
    } catch (e) {
      error = e;
    }
    expect(error.message).to.include('has no power feature');
    expect(writes).to.deep.equal([]);
  });
});
