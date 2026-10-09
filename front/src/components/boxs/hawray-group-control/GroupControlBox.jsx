import { Component } from 'preact';
import { connect } from 'unistore/preact';
import { Text } from 'preact-i18n';
import debounce from 'debounce';
import withIntlAsProp from '../../../utils/withIntlAsProp';
import { RequestStatus } from '../../../utils/consts';
import { getDeviceFeatureName } from '../../../utils/device';
import { WEBSOCKET_MESSAGE_TYPES } from '../../../../../server/utils/constants';
import DeviceCard from '../device-in-room/DeviceCard';
import {
  GROUP_DEVICE_ID,
  buildGroupFeatures,
  planGroupWrites,
  normalizeMemberValue,
  applyWritesToMembers,
  applyStateUpdate,
  applyStringStateUpdate,
  flattenMemberFeatures,
  countDevices
} from './groupControl';

// Same pause as the devices widget: a slider sends its value once the user lets go of it, and a
// burst of changes is sent as one write per device.
const WRITE_DEBOUNCE_MS = 200;

const noop = () => {};

class GroupControlComponent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      members: [],
      status: RequestStatus.Getting,
      writeFailure: null,
      showDevices: false
    };
    this.wasDisconnected = false;
    this.debouncedSends = {};
  }

  handleWebsocketConnected = ({ connected }) => {
    // When the websocket is disconnected, we refresh the data when the websocket is reconnected
    if (!connected) {
      this.wasDisconnected = true;
    } else if (this.wasDisconnected) {
      this.getMembers();
      this.wasDisconnected = false;
    }
  };

  getMembers = async ({ silent = false } = {}) => {
    const selectors = this.props.box.device_features || [];
    if (selectors.length === 0) {
      this.setState({ members: [], status: RequestStatus.Success });
      return;
    }
    if (!silent) {
      this.setState({ status: RequestStatus.Getting });
    }
    try {
      const devices = await this.props.httpClient.get('/api/v1/device', {
        device_feature_selectors: selectors.join(',')
      });
      this.setState({
        members: flattenMemberFeatures(devices, selectors),
        status: RequestStatus.Success
      });
    } catch (e) {
      console.error(e);
      // A silent refresh keeps what is on screen: the members are still there, only the read-back failed
      if (!silent) {
        this.setState({ status: RequestStatus.Error });
      }
    }
  };

  updateStateWebsocket = payload => {
    this.setState(state => ({
      members: applyStateUpdate(
        state.members,
        payload.device_feature_selector,
        payload.last_value,
        payload.last_value_changed
      )
    }));
  };

  updateStringStateWebsocket = payload => {
    this.setState(state => ({
      members: applyStringStateUpdate(
        state.members,
        payload.device_feature,
        payload.last_value_string,
        payload.last_value_changed
      )
    }));
  };

  // Shows the values on the members right away, the devices confirm them later on
  applyLocally = writes => {
    const changedAt = new Date();
    this.setState(state => ({
      members: applyWritesToMembers(state.members, writes, changedAt),
      writeFailure: null
    }));
  };

  sendWrites = async writes => {
    const results = await Promise.allSettled(
      writes.map(async write =>
        this.props.httpClient.post(`/api/v1/device_feature/${write.selector}/value`, {
          value: write.value
        })
      )
    );
    const failures = results.filter(result => result.status === 'rejected');
    if (failures.length > 0) {
      failures.forEach(failure => console.error(failure.reason));
      this.setState({ writeFailure: { failed: failures.length, total: writes.length } });
      // Read the devices back, so a member that refused the value stops showing it
      await this.getMembers({ silent: true });
    }
  };

  getDebouncedSend = key => {
    if (!this.debouncedSends[key]) {
      this.debouncedSends[key] = debounce(this.sendWrites, WRITE_DEBOUNCE_MS);
    }
    return this.debouncedSends[key];
  };

  updateGroupValue = (groupFeature, value) => {
    const writes = planGroupWrites(this.state.members, groupFeature, value);
    this.applyLocally(writes);
    return this.sendWrites(writes);
  };

  updateGroupValueWithDebounce = (groupFeature, value) => {
    const writes = planGroupWrites(this.state.members, groupFeature, value);
    this.applyLocally(writes);
    this.getDebouncedSend(`group:${groupFeature.selector}`)(writes);
  };

  // The individual controls of the devices section write to one member only
  updateMemberValue = (feature, value) => {
    const writes = [{ selector: feature.selector, value: normalizeMemberValue(feature, value) }];
    this.applyLocally(writes);
    return this.sendWrites(writes);
  };

  updateMemberValueWithDebounce = (feature, value) => {
    const writes = [{ selector: feature.selector, value: normalizeMemberValue(feature, value) }];
    this.applyLocally(writes);
    this.getDebouncedSend(`member:${feature.selector}`)(writes);
  };

  toggleDevices = () => {
    this.setState(state => ({ showDevices: !state.showDevices }));
  };

  componentDidMount() {
    this.getMembers();
    this.props.session.dispatcher.addListener(WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE, this.updateStateWebsocket);
    this.props.session.dispatcher.addListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STRING_STATE,
      this.updateStringStateWebsocket
    );
    this.props.session.dispatcher.addListener('websocket.connected', this.handleWebsocketConnected);
  }

  componentDidUpdate(previousProps) {
    if (previousProps.box.device_features !== this.props.box.device_features) {
      this.getMembers();
    }
  }

  componentWillUnmount() {
    this.props.session.dispatcher.removeListener(WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE, this.updateStateWebsocket);
    this.props.session.dispatcher.removeListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STRING_STATE,
      this.updateStringStateWebsocket
    );
    this.props.session.dispatcher.removeListener('websocket.connected', this.handleWebsocketConnected);
    // A pending write is sent now rather than dropped with the widget
    Object.values(this.debouncedSends).forEach(send => send.flush());
  }

  render(props, { members, status, writeFailure, showDevices }) {
    const { dictionary } = props.intl;
    const selectors = props.box.device_features || [];
    if (selectors.length === 0) {
      return (
        <p class="text-muted mb-0">
          <Text id="hawrayGroupControl.noFeatures" />
        </p>
      );
    }
    if (status === RequestStatus.Error) {
      return (
        <p class="text-danger mb-0">
          <Text id="hawrayGroupControl.loadFailed" />
        </p>
      );
    }

    const loading = status === RequestStatus.Getting;
    const groupName = props.box.name || dictionary.hawrayGroupControl.defaultName;
    // The group is one device for the rows: one feature per type, labelled like any other feature
    const groupFeatures = buildGroupFeatures(members);
    const groupDevice = { id: GROUP_DEVICE_ID, selector: GROUP_DEVICE_ID, name: groupName, features: groupFeatures };
    const displayedFeatures = groupFeatures.map(feature => ({
      ...feature,
      device: groupDevice,
      new_label: getDeviceFeatureName(dictionary, groupDevice, feature)
    }));
    const deviceCount = countDevices(members);

    return (
      <div>
        <div class="text-muted small px-3 pt-2">
          {deviceCount === 1 ? (
            <Text id="hawrayGroupControl.deviceCountSingular" />
          ) : (
            <Text id="hawrayGroupControl.deviceCountPlural" fields={{ count: deviceCount }} />
          )}
        </div>
        <DeviceCard
          {...props}
          loading={loading}
          boxTitle={groupName}
          deviceFeatures={displayedFeatures}
          roomLightStatus={0}
          updateValue={this.updateGroupValue}
          updateValueWithDebounce={this.updateGroupValueWithDebounce}
          changeAllLightsStatusRoom={noop}
          intl={props.intl}
        />
        {writeFailure && (
          <p class="text-danger small px-3 mb-2" role="alert">
            <Text
              id="hawrayGroupControl.writeFailed"
              fields={{ failed: writeFailure.failed, total: writeFailure.total }}
            />
          </p>
        )}
        <div class="px-3 pb-2">
          <button
            type="button"
            class="btn btn-link btn-sm p-0"
            aria-expanded={showDevices}
            onClick={this.toggleDevices}
          >
            <Text id={showDevices ? 'hawrayGroupControl.hideDevices' : 'hawrayGroupControl.showDevices'} />
          </button>
        </div>
        {showDevices && (
          <DeviceCard
            {...props}
            loading={loading}
            deviceFeatures={members}
            roomLightStatus={0}
            updateValue={this.updateMemberValue}
            updateValueWithDebounce={this.updateMemberValueWithDebounce}
            changeAllLightsStatusRoom={noop}
            intl={props.intl}
          />
        )}
      </div>
    );
  }
}

export default withIntlAsProp(connect('session,httpClient,user', {})(GroupControlComponent));
