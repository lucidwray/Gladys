const { expect } = require('chai');
const sinon = require('sinon').createSandbox();

const { stub } = sinon;
const {
  getSceneSwitches,
  saveSceneSwitchToggleState,
  toggleStateVariable,
} = require('../../../../services/homekit/lib/sceneSwitches');
const logger = require('../../../../utils/logger');

const SERVICE_ID = '7056e3d4-31cc-4d2a-bbdd-128cd49755e6';
const SCENE_ON = '5d4f2a1e-7d6c-4f0e-9a3b-1f2e3d4c5b6a';
const SCENE_OFF = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const SCENES = [
  { id: SCENE_ON, name: 'Cinéma', selector: 'cinema' },
  { id: SCENE_OFF, name: 'Lumière', selector: 'lumiere' },
];

const MOMENTARY = { id: 'movie-night', name: 'Soirée cinéma', type: 'momentary', on_scene_id: SCENE_ON };
const TOGGLE = {
  id: 'reading-lamp',
  name: 'Lampe lecture',
  type: 'toggle',
  on_scene_id: SCENE_ON,
  off_scene_id: SCENE_OFF,
};

/**
 * @description Build a handler whose variables and scenes are given by the test.
 * @param {object} variables - Variable values by name, absent means unset.
 * @returns {object} The handler.
 * @example
 * const handler = buildHandler({ HOMEKIT_SCENE_SWITCHES: '[]' });
 */
function buildHandler(variables = {}) {
  return {
    serviceId: SERVICE_ID,
    getSceneSwitches,
    saveSceneSwitchToggleState,
    gladys: {
      variable: {
        getValue: stub().callsFake(async (key) => (key in variables ? variables[key] : null)),
        setValue: stub().resolves(),
      },
      scene: {
        get: stub().resolves(SCENES),
      },
    },
  };
}

describe('Scene switch configuration', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('should name the variable of a toggle after its id', () => {
    expect(toggleStateVariable('movie-night')).to.equal('HOMEKIT_SCENE_TOGGLE_STATE_MOVIE_NIGHT');
    expect(toggleStateVariable('a1-b2')).to.equal('HOMEKIT_SCENE_TOGGLE_STATE_A1_B2');
  });

  it('should expose nothing and not look up scenes when the variable is unset', async () => {
    const handler = buildHandler();

    expect(await handler.getSceneSwitches()).to.deep.equal([]);
    expect(handler.gladys.scene.get.callCount).to.equal(0);
  });

  it('should expose nothing and warn when the variable is not JSON', async () => {
    const handler = buildHandler({ HOMEKIT_SCENE_SWITCHES: '{not json' });
    const loggerWarn = stub(logger, 'warn');

    expect(await handler.getSceneSwitches()).to.deep.equal([]);
    expect(loggerWarn.callCount).to.equal(1);
    expect(loggerWarn.args[0][0]).to.contain('unable to parse HOMEKIT_SCENE_SWITCHES');
  });

  it('should expose nothing and warn when the variable is not an array', async () => {
    const handler = buildHandler({ HOMEKIT_SCENE_SWITCHES: JSON.stringify({ id: 'movie-night' }) });
    const loggerWarn = stub(logger, 'warn');

    expect(await handler.getSceneSwitches()).to.deep.equal([]);
    expect(loggerWarn.args[0][0]).to.contain('is not an array');
  });

  it('should expose nothing without looking up scenes when the array is empty', async () => {
    const handler = buildHandler({ HOMEKIT_SCENE_SWITCHES: '[]' });

    expect(await handler.getSceneSwitches()).to.deep.equal([]);
    expect(handler.gladys.scene.get.callCount).to.equal(0);
  });

  it('should expose a momentary switch and a toggle with the state the toggle was left in', async () => {
    const handler = buildHandler({
      HOMEKIT_SCENE_SWITCHES: JSON.stringify([MOMENTARY, TOGGLE]),
      HOMEKIT_SCENE_TOGGLE_STATE_READING_LAMP: '1',
    });

    expect(await handler.getSceneSwitches()).to.deep.equal([
      {
        id: 'movie-night',
        name: 'Soirée cinéma',
        type: 'momentary',
        onSceneId: SCENE_ON,
        offSceneId: null,
        initialState: false,
      },
      {
        id: 'reading-lamp',
        name: 'Lampe lecture',
        type: 'toggle',
        onSceneId: SCENE_ON,
        offSceneId: SCENE_OFF,
        initialState: true,
      },
    ]);
  });

  it('should start a toggle off when its remembered state is 0 or missing', async () => {
    const handler = buildHandler({
      HOMEKIT_SCENE_SWITCHES: JSON.stringify([TOGGLE]),
      HOMEKIT_SCENE_TOGGLE_STATE_READING_LAMP: '0',
    });
    expect((await handler.getSceneSwitches())[0].initialState).to.equal(false);

    const handlerWithoutState = buildHandler({ HOMEKIT_SCENE_SWITCHES: JSON.stringify([TOGGLE]) });
    expect((await handlerWithoutState.getSceneSwitches())[0].initialState).to.equal(false);
  });

  it('should read only the scene switch variables, never the exposure settings', async () => {
    const handler = buildHandler({
      HOMEKIT_SCENE_SWITCHES: JSON.stringify([MOMENTARY]),
      HOMEKIT_EXPOSURE_MODE: 'selection',
    });

    await handler.getSceneSwitches();

    const readKeys = handler.gladys.variable.getValue.args.map(([key]) => key);
    expect(readKeys).to.deep.equal(['HOMEKIT_SCENE_SWITCHES']);
  });

  const invalidEntries = [
    ['is not an object', 'momentary', 'it is not an object'],
    ['is null', null, 'it is not an object'],
    ['has no id', { ...MOMENTARY, id: undefined }, 'missing id'],
    ['has an empty id', { ...MOMENTARY, id: '' }, 'missing id'],
    ['has an id with capitals', { ...MOMENTARY, id: 'Movie_Night' }, 'invalid id'],
    ['has an id longer than 64 characters', { ...MOMENTARY, id: 'a'.repeat(65) }, 'invalid id'],
    ['has an empty name', { ...MOMENTARY, name: '   ' }, 'empty name'],
    ['has a name that is not text', { ...MOMENTARY, name: 42 }, 'empty name'],
    ['has an unknown type', { ...MOMENTARY, type: 'dimmer' }, 'unknown type "dimmer"'],
    ['has no on scene', { ...MOMENTARY, on_scene_id: undefined }, 'missing on_scene_id'],
    ['is a toggle without off scene', { ...TOGGLE, off_scene_id: '' }, 'toggle without off_scene_id'],
    ['points at a scene that does not exist', { ...MOMENTARY, on_scene_id: 'deleted' }, 'scene deleted does not exist'],
    [
      'is a toggle whose off scene does not exist',
      { ...TOGGLE, off_scene_id: 'deleted' },
      'off scene deleted does not exist',
    ],
  ];

  invalidEntries.forEach(([description, entry, problem]) => {
    it(`should skip an entry that ${description} and name it in the log`, async () => {
      const handler = buildHandler({ HOMEKIT_SCENE_SWITCHES: JSON.stringify([entry, MOMENTARY]) });
      const loggerWarn = stub(logger, 'warn');

      const sceneSwitches = await handler.getSceneSwitches();

      expect(sceneSwitches.map(({ id }) => id)).to.deep.equal(['movie-night']);
      expect(loggerWarn.callCount).to.equal(1);
      expect(loggerWarn.args[0][0]).to.contain(problem);
      expect(loggerWarn.args[0][0]).to.contain('is skipped');
    });
  });

  it('should name an entry without a usable id by its position in the array', async () => {
    const handler = buildHandler({ HOMEKIT_SCENE_SWITCHES: JSON.stringify([MOMENTARY, { name: 'Sans id' }]) });
    const loggerWarn = stub(logger, 'warn');

    await handler.getSceneSwitches();

    expect(loggerWarn.args[0][0]).to.contain('scene switch number 2 is skipped');
  });

  it('should keep the first valid entry when two share an id', async () => {
    const handler = buildHandler({
      HOMEKIT_SCENE_SWITCHES: JSON.stringify([MOMENTARY, { ...TOGGLE, id: 'movie-night' }]),
    });
    const loggerWarn = stub(logger, 'warn');

    const sceneSwitches = await handler.getSceneSwitches();

    expect(sceneSwitches.map(({ type }) => type)).to.deep.equal(['momentary']);
    expect(loggerWarn.args[0][0]).to.contain('duplicate id');
  });

  it('should expose the valid entries when every other one is broken', async () => {
    const handler = buildHandler({ HOMEKIT_SCENE_SWITCHES: JSON.stringify([{ id: 'x' }, TOGGLE]) });
    stub(logger, 'warn');

    const sceneSwitches = await handler.getSceneSwitches();

    expect(sceneSwitches.map(({ id }) => id)).to.deep.equal(['reading-lamp']);
  });

  it('should remember a toggle state in its own variable', async () => {
    const handler = buildHandler();

    await saveSceneSwitchToggleState.call(handler, 'reading-lamp', true);
    await saveSceneSwitchToggleState.call(handler, 'reading-lamp', false);

    expect(handler.gladys.variable.setValue.args).to.deep.equal([
      ['HOMEKIT_SCENE_TOGGLE_STATE_READING_LAMP', '1', SERVICE_ID],
      ['HOMEKIT_SCENE_TOGGLE_STATE_READING_LAMP', '0', SERVICE_ID],
    ]);
  });

  it('should log a failure to remember a toggle state without raising it', async () => {
    const handler = buildHandler();
    handler.gladys.variable.setValue = stub().rejects(new Error('database is locked'));
    const loggerWarn = stub(logger, 'warn');

    await saveSceneSwitchToggleState.call(handler, 'reading-lamp', true);

    expect(loggerWarn.callCount).to.equal(1);
    expect(loggerWarn.args[0][0]).to.contain('could not remember the state of scene switch reading-lamp');
  });
});
