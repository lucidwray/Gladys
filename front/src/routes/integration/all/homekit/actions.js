import QRCode from 'qrcode';
import { RequestStatus } from '../../../../utils/consts';

const EXPOSURE_MODES = {
  ALL: 'all',
  SELECTION: 'selection'
};

// Scene switches: a HomeKit switch that runs a Gladys scene. The configuration is written by this page
// as the HOMEKIT_SCENE_SWITCHES variable, in the format the server reads.
const SCENE_SWITCH_TYPES = {
  MOMENTARY: 'momentary',
  TOGGLE: 'toggle'
};

const SCENE_SWITCH_PROBLEMS = {
  NAME: 'hawrayHomekitSceneSwitches.problemName',
  SCENE: 'hawrayHomekitSceneSwitches.problemScene',
  OFF_SCENE: 'hawrayHomekitSceneSwitches.problemOffScene'
};

// Same shape as the ids the server accepts: lowercase letters, digits and dashes. A plain generator is
// used because crypto.randomUUID does not exist on a page served over plain HTTP on the local network.
const newSceneSwitchId = () =>
  `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

/**
 * @description Turn the stored configuration into rows the page can edit. An unreadable configuration
 * gives no rows rather than an error: the page then starts empty, as it does before any switch exists.
 * @param {string} value - Raw value of the HOMEKIT_SCENE_SWITCHES variable.
 * @returns {Array} Rows, each with id, name, type, onSceneId and offSceneId.
 * @example
 * readSceneSwitchRows('[{"id":"a","name":"A","type":"momentary","on_scene_id":"s1"}]');
 */
function readSceneSwitchRows(value) {
  let entries;
  try {
    entries = JSON.parse(value);
  } catch (e) {
    return [];
  }
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .filter(entry => entry !== null && typeof entry === 'object')
    .map(entry => ({
      id: typeof entry.id === 'string' && entry.id !== '' ? entry.id : newSceneSwitchId(),
      name: typeof entry.name === 'string' ? entry.name : '',
      type: entry.type === SCENE_SWITCH_TYPES.TOGGLE ? SCENE_SWITCH_TYPES.TOGGLE : SCENE_SWITCH_TYPES.MOMENTARY,
      onSceneId: typeof entry.on_scene_id === 'string' ? entry.on_scene_id : '',
      offSceneId: typeof entry.off_scene_id === 'string' ? entry.off_scene_id : ''
    }));
}

/**
 * @description Check the rows of the page and turn them into the configuration the server reads. A
 * switch without a name takes the name of its on scene.
 * @param {Array} rows - Rows of the page, as read by readSceneSwitchRows.
 * @param {Array} scenes - Scenes that exist in Gladys.
 * @returns {object} Either `{ problem }` naming the first thing to fix, or `{ configuration }`.
 * @example
 * buildSceneSwitchConfiguration(rows, scenes);
 */
function buildSceneSwitchConfiguration(rows, scenes) {
  const sceneNames = new Map(scenes.map(scene => [scene.id, scene.name]));
  const problems = [];

  const configuration = rows.map(row => {
    const toggle = row.type === SCENE_SWITCH_TYPES.TOGGLE;
    const onSceneName = sceneNames.get(row.onSceneId);
    if (onSceneName === undefined) {
      problems.push(SCENE_SWITCH_PROBLEMS.SCENE);
    }
    if (toggle && !sceneNames.has(row.offSceneId)) {
      problems.push(SCENE_SWITCH_PROBLEMS.OFF_SCENE);
    }

    const name = String(row.name || '').trim() || onSceneName || '';
    if (name === '') {
      problems.push(SCENE_SWITCH_PROBLEMS.NAME);
    }

    return {
      id: row.id,
      name,
      type: row.type,
      on_scene_id: row.onSceneId,
      ...(toggle ? { off_scene_id: row.offSceneId } : {})
    };
  });

  return problems.length > 0 ? { problem: problems[0] } : { configuration };
}

const actions = store => ({
  async getHomeKitSettings(state) {
    store.setState({
      homekitGetSettingsStatus: RequestStatus.Getting
    });
    try {
      let homekitMdnsAdvertiser = 'bonjour-hap';
      let homekitExposureMode = EXPOSURE_MODES.ALL;
      let homekitExposedDevices = [];

      const { value: setupURI } = await state.httpClient.get('/api/v1/service/homekit/variable/HOMEKIT_SETUP_URI');
      try {
        ({ value: homekitMdnsAdvertiser } = await state.httpClient.get(
          '/api/v1/service/homekit/variable/HOMEKIT_MDNS_ADVERTISER'
        ));
      } catch (e) {
        // Variable not set yet
      }
      try {
        ({ value: homekitExposureMode } = await state.httpClient.get(
          '/api/v1/service/homekit/variable/HOMEKIT_EXPOSURE_MODE'
        ));
      } catch (e) {
        // Variable not set yet: the bridge exposes every compatible device
      }
      try {
        const { value } = await state.httpClient.get('/api/v1/service/homekit/variable/HOMEKIT_EXPOSED_DEVICES');
        homekitExposedDevices = JSON.parse(value);
      } catch (e) {
        // Variable not set yet, or unreadable
      }
      let homekitCompatibleDevices = [];
      try {
        homekitCompatibleDevices = await state.httpClient.get('/api/v1/service/homekit/device');
      } catch (e) {
        // The device list only feeds the selection screen. Failing to read it must not take down
        // the pairing QR code with it.
      }

      // The scene list only feeds the scene switches. Failing to read it must not take down the pairing
      // QR code with it.
      let homekitScenes = [];
      try {
        homekitScenes = await state.httpClient.get('/api/v1/scene');
      } catch (e) {
        // No scene list: the scene switches section shows its empty state
      }
      let homekitSceneSwitches = [];
      try {
        const { value } = await state.httpClient.get('/api/v1/service/homekit/variable/HOMEKIT_SCENE_SWITCHES');
        homekitSceneSwitches = readSceneSwitchRows(value);
      } catch (e) {
        // Variable not set yet, or unreadable
      }

      QRCode.toDataURL(setupURI, (err, dataUrl) => {
        store.setState({
          homekitSetupDataUrl: dataUrl,
          homekitMdnsAdvertiser,
          homekitExposureMode:
            homekitExposureMode === EXPOSURE_MODES.SELECTION ? homekitExposureMode : EXPOSURE_MODES.ALL,
          homekitExposedDevices: Array.isArray(homekitExposedDevices) ? homekitExposedDevices : [],
          homekitCompatibleDevices,
          homekitScenes: Array.isArray(homekitScenes) ? homekitScenes : [],
          homekitSceneSwitches,
          homekitGetSettingsStatus: RequestStatus.Success
        });
      });
    } catch (e) {
      store.setState({
        homekitGetSettingsStatus: RequestStatus.Error
      });
    }
  },
  updateExposureMode(state, e) {
    store.setState({
      homekitExposureMode: e.target.value
    });
  },
  updateExposedDevices(state, selectedOptions) {
    store.setState({
      homekitExposedDevices: (selectedOptions || []).map(option => option.value)
    });
  },
  async saveExposure(state, e) {
    e.preventDefault();
    store.setState({ homekitSaveExposureStatus: RequestStatus.Getting });
    try {
      // The list is written before the mode: if the second write fails, the bridge keeps exposing
      // everything, which is the safe outcome. The other order would leave it in selection mode
      // with a stale list, and silently drop devices the user never removed.
      await state.httpClient.post('/api/v1/service/homekit/variable/HOMEKIT_EXPOSED_DEVICES', {
        value: JSON.stringify(state.homekitExposedDevices)
      });
      await state.httpClient.post('/api/v1/service/homekit/variable/HOMEKIT_EXPOSURE_MODE', {
        value: state.homekitExposureMode
      });
      // Rebuild the bridge with the new device list, keeping the existing pairing
      await state.httpClient.get('/api/v1/service/homekit/reload');
      store.setState({ homekitSaveExposureStatus: RequestStatus.Success });
    } catch (e) {
      store.setState({ homekitSaveExposureStatus: RequestStatus.Error });
    }
  },
  addSceneSwitch(state) {
    store.setState({
      homekitSceneSwitches: [
        ...(state.homekitSceneSwitches || []),
        { id: newSceneSwitchId(), name: '', type: SCENE_SWITCH_TYPES.MOMENTARY, onSceneId: '', offSceneId: '' }
      ]
    });
  },
  removeSceneSwitch(state, id) {
    store.setState({
      homekitSceneSwitches: (state.homekitSceneSwitches || []).filter(row => row.id !== id)
    });
  },
  updateSceneSwitch(state, id, changes) {
    store.setState({
      homekitSceneSwitches: (state.homekitSceneSwitches || []).map(row =>
        row.id === id ? { ...row, ...changes } : row
      )
    });
  },
  async saveSceneSwitches(state, e) {
    e.preventDefault();
    const { configuration, problem } = buildSceneSwitchConfiguration(
      state.homekitSceneSwitches || [],
      state.homekitScenes || []
    );
    if (problem) {
      store.setState({ homekitSaveSceneSwitchesStatus: RequestStatus.Error, homekitSceneSwitchesProblem: problem });
      return;
    }

    store.setState({ homekitSaveSceneSwitchesStatus: RequestStatus.Getting, homekitSceneSwitchesProblem: null });
    try {
      await state.httpClient.post('/api/v1/service/homekit/variable/HOMEKIT_SCENE_SWITCHES', {
        value: JSON.stringify(configuration)
      });
      // Rebuild the bridge so the switches reach the Home app, keeping the existing pairing
      await state.httpClient.get('/api/v1/service/homekit/reload');
      store.setState({ homekitSaveSceneSwitchesStatus: RequestStatus.Success });
    } catch (err) {
      store.setState({ homekitSaveSceneSwitchesStatus: RequestStatus.Error, homekitSceneSwitchesProblem: null });
    }
  },
  updateMDNSAdvertiser(state, e) {
    store.setState({
      homekitMdnsAdvertiser: e.target.value
    });
  },
  async saveMDNSAdvertiser(state, e) {
    e.preventDefault();
    store.setState({ homekitSaveMDNSStatus: RequestStatus.Getting });
    try {
      await state.httpClient.post('/api/v1/service/homekit/variable/HOMEKIT_MDNS_ADVERTISER', {
        value: state.homekitMdnsAdvertiser
      });
      await state.httpClient.get('/api/v1/service/homekit/reload');
      store.setState({ homekitSaveMDNSStatus: RequestStatus.Success });
    } catch (e) {
      store.setState({ homekitSaveMDNSStatus: RequestStatus.Error });
    }
  },
  async refreshBridge(state, e) {
    e.preventDefault();
    store.setState({
      homekitReloadStatus: RequestStatus.Getting
    });
    try {
      await state.httpClient.get('/api/v1/service/homekit/reload');
      store.setState({
        homekitReloadStatus: RequestStatus.Success
      });
    } catch (e) {
      store.setState({
        homekitReloadStatus: RequestStatus.Error
      });
    }
  },
  async resetBridge(state, e) {
    e.preventDefault();
    store.setState({
      homekitResetStatus: RequestStatus.Getting
    });
    try {
      await state.httpClient.get('/api/v1/service/homekit/reset');

      const { value: setupURI } = await state.httpClient.get('/api/v1/service/homekit/variable/HOMEKIT_SETUP_URI');
      QRCode.toDataURL(setupURI, (err, dataUrl) => {
        store.setState({
          homekitSetupDataUrl: dataUrl,
          homekitResetStatus: RequestStatus.Success
        });
      });
    } catch (e) {
      store.setState({
        homekitResetStatus: RequestStatus.Error
      });
    }
  }
});

export { EXPOSURE_MODES, SCENE_SWITCH_TYPES };
export default actions;
