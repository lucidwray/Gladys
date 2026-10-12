import { Text } from 'preact-i18n';
import get from 'get-value';
import { RequestStatus } from '../../../../utils/consts';
import { SCENE_SWITCH_TYPES } from './actions';
import withIntlAsProp from '../../../../utils/withIntlAsProp';

const SceneSwitchRow = ({ row, scenes, updateSceneSwitch, removeSceneSwitch, intl }) => {
  const toggle = row.type === SCENE_SWITCH_TYPES.TOGGLE;
  const onScene = scenes.find(scene => scene.id === row.onSceneId);
  // With no name typed, the switch takes the name of its on scene: showing it as the placeholder makes
  // that visible before saving.
  const namePlaceholder =
    (onScene && onScene.name) || get(intl.dictionary, 'hawrayHomekitSceneSwitches.namePlaceholder');

  const sceneOptions = (
    <>
      <option value="">
        <Text id="hawrayHomekitSceneSwitches.chooseScene" />
      </option>
      {scenes.map(scene => (
        <option value={scene.id}>{scene.name}</option>
      ))}
    </>
  );

  return (
    <div class="form-row align-items-end border rounded p-2 mb-2">
      <div class="form-group col-md-3">
        <label>
          <Text id="hawrayHomekitSceneSwitches.nameLabel" />
        </label>
        <input
          type="text"
          class="form-control"
          value={row.name}
          placeholder={namePlaceholder}
          onInput={e => updateSceneSwitch(row.id, { name: e.target.value })}
        />
      </div>
      <div class="form-group col-md-2">
        <label>
          <Text id="hawrayHomekitSceneSwitches.styleLabel" />
        </label>
        <select
          class="form-control"
          value={row.type}
          onChange={e => updateSceneSwitch(row.id, { type: e.target.value })}
        >
          <option value={SCENE_SWITCH_TYPES.MOMENTARY}>
            <Text id="hawrayHomekitSceneSwitches.styleMomentary" />
          </option>
          <option value={SCENE_SWITCH_TYPES.TOGGLE}>
            <Text id="hawrayHomekitSceneSwitches.styleToggle" />
          </option>
        </select>
      </div>
      <div class="form-group col-md-3">
        <label>
          <Text id={toggle ? 'hawrayHomekitSceneSwitches.onSceneLabel' : 'hawrayHomekitSceneSwitches.sceneLabel'} />
        </label>
        <select
          class="form-control"
          value={row.onSceneId}
          onChange={e => updateSceneSwitch(row.id, { onSceneId: e.target.value })}
        >
          {sceneOptions}
        </select>
      </div>
      {toggle && (
        <div class="form-group col-md-3">
          <label>
            <Text id="hawrayHomekitSceneSwitches.offSceneLabel" />
          </label>
          <select
            class="form-control"
            value={row.offSceneId}
            onChange={e => updateSceneSwitch(row.id, { offSceneId: e.target.value })}
          >
            {sceneOptions}
          </select>
        </div>
      )}
      <div class="form-group col-md-1">
        <button class="btn btn-outline-danger" onClick={() => removeSceneSwitch(row.id)}>
          <Text id="hawrayHomekitSceneSwitches.removeButton" />
        </button>
      </div>
    </div>
  );
};

const SceneSwitches = ({
  homekitScenes,
  homekitSceneSwitches,
  homekitSaveSceneSwitchesStatus,
  homekitSceneSwitchesProblem,
  addSceneSwitch,
  removeSceneSwitch,
  updateSceneSwitch,
  saveSceneSwitches,
  intl
}) => {
  const scenes = homekitScenes || [];
  const rows = homekitSceneSwitches || [];

  return (
    <div class="mt-4">
      <h5>
        <Text id="hawrayHomekitSceneSwitches.title" />
      </h5>
      <p>
        <Text id="hawrayHomekitSceneSwitches.description" />
      </p>
      <p class="text-muted">
        <Text id="hawrayHomekitSceneSwitches.renameNote" />
      </p>
      <div class="alert alert-warning">
        <Text id="hawrayHomekitSceneSwitches.warning" />
      </div>
      {scenes.length === 0 && (
        <div class="alert alert-info">
          <Text id="hawrayHomekitSceneSwitches.emptyState" />
        </div>
      )}
      {rows.map(row => (
        <SceneSwitchRow
          key={row.id}
          row={row}
          scenes={scenes}
          updateSceneSwitch={updateSceneSwitch}
          removeSceneSwitch={removeSceneSwitch}
          intl={intl}
        />
      ))}
      {scenes.length > 0 && (
        <button class="btn btn-outline-primary mb-2" onClick={addSceneSwitch}>
          <Text id="hawrayHomekitSceneSwitches.addButton" />
        </button>
      )}
      <div>
        <button class="btn btn-success" onClick={saveSceneSwitches}>
          <Text id="hawrayHomekitSceneSwitches.saveButton" />
        </button>
      </div>
      {homekitSaveSceneSwitchesStatus === RequestStatus.Success && (
        <div class="alert alert-success mt-2">
          <Text id="hawrayHomekitSceneSwitches.saveSuccess" />
        </div>
      )}
      {homekitSaveSceneSwitchesStatus === RequestStatus.Error && (
        <div class="alert alert-danger mt-2">
          <Text id={homekitSceneSwitchesProblem || 'hawrayHomekitSceneSwitches.saveError'} />
        </div>
      )}
    </div>
  );
};

export default withIntlAsProp(SceneSwitches);
