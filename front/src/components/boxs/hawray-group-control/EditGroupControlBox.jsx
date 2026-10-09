import { Component } from 'preact';
import { connect } from 'unistore/preact';
import { Text, Localizer } from 'preact-i18n';
import BaseEditBox from '../baseEditBox';
import SelectDeviceFeature from '../../device/SelectDeviceFeature';
import { getDeviceFeatureName } from '../../../utils/device';
import withIntlAsProp from '../../../utils/withIntlAsProp';

// A group can only drive features it can write: a read-only sensor has nothing to set
const isWritableFeature = feature => feature.read_only === false;

class EditGroupControlBox extends Component {
  state = { labels: {} };

  componentDidMount() {
    this.loadLabels();
  }

  // The box stores selectors only: the names of the stored features are read back once here
  loadLabels = async () => {
    const selectors = this.props.box.device_features || [];
    if (selectors.length === 0) {
      return;
    }
    try {
      const devices = await this.props.httpClient.get('/api/v1/device', {
        device_feature_selectors: selectors.join(',')
      });
      const labels = {};
      devices.forEach(device => {
        device.features.forEach(feature => {
          labels[feature.selector] = getDeviceFeatureName(this.props.intl.dictionary, device, feature);
        });
      });
      this.setState(state => ({ labels: { ...state.labels, ...labels } }));
    } catch (e) {
      console.error(e);
    }
  };

  updateName = e => {
    this.props.updateBoxConfig(this.props.x, this.props.y, { name: e.target.value });
  };

  addFeature = (feature, device) => {
    // SelectDeviceFeature also reports a cleared selection with null
    if (!feature) {
      return;
    }
    const selectors = this.props.box.device_features || [];
    if (selectors.includes(feature.selector)) {
      return;
    }
    this.setState(state => ({
      labels: { ...state.labels, [feature.selector]: getDeviceFeatureName(this.props.intl.dictionary, device, feature) }
    }));
    this.props.updateBoxConfig(this.props.x, this.props.y, {
      device_features: [...selectors, feature.selector]
    });
  };

  removeFeature = index => {
    const selectors = this.props.box.device_features || [];
    this.props.updateBoxConfig(this.props.x, this.props.y, {
      device_features: selectors.filter((selector, selectorIndex) => selectorIndex !== index)
    });
  };

  render(props, { labels }) {
    const selectors = props.box.device_features || [];
    return (
      <BaseEditBox {...props} titleKey="dashboard.boxTitle.hawray-group-control">
        <div class="form-group">
          <label class="form-label">
            <Text id="hawrayGroupControl.editNameLabel" />
          </label>
          <Localizer>
            <input
              type="text"
              class="form-control"
              placeholder={<Text id="hawrayGroupControl.editNamePlaceholder" />}
              value={props.box.name}
              onInput={this.updateName}
            />
          </Localizer>
        </div>
        <div class="form-group">
          <label class="form-label">
            <Text id="hawrayGroupControl.editFeaturesLabel" />
          </label>
          <p class="text-muted small mb-2">
            <Text id="hawrayGroupControl.editHint" />
          </p>
          {selectors.length === 0 ? (
            <p class="text-muted">
              <Text id="hawrayGroupControl.noFeatures" />
            </p>
          ) : (
            <ul class="list-group mb-2">
              {selectors.map((selector, index) => (
                <li key={selector} class="list-group-item d-flex justify-content-between align-items-center">
                  <span>{labels[selector] || selector}</span>
                  <Localizer>
                    <button
                      type="button"
                      class="btn btn-sm btn-outline-danger"
                      onClick={() => this.removeFeature(index)}
                      aria-label={<Text id="hawrayGroupControl.removeFeature" />}
                    >
                      <i class="fe fe-trash" aria-hidden="true" />
                    </button>
                  </Localizer>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div class="form-group">
          <label class="form-label">
            <Text id="hawrayGroupControl.addFeatureLabel" />
          </label>
          {/* No value: the picker resets after each add. Features already in the group are hidden. */}
          <SelectDeviceFeature
            excludedDeviceFeatures={selectors}
            filterFeature={isWritableFeature}
            onDeviceFeatureChange={this.addFeature}
          />
        </div>
      </BaseEditBox>
    );
  }
}

export default withIntlAsProp(connect('httpClient', {})(EditGroupControlBox));
