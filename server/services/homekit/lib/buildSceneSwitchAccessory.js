const { NotFoundError } = require('../../../utils/coreErrors');
const logger = require('../../../utils/logger');
const { sanitizeName } = require('./sanitizeName');
const { SCENE_SWITCH_TYPES } = require('./sceneSwitches');

// How long a momentary switch stays on. Long enough for the Home app to show the press, short enough
// that the switch reads as a button rather than as a state.
const MOMENTARY_DURATION_MS = 1000;

/**
 * @description Run a scene of Gladys. The scene is looked up by id at the moment of the press, so a scene
 * that was renamed or whose selector changed keeps working. `execute` cannot report how a scene ended,
 * so the one failure it can see, a scene that no longer exists, is thrown here.
 * @param {object} gladys - Gladys instance.
 * @param {string} sceneId - Id of the scene to run.
 * @returns {Promise} Resolves once the scene is queued.
 * @example
 * await runScene(gladys, '5d4f2a1e-...');
 */
async function runScene(gladys, sceneId) {
  const scenes = await gladys.scene.get();
  const scene = scenes.find(({ id }) => id === sceneId);

  if (scene === undefined) {
    throw new NotFoundError(`scene ${sceneId} does not exist anymore`);
  }

  gladys.scene.execute(scene.selector);
}

/**
 * @description Build the error answered to a Home app request whose scene could not run. HAP shows it as a
 * communication failure. The scene did not start, so that is what it is.
 * @param {object} hap - hap-nodejs module.
 * @returns {object} HAP status error to pass to the callback.
 * @example
 * callback(hapCommunicationFailure(hap));
 */
function hapCommunicationFailure(hap) {
  return new hap.HapStatusError(hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
}

/**
 * @description Cancel the momentary switches still waiting to turn back off. Called when the bridge is
 * stopped or reset, so no timer fires on accessories the bridge no longer carries.
 * @example
 * clearSceneSwitchTimers.call(homekitHandler);
 */
function clearSceneSwitchTimers() {
  // The handler creates this map in its constructor. A handler without one has no timer to cancel.
  if (!this.sceneSwitchTimeouts) {
    return;
  }

  this.sceneSwitchTimeouts.forEach((timeout) => clearTimeout(timeout));
  this.sceneSwitchTimeouts.clear();
}

/**
 * @description Create the HomeKit accessory of a scene switch: one Switch that runs a Gladys scene when
 * it is turned on. A momentary switch turns itself back off after a moment; a toggle keeps its state and
 * runs its off scene when it is turned off.
 * @param {object} sceneSwitch - Scene switch read from the configuration.
 * @returns {object} HomeKit accessory to expose.
 * @example
 * buildSceneSwitchAccessory({ id: 'movie-night', name: 'Soirée cinéma', type: 'momentary', onSceneId: '...' });
 */
function buildSceneSwitchAccessory(sceneSwitch) {
  const { Characteristic, CharacteristicEventTypes, Service } = this.hap;
  const { id, type, onSceneId, offSceneId } = sceneSwitch;

  // The UUID comes from the id of the switch alone. Renaming it or pointing it at other scenes keeps the
  // accessory, and with it its room and its automations in the Home app.
  const switchName = sanitizeName(sceneSwitch.name);
  const accessory = new this.hap.Accessory(switchName, this.hap.uuid.generate(`gladys-scene-switch:${id}`));
  const service = new Service.Switch(switchName);

  let on = sceneSwitch.initialState === true;

  const pressMomentary = async (value, callback) => {
    // Turning the switch off has nothing to undo: it turns itself off a moment after it was turned on.
    if (!value) {
      callback();
      return;
    }

    try {
      await runScene(this.gladys, onSceneId);
    } catch (e) {
      logger.warn(`HomeKit: scene switch ${id} could not run its scene: ${e.message}`);
      // The switch stays as it was: a press that ran nothing must not light the switch up.
      callback(hapCommunicationFailure(this.hap));
      return;
    }

    // A press during the window restarts it, so the switch stays on for a full second after the last press.
    const pending = this.sceneSwitchTimeouts.get(id);
    if (pending !== undefined) {
      clearTimeout(pending);
    }

    on = true;
    this.sceneSwitchTimeouts.set(
      id,
      setTimeout(() => {
        this.sceneSwitchTimeouts.delete(id);
        on = false;
        service.updateCharacteristic(Characteristic.On, false);
      }, MOMENTARY_DURATION_MS),
    );
    callback();
  };

  const applyToggle = async (value, callback) => {
    // Always run the scene for the position asked for, even when the switch already shows it: an explicit
    // "turn on" from the Home app must start the scene, not be swallowed because nothing changed.
    const turnOn = Boolean(value);

    try {
      await runScene(this.gladys, turnOn ? onSceneId : offSceneId);
    } catch (e) {
      logger.warn(`HomeKit: scene switch ${id} could not run its scene: ${e.message}`);
      callback(hapCommunicationFailure(this.hap));
      return;
    }

    on = turnOn;
    await this.saveSceneSwitchToggleState(id, turnOn);
    callback();
  };

  // Toggle sets on one switch run one after another. Two overlapping sets would otherwise interleave at
  // the awaits above, and the state kept in memory and remembered could end on the older value. The chain
  // never rejects: a callback that throws is logged and the next set still runs.
  let toggleQueue = Promise.resolve();
  const setToggle = (value, callback) => {
    const applied = toggleQueue.then(() => applyToggle(value, callback));
    toggleQueue = applied.then(
      () => undefined,
      (e) => logger.error(`HomeKit: scene switch ${id} could not answer a set: ${e.message}`),
    );
    return toggleQueue;
  };

  const onCharacteristic = service.getCharacteristic(Characteristic.On);
  onCharacteristic.on(CharacteristicEventTypes.GET, (callback) => callback(undefined, on));
  onCharacteristic.on(CharacteristicEventTypes.SET, type === SCENE_SWITCH_TYPES.MOMENTARY ? pressMomentary : setToggle);

  accessory.addService(service);

  return accessory;
}

module.exports = {
  buildSceneSwitchAccessory,
  clearSceneSwitchTimers,
  MOMENTARY_DURATION_MS,
};
