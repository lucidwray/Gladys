import { Component } from 'preact';
import { connect } from 'unistore/preact';

import withIntlAsProp from '../../utils/withIntlAsProp';
import { RequestStatus } from '../../utils/consts';
import { WEBSOCKET_MESSAGE_TYPES } from '../../../../server/utils/constants';
import ControlsListPage from './ControlsListPage';
import { applyDeviceFeatureString, applyDeviceFeatureValue } from './helpers';

class ControlsList extends Component {
  constructor(props) {
    super(props);
    this.state = {
      devices: null,
      rooms: [],
      search: '',
      selectedRoomId: null,
      status: RequestStatus.Getting
    };
    this.wasDisconnected = false;
  }

  // The whole list in one call, like the devices page: search and filters run on the client
  getDevices = async () => {
    this.setState({ status: RequestStatus.Getting });
    try {
      const devices = await this.props.httpClient.get('/api/v1/device');
      this.setState({ devices, status: RequestStatus.Success });
    } catch (e) {
      console.error(e);
      this.setState({ status: RequestStatus.Error });
    }
  };

  getRooms = async () => {
    try {
      const rooms = await this.props.httpClient.get('/api/v1/room');
      this.setState({ rooms });
    } catch (e) {
      console.error(e);
    }
  };

  handleWebsocketConnected = ({ connected }) => {
    // Values changed while the websocket was down are read again on reconnection
    if (!connected) {
      this.wasDisconnected = true;
    } else if (this.wasDisconnected) {
      this.getDevices();
      this.wasDisconnected = false;
    }
  };

  updateDeviceStateWebsocket = payload => {
    this.setState(prevState => ({
      devices: applyDeviceFeatureValue(
        prevState.devices || [],
        payload.device_feature_selector,
        payload.last_value,
        payload.last_value_changed
      )
    }));
  };

  updateDeviceTextWebsocket = payload => {
    this.setState(prevState => ({
      devices: applyDeviceFeatureString(
        prevState.devices || [],
        payload.device_feature,
        payload.last_value_string,
        payload.last_value_changed
      )
    }));
  };

  // Optimistic: the switch moves at once, the request follows. The state is updated with a functional
  // setState so that two switches changed in a row never overwrite each other's update.
  updateValue = async (deviceFeature, value) => {
    this.setState(prevState => ({
      devices: applyDeviceFeatureValue(prevState.devices || [], deviceFeature.selector, value, new Date())
    }));
    try {
      await this.props.httpClient.post(`/api/v1/device_feature/${deviceFeature.selector}/value`, { value });
    } catch (e) {
      console.error(e);
    }
  };

  search = e => {
    this.setState({ search: e.target.value });
  };

  selectRoom = e => {
    this.setState({ selectedRoomId: e.target.value || null });
  };

  componentDidMount() {
    this.getDevices();
    this.getRooms();
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

  componentWillUnmount() {
    this.props.session.dispatcher.removeListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE,
      this.updateDeviceStateWebsocket
    );
    this.props.session.dispatcher.removeListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STRING_STATE,
      this.updateDeviceTextWebsocket
    );
    this.props.session.dispatcher.removeListener('websocket.connected', this.handleWebsocketConnected);
  }

  render(props, state) {
    return (
      <ControlsListPage
        user={props.user}
        intl={props.intl}
        devices={state.devices}
        rooms={state.rooms}
        status={state.status}
        search={state.search}
        selectedRoomId={state.selectedRoomId}
        onSearch={this.search}
        onSelectRoom={this.selectRoom}
        onRetry={this.getDevices}
        onToggle={this.updateValue}
      />
    );
  }
}

export default withIntlAsProp(connect('httpClient,session,user', {})(ControlsList));
