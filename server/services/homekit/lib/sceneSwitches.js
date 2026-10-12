const logger = require('../../../utils/logger');

// Scene switches are HomeKit switches that run a Gladys scene. They are configured on the HomeKit
// page and kept apart from the device exposure list: a scene is never exposed by "all devices" mode
// and never shows up among the devices offered to the user.
const SCENE_SWITCHES_VARIABLE = 'HOMEKIT_SCENE_SWITCHES';
const SCENE_SWITCH_TOGGLE_STATE_PREFIX = 'HOMEKIT_SCENE_TOGGLE_STATE_';

const SCENE_SWITCH_TYPES = {
  MOMENTARY: 'momentary',
  TOGGLE: 'toggle',
};

// The id is part of the accessory identity and of a variable name, so it is kept to a plain form.
const SCENE_SWITCH_ID_PATTERN = /^[a-z0-9-]{1,64}$/;

/**
 * @description Name of the variable remembering whether a toggle scene switch is on. One variable per
 * toggle, so two toggles flipped at the same moment never race on a shared value.
 * @param {string} id - Id of the scene switch.
 * @returns {string} Name of the variable.
 * @example
 * toggleStateVariable('movie-night'); // 'HOMEKIT_SCENE_TOGGLE_STATE_MOVIE_NIGHT'
 */
function toggleStateVariable(id) {
  return `${SCENE_SWITCH_TOGGLE_STATE_PREFIX}${id.replace(/-/g, '_').toUpperCase()}`;
}

/**
 * @description Check one entry of the configuration.
 * @param {*} entry - Entry as written in the configuration.
 * @param {Set<string>} sceneIds - Ids of the scenes that exist in Gladys.
 * @param {Set<string>} acceptedIds - Ids of the entries already accepted.
 * @returns {object} Either `{ problem }` naming why the entry is refused, or `{ sceneSwitch }`.
 * @example
 * checkEntry({ id: 'a', name: 'A', type: 'momentary', on_scene_id: 's1' }, new Set(['s1']), new Set());
 */
function checkEntry(entry, sceneIds, acceptedIds) {
  if (entry === null || typeof entry !== 'object') {
    return { problem: 'it is not an object' };
  }
  const { id, name, type, on_scene_id: onSceneId, off_scene_id: offSceneId } = entry;

  if (typeof id !== 'string' || id === '') {
    return { problem: 'missing id' };
  }
  if (!SCENE_SWITCH_ID_PATTERN.test(id)) {
    return { problem: 'invalid id, use lowercase letters, digits and dashes only' };
  }
  if (acceptedIds.has(id)) {
    return { problem: 'duplicate id, the first entry with this id is kept' };
  }
  if (typeof name !== 'string' || name.trim() === '') {
    return { problem: 'empty name' };
  }
  if (type !== SCENE_SWITCH_TYPES.MOMENTARY && type !== SCENE_SWITCH_TYPES.TOGGLE) {
    return { problem: `unknown type ${JSON.stringify(type)}` };
  }
  if (typeof onSceneId !== 'string' || onSceneId === '') {
    return { problem: 'missing on_scene_id' };
  }
  if (type === SCENE_SWITCH_TYPES.TOGGLE && (typeof offSceneId !== 'string' || offSceneId === '')) {
    return { problem: 'toggle without off_scene_id' };
  }
  if (!sceneIds.has(onSceneId)) {
    return { problem: `scene ${onSceneId} does not exist` };
  }
  if (type === SCENE_SWITCH_TYPES.TOGGLE && !sceneIds.has(offSceneId)) {
    return { problem: `off scene ${offSceneId} does not exist` };
  }

  return {
    sceneSwitch: {
      id,
      name,
      type,
      onSceneId,
      offSceneId: type === SCENE_SWITCH_TYPES.TOGGLE ? offSceneId : null,
    },
  };
}

/**
 * @description Read the scene switches configured by the user. Every entry is checked on its own: one
 * entry that is wrong is skipped and named in the log, and the others are still exposed.
 * @returns {Promise<Array>} The valid scene switches, each with the state a toggle was left in.
 * @example
 * const sceneSwitches = await getSceneSwitches();
 */
async function getSceneSwitches() {
  const rawConfiguration = await this.gladys.variable.getValue(SCENE_SWITCHES_VARIABLE, this.serviceId);
  if (!rawConfiguration) {
    return [];
  }

  let entries;
  try {
    entries = JSON.parse(rawConfiguration);
  } catch (e) {
    logger.warn(`HomeKit: unable to parse ${SCENE_SWITCHES_VARIABLE}, no scene switch will be exposed`);
    return [];
  }

  if (!Array.isArray(entries)) {
    logger.warn(`HomeKit: ${SCENE_SWITCHES_VARIABLE} is not an array, no scene switch will be exposed`);
    return [];
  }

  if (entries.length === 0) {
    return [];
  }

  const scenes = await this.gladys.scene.get();
  const sceneIds = new Set(scenes.map(({ id }) => id));
  const acceptedIds = new Set();
  const accepted = [];

  entries.forEach((entry, index) => {
    const { problem, sceneSwitch } = checkEntry(entry, sceneIds, acceptedIds);
    if (problem) {
      const label = entry && typeof entry.id === 'string' && entry.id !== '' ? entry.id : `number ${index + 1}`;
      logger.warn(`HomeKit: scene switch ${label} is skipped: ${problem}`);
      return;
    }
    acceptedIds.add(sceneSwitch.id);
    accepted.push(sceneSwitch);
  });

  return Promise.all(
    accepted.map(async (sceneSwitch) => {
      const remembered =
        sceneSwitch.type === SCENE_SWITCH_TYPES.TOGGLE
          ? await this.gladys.variable.getValue(toggleStateVariable(sceneSwitch.id), this.serviceId)
          : null;

      return { ...sceneSwitch, initialState: remembered === '1' };
    }),
  );
}

/**
 * @description Remember whether a toggle scene switch is on, so it is still on after a bridge reload.
 * A failure is logged and left at that: the scene already ran, and the switch must not report an error
 * for it.
 * @param {string} id - Id of the toggle scene switch.
 * @param {boolean} on - State the switch was just set to.
 * @returns {Promise} Resolves once the state is saved, or the failure is logged.
 * @example
 * saveSceneSwitchToggleState('movie-night', true);
 */
async function saveSceneSwitchToggleState(id, on) {
  try {
    await this.gladys.variable.setValue(toggleStateVariable(id), on ? '1' : '0', this.serviceId);
  } catch (e) {
    logger.warn(`HomeKit: could not remember the state of scene switch ${id}: ${e.message}`);
  }
}

module.exports = {
  SCENE_SWITCHES_VARIABLE,
  SCENE_SWITCH_TYPES,
  SCENE_SWITCH_ID_PATTERN,
  toggleStateVariable,
  checkEntry,
  getSceneSwitches,
  saveSceneSwitchToggleState,
};
