import { Component } from 'preact';
import { connect } from 'unistore/preact';
import { Text } from 'preact-i18n';
import { Link } from 'preact-router/match';
import cx from 'classnames';
import debounce from 'debounce';
import get from 'get-value';

import withIntlAsProp from '../../utils/withIntlAsProp';
import { RequestStatus } from '../../utils/consts';
import { WEBSOCKET_MESSAGE_TYPES, DEVICE_FEATURE_CATEGORIES } from '../../../../server/utils/constants';
import DeviceCard from '../../components/boxs/device-in-room/DeviceCard';
import dashboardStyle from '../dashboard/style.css';
import { getDeviceIntegration } from '../devices/integrationLinks';
import DeviceInfoSection from './DeviceInfoSection';
import DeviceFeaturesTable from './DeviceFeaturesTable';
import DeviceHistorySection from './DeviceHistorySection';
import DeviceLogSection from './DeviceLogSection';
import DeviceDetailsSection from './DeviceDetailsSection';
import style from './style.css';
import {
  applyFeatureString,
  applyFeatureValue,
  getLightStatus,
  isChartableFeature,
  isWritableBinaryFeature
} from './helpers';

// Same delay as the dashboard device widgets: a slider sends one value once it stops moving
const VALUE_DEBOUNCE_MS = 200;

class ControlsDetail extends Component {
  constructor(props) {
    super(props);
    this.state = {
      device: null,
      status: RequestStatus.Getting,
      notFound: false
    };
    this.wasDisconnected = false;
    this.deviceRequestId = 0;
    this.debouncedSendValues = new Map();
  }

  getDevice = async () => {
    // Only the answer of the latest request is applied: an older one (a device left before its answer came)
    // must never replace the device on screen
    this.deviceRequestId += 1;
    const requestId = this.deviceRequestId;
    const { deviceSelector } = this.props;
    this.setState({ status: RequestStatus.Getting, notFound: false });
    try {
      const device = await this.props.httpClient.get(`/api/v1/device/${encodeURIComponent(deviceSelector)}`);
      if (requestId === this.deviceRequestId) {
        this.setState({ device, status: RequestStatus.Success });
      }
    } catch (e) {
      console.error(e);
      if (requestId === this.deviceRequestId) {
        const notFound = Boolean(e.response && e.response.status === 404);
        this.setState({ device: null, status: RequestStatus.Error, notFound });
      }
    }
  };

  handleWebsocketConnected = ({ connected }) => {
    // Values changed while the websocket was down are read again on reconnection
    if (!connected) {
      this.wasDisconnected = true;
    } else if (this.wasDisconnected) {
      this.getDevice();
      this.wasDisconnected = false;
    }
  };

  // Applies an update to the features of the device; nothing to render when the device is not loaded
  patchDeviceFeatures = update => {
    this.setState(prevState =>
      prevState.device ? { device: { ...prevState.device, features: update(prevState.device.features) } } : {}
    );
  };

  hasFeature = selector => Boolean(this.state.device && this.state.device.features.some(f => f.selector === selector));

  updateDeviceStateWebsocket = payload => {
    if (!this.hasFeature(payload.device_feature_selector)) {
      return;
    }
    this.patchDeviceFeatures(features =>
      applyFeatureValue(features, payload.device_feature_selector, payload.last_value, payload.last_value_changed)
    );
  };

  updateDeviceTextWebsocket = payload => {
    if (!this.hasFeature(payload.device_feature)) {
      return;
    }
    this.patchDeviceFeatures(features =>
      applyFeatureString(features, payload.device_feature, payload.last_value_string, payload.last_value_changed)
    );
  };

  sendValue = async (deviceFeature, value) => {
    try {
      await this.props.httpClient.post(`/api/v1/device_feature/${deviceFeature.selector}/value`, { value });
    } catch (e) {
      console.error(e);
    }
  };

  // Optimistic: the control moves at once, the value is then sent to the device
  updateValue = async (deviceFeature, value) => {
    this.patchDeviceFeatures(features => applyFeatureValue(features, deviceFeature.selector, value, new Date()));
    await this.sendValue(deviceFeature, value);
  };

  // One debounced sender per feature: two sliders of the same device must not drop each other's value
  getDebouncedSend = selector => {
    if (!this.debouncedSendValues.has(selector)) {
      this.debouncedSendValues.set(selector, debounce(this.sendValue, VALUE_DEBOUNCE_MS));
    }
    return this.debouncedSendValues.get(selector);
  };

  updateValueWithDebounce = (deviceFeature, value) => {
    this.patchDeviceFeatures(features => applyFeatureValue(features, deviceFeature.selector, value, new Date()));
    this.getDebouncedSend(deviceFeature.selector)(deviceFeature, value);
  };

  // The all-lights switch of the card: every writable light of the device goes to the state the
  // first click asks for
  changeAllLightsStatusRoom = async () => {
    const features = this.getAttachedFeatures();
    const newValue = getLightStatus(features) === 0 ? 1 : 0;
    const lights = features.filter(
      feature => feature.category === DEVICE_FEATURE_CATEGORIES.LIGHT && isWritableBinaryFeature(feature)
    );
    await Promise.all(lights.map(light => this.updateValue(light, newValue)));
  };

  getAttachedFeatures = () => {
    const { device } = this.state;
    return device ? device.features.map(feature => ({ ...feature, device })) : [];
  };

  componentDidMount() {
    this.getDevice();
    this.props.session.dispatcher.addListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE,
      this.updateDeviceStateWebsocket
    );
    this.props.session.dispatcher.addListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STRING_STATE,
      this.updateDeviceTextWebsocket
    );
    this.props.session.dispatcher.addListener('websocket.connected', this.handleWebsocketConnected);
  }

  // Another device opened from the same page (the route keeps this component): its sections start over
  reloadDevice = () => {
    this.setState({ device: null, notFound: false });
    this.getDevice();
  };

  componentDidUpdate(previousProps) {
    if (previousProps.deviceSelector !== this.props.deviceSelector) {
      this.reloadDevice();
    }
  }

  componentWillUnmount() {
    // An answer still on its way is ignored: the page is gone
    this.deviceRequestId += 1;
    this.props.session.dispatcher.removeListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE,
      this.updateDeviceStateWebsocket
    );
    this.props.session.dispatcher.removeListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STRING_STATE,
      this.updateDeviceTextWebsocket
    );
    this.props.session.dispatcher.removeListener('websocket.connected', this.handleWebsocketConnected);
    // A value still waiting for its debounce is sent now, not dropped with the page
    this.debouncedSendValues.forEach(send => send.flush());
  }

  render(props, { device, status, notFound }) {
    const integration = device ? getDeviceIntegration(device) : null;
    const attachedFeatures = this.getAttachedFeatures();
    const chartableFeatures = device ? device.features.filter(isChartableFeature) : [];
    const selectors = device ? device.features.map(feature => feature.selector) : [];
    const isFailed = status === RequestStatus.Error;

    return (
      <div class="page">
        {/* Same glass scene as the devices page and the controls list */}
        <div
          class={cx(
            'page-main',
            'glass-theme',
            style.controlsPage,
            dashboardStyle.dashboardBackground,
            dashboardStyle.glassScene
          )}
        >
          <div class="py-3 py-md-5">
            <div class="container">
              <Link href="/dashboard/controls" class={cx('btn btn-link px-0 mb-3', style.backLink)}>
                <i class="fe fe-arrow-left mr-1" />
                <Text id="hawrayControls.detail.back" />
              </Link>

              {notFound && (
                <div class="alert alert-warning">
                  <Text id="hawrayControls.detail.notFound" />
                </div>
              )}
              {isFailed && !notFound && (
                <div class="alert alert-danger d-flex align-items-center justify-content-between">
                  <span>
                    <Text id="hawrayControls.detail.error" />
                  </span>
                  <button type="button" class="btn btn-sm btn-outline-danger" onClick={this.getDevice}>
                    <Text id="hawrayControls.detail.retry" />
                  </button>
                </div>
              )}

              <DeviceInfoSection
                device={device}
                integration={integration}
                loading={status === RequestStatus.Getting}
                user={props.user}
                intl={props.intl}
              />

              {/* DeviceCard always renders the theme spinner (.loader); the dashboard hides it with an inactive
                  .dimmer around the widgets (DashboardPage). Same wrapper here: the device is loaded, no spinner. */}
              {device && (
                <div class="mb-4 dimmer">
                  <DeviceCard
                    boxTitle={get(props.intl.dictionary, 'hawrayControls.detail.controls')}
                    box={{ device_features: selectors }}
                    deviceFeatures={attachedFeatures}
                    roomLightStatus={getLightStatus(attachedFeatures)}
                    loading={false}
                    x={0}
                    y={0}
                    user={props.user}
                    intl={props.intl}
                    updateValue={this.updateValue}
                    updateValueWithDebounce={this.updateValueWithDebounce}
                    changeAllLightsStatusRoom={this.changeAllLightsStatusRoom}
                  />
                </div>
              )}

              {device && <DeviceFeaturesTable features={device.features} user={props.user} intl={props.intl} />}

              {device && (
                <DeviceHistorySection
                  key={`history-${device.selector}`}
                  features={chartableFeatures}
                  user={props.user}
                  intl={props.intl}
                />
              )}

              {device && (
                <DeviceLogSection
                  key={`log-${device.selector}`}
                  device={device}
                  features={device.features}
                  user={props.user}
                  intl={props.intl}
                />
              )}

              {device && <DeviceDetailsSection device={device} user={props.user} intl={props.intl} />}
            </div>
          </div>
        </div>
      </div>
    );
  }
}

export default withIntlAsProp(connect('httpClient,session,user', {})(ControlsDetail));
