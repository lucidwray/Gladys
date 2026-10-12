const { expect } = require('chai');
const sinon = require('sinon').createSandbox();

const { stub } = sinon;
const {
  buildSceneSwitchAccessory,
  clearSceneSwitchTimers,
  MOMENTARY_DURATION_MS,
} = require('../../../../services/homekit/lib/buildSceneSwitchAccessory');
const { saveSceneSwitchToggleState } = require('../../../../services/homekit/lib/sceneSwitches');
const logger = require('../../../../utils/logger');

const SCENE_ON = '5d4f2a1e-7d6c-4f0e-9a3b-1f2e3d4c5b6a';
const SCENE_OFF = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const SCENES = [
  { id: SCENE_ON, name: 'Cinéma', selector: 'cinema' },
  { id: SCENE_OFF, name: 'Lumière', selector: 'lumiere' },
];

const MOMENTARY = { id: 'movie-night', name: 'Movie_Night', type: 'momentary', onSceneId: SCENE_ON, offSceneId: null };
const TOGGLE = {
  id: 'reading-lamp',
  name: 'Lampe lecture',
  type: 'toggle',
  onSceneId: SCENE_ON,
  offSceneId: SCENE_OFF,
  initialState: false,
};

/**
 * @description Stand-in for hap-nodejs HapStatusError: an error carrying the HAP status it answers with.
 * @example
 * new HapStatusError(-70402);
 */
class HapStatusError extends Error {
  constructor(hapStatus) {
    super(`HAP status ${hapStatus}`);
    this.hapStatus = hapStatus;
  }
}

/**
 * @description Build the hand-made HAP objects a scene switch touches: one On characteristic whose
 * handlers are kept, one service, and a UUID generator that echoes its seed.
 * @returns {object} The HAP stub and what it recorded.
 * @example
 * const { hap, onHandlers } = buildHapStub();
 */
function buildHapStub() {
  const onHandlers = {};
  const onCharacteristic = {
    on: (event, handler) => {
      onHandlers[event] = handler;
      return onCharacteristic;
    },
  };
  const service = {
    getCharacteristic: stub().returns(onCharacteristic),
    updateCharacteristic: stub(),
  };
  const addService = stub();

  const hap = {
    Accessory: stub().returns({ addService }),
    Service: { Switch: stub().returns(service) },
    Characteristic: { On: 'ON' },
    CharacteristicEventTypes: { GET: 'get', SET: 'set' },
    uuid: { generate: stub().callsFake((seed) => `uuid(${seed})`) },
    HapStatusError,
    HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
  };

  return { hap, onHandlers, service, addService };
}

/**
 * @description Build a handler with a scene list, a Gladys stub and the scene switch timer map.
 * @param {object} [overrides] - Properties to replace.
 * @returns {object} The handler.
 * @example
 * const handler = buildHandler({ gladys: {...} });
 */
function buildHandler(overrides = {}) {
  const { hap, onHandlers, service, addService } = buildHapStub();

  return {
    serviceId: '7056e3d4-31cc-4d2a-bbdd-128cd49755e6',
    hap,
    buildSceneSwitchAccessory,
    saveSceneSwitchToggleState,
    sceneSwitchTimeouts: new Map(),
    gladys: {
      scene: {
        get: stub().resolves(SCENES),
        execute: stub(),
      },
      variable: {
        setValue: stub().resolves(),
      },
    },
    onHandlers,
    service,
    addService,
    ...overrides,
  };
}

/**
 * @description Read the On characteristic as the Home app would.
 * @param {object} onHandlers - Handlers kept by the stub.
 * @returns {Promise<boolean>} The value answered.
 * @example
 * await readOn(onHandlers);
 */
function readOn(onHandlers) {
  return new Promise((resolve) => {
    onHandlers.get((error, value) => resolve(value));
  });
}

/**
 * @description Set the On characteristic as the Home app would, and wait for the answer.
 * @param {object} onHandlers - Handlers kept by the stub.
 * @param {boolean} value - Value asked for.
 * @returns {Promise<object>} The error answered, undefined on success.
 * @example
 * await setOn(onHandlers, true);
 */
function setOn(onHandlers, value) {
  return new Promise((resolve) => {
    onHandlers.set(value, (error) => resolve(error));
  });
}

describe('Build scene switch accessory', () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should identify the accessory by the id of the switch and name it after sanitized name', () => {
    const handler = buildHandler();

    buildSceneSwitchAccessory.call(handler, MOMENTARY);

    expect(handler.hap.uuid.generate.args[0][0]).to.equal('gladys-scene-switch:movie-night');
    expect(handler.hap.Accessory.args[0]).to.deep.equal(['Movie Night', 'uuid(gladys-scene-switch:movie-night)']);
    expect(handler.hap.Service.Switch.args[0][0]).to.equal('Movie Night');
    expect(handler.addService.callCount).to.equal(1);
  });

  it('should keep the same identity when the switch is renamed or pointed at other scenes', () => {
    const handler = buildHandler();

    buildSceneSwitchAccessory.call(handler, { ...MOMENTARY, name: 'Ciné', onSceneId: SCENE_OFF });

    expect(handler.hap.Accessory.args[0][1]).to.equal('uuid(gladys-scene-switch:movie-night)');
  });

  describe('momentary', () => {
    it('should run its scene on press, read on for one second, then turn itself off', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, MOMENTARY);

      expect(await readOn(handler.onHandlers)).to.equal(false);

      expect(await setOn(handler.onHandlers, true)).to.equal(undefined);
      expect(handler.gladys.scene.execute.args).to.deep.equal([['cinema']]);
      expect(await readOn(handler.onHandlers)).to.equal(true);
      expect(handler.service.updateCharacteristic.callCount).to.equal(0);

      clock.tick(MOMENTARY_DURATION_MS - 1);
      expect(handler.service.updateCharacteristic.callCount).to.equal(0);

      clock.tick(1);
      expect(handler.service.updateCharacteristic.args).to.deep.equal([['ON', false]]);
      expect(await readOn(handler.onHandlers)).to.equal(false);
      expect(handler.sceneSwitchTimeouts.size).to.equal(0);
    });

    it('should answer a switch off without running anything', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, MOMENTARY);

      expect(await setOn(handler.onHandlers, false)).to.equal(undefined);
      expect(handler.gladys.scene.execute.callCount).to.equal(0);
      expect(await readOn(handler.onHandlers)).to.equal(false);
    });

    it('should restart the second behind a press that comes during its window', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, MOMENTARY);

      await setOn(handler.onHandlers, true);
      clock.tick(600);
      await setOn(handler.onHandlers, true);
      clock.tick(600);

      expect(handler.gladys.scene.execute.callCount).to.equal(2);
      expect(await readOn(handler.onHandlers)).to.equal(true);
      expect(handler.service.updateCharacteristic.callCount).to.equal(0);
      expect(handler.sceneSwitchTimeouts.size).to.equal(1);

      clock.tick(400);
      expect(handler.service.updateCharacteristic.args).to.deep.equal([['ON', false]]);
    });

    it('should answer the error and stay as it was when its scene no longer exists', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, MOMENTARY);
      handler.gladys.scene.get = stub().resolves([]);
      const loggerWarn = stub(logger, 'warn');

      const error = await setOn(handler.onHandlers, true);

      expect(error).to.be.an.instanceOf(HapStatusError);
      expect(error.hapStatus).to.equal(-70402);
      expect(handler.gladys.scene.execute.callCount).to.equal(0);
      expect(await readOn(handler.onHandlers)).to.equal(false);
      expect(handler.sceneSwitchTimeouts.size).to.equal(0);
      expect(loggerWarn.args[0][0]).to.contain('scene switch movie-night could not run its scene');
      expect(loggerWarn.args[0][0]).to.contain(`scene ${SCENE_ON} does not exist anymore`);
    });

    it('should keep a switch that is on, on, when a later press finds its scene gone', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, MOMENTARY);
      stub(logger, 'warn');

      await setOn(handler.onHandlers, true);
      handler.gladys.scene.get = stub().resolves([]);
      const error = await setOn(handler.onHandlers, true);

      expect(error).to.be.an.instanceOf(HapStatusError);
      expect(await readOn(handler.onHandlers)).to.equal(true);
      clock.tick(MOMENTARY_DURATION_MS);
      expect(handler.service.updateCharacteristic.args).to.deep.equal([['ON', false]]);
    });

    it('should cancel a pending reset when the bridge is stopped or reset', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, MOMENTARY);

      await setOn(handler.onHandlers, true);
      clearSceneSwitchTimers.call(handler);
      clock.tick(MOMENTARY_DURATION_MS);

      expect(handler.service.updateCharacteristic.callCount).to.equal(0);
      expect(handler.sceneSwitchTimeouts.size).to.equal(0);
    });

    it('should cancel nothing when the handler has no timer map', () => {
      expect(() => clearSceneSwitchTimers.call({})).to.not.throw();
    });
  });

  describe('toggle', () => {
    it('should start from the state it was built with', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, { ...TOGGLE, initialState: true });

      expect(await readOn(handler.onHandlers)).to.equal(true);
    });

    it('should run the on scene when turned on, and the off scene when turned off', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, TOGGLE);

      expect(await setOn(handler.onHandlers, true)).to.equal(undefined);
      expect(await readOn(handler.onHandlers)).to.equal(true);
      expect(await setOn(handler.onHandlers, false)).to.equal(undefined);
      expect(await readOn(handler.onHandlers)).to.equal(false);

      expect(handler.gladys.scene.execute.args).to.deep.equal([['cinema'], ['lumiere']]);
      expect(handler.sceneSwitchTimeouts.size).to.equal(0);
    });

    it('should run the scene even when the switch already shows the position asked for', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, { ...TOGGLE, initialState: true });

      await setOn(handler.onHandlers, true);

      expect(handler.gladys.scene.execute.args).to.deep.equal([['cinema']]);
    });

    it('should remember each new state in its own variable', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, TOGGLE);

      await setOn(handler.onHandlers, true);
      await setOn(handler.onHandlers, false);

      expect(handler.gladys.variable.setValue.args).to.deep.equal([
        ['HOMEKIT_SCENE_TOGGLE_STATE_READING_LAMP', '1', handler.serviceId],
        ['HOMEKIT_SCENE_TOGGLE_STATE_READING_LAMP', '0', handler.serviceId],
      ]);
    });

    it('should still report the new state when it could not be remembered', async () => {
      const handler = buildHandler();
      handler.gladys.variable.setValue = stub().rejects(new Error('database is locked'));
      buildSceneSwitchAccessory.call(handler, TOGGLE);
      const loggerWarn = stub(logger, 'warn');

      expect(await setOn(handler.onHandlers, true)).to.equal(undefined);

      expect(await readOn(handler.onHandlers)).to.equal(true);
      expect(loggerWarn.callCount).to.equal(1);
    });

    it('should end on the last of two overlapping sets, in the state and in the variable', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, TOGGLE);
      // The scene lookup of the first set answers last: unserialized, the first set would finish after the
      // second one and leave the switch on.
      let answerFirstLookup;
      handler.gladys.scene.get = stub()
        .onFirstCall()
        .returns(
          new Promise((resolve) => {
            answerFirstLookup = () => resolve(SCENES);
          }),
        )
        .resolves(SCENES);

      const firstSet = setOn(handler.onHandlers, true);
      const secondSet = setOn(handler.onHandlers, false);
      // Let everything that can run run: the second set must wait behind the first one.
      await new Promise((resolve) => {
        setImmediate(resolve);
      });
      expect(handler.gladys.scene.get.callCount).to.equal(1);
      expect(handler.gladys.scene.execute.callCount).to.equal(0);
      answerFirstLookup();
      await Promise.all([firstSet, secondSet]);

      expect(handler.gladys.scene.execute.args).to.deep.equal([['cinema'], ['lumiere']]);
      expect(await readOn(handler.onHandlers)).to.equal(false);
      expect(handler.gladys.variable.setValue.args.map(([, value]) => value)).to.deep.equal(['1', '0']);
    });

    it('should keep answering the next set when a callback throws', async () => {
      const handler = buildHandler();
      buildSceneSwitchAccessory.call(handler, TOGGLE);
      const loggerError = stub(logger, 'error');

      const thrown = new Promise((resolve) => {
        handler.onHandlers.set(true, () => {
          resolve();
          throw new Error('callback exploded');
        });
      });
      await thrown;
      await setOn(handler.onHandlers, false);

      expect(await readOn(handler.onHandlers)).to.equal(false);
      expect(handler.gladys.scene.execute.args).to.deep.equal([['cinema'], ['lumiere']]);
      expect(loggerError.args[0][0]).to.contain('could not answer a set: callback exploded');
    });

    it('should answer the error and keep its state when the scene no longer exists', async () => {
      const handler = buildHandler({
        gladys: { scene: { get: stub().resolves([]), execute: stub() }, variable: { setValue: stub() } },
      });
      buildSceneSwitchAccessory.call(handler, TOGGLE);
      const loggerWarn = stub(logger, 'warn');

      const error = await setOn(handler.onHandlers, true);

      expect(error).to.be.an.instanceOf(HapStatusError);
      expect(await readOn(handler.onHandlers)).to.equal(false);
      expect(handler.gladys.variable.setValue.callCount).to.equal(0);
      expect(loggerWarn.args[0][0]).to.contain('scene switch reading-lamp could not run its scene');
    });
  });
});
