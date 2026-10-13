import { Component } from 'preact';
import { connect } from 'unistore/preact';

import withIntlAsProp from '../../utils/withIntlAsProp';
import { RequestStatus } from '../../utils/consts';
import { WEBSOCKET_MESSAGE_TYPES } from '../../../../server/utils/constants';
import PowerPage from './PowerPage';
import {
  appendSeriesPoint,
  applyLiveValue,
  chartSelectors,
  DEFAULT_RANGE,
  DEFAULT_TAB,
  isDisplayedSelector,
  RANGE_STORAGE_KEY,
  RANGES,
  readStoredChoice,
  rangeWindow,
  storeChoice,
  SUMMARY_REFRESH_MS,
  TAB_STORAGE_KEY,
  TABS
} from './helpers';

const POWER_DEVICE_FEATURE_TYPE = 'power';

// The Power page: the data of the server (spec §7), the live updates of the websocket (spec §8)
class Power extends Component {
  constructor(props) {
    super(props);
    this.state = {
      summary: null,
      series: null,
      devices: [],
      tab: readStoredChoice(TAB_STORAGE_KEY, TABS, DEFAULT_TAB),
      range: readStoredChoice(
        RANGE_STORAGE_KEY,
        RANGES.map(item => item.key),
        DEFAULT_RANGE
      ),
      overlay: [],
      status: RequestStatus.Getting,
      seriesStatus: RequestStatus.Getting,
      settingsStatus: null,
      savingSettings: false
    };
    this.summaryFetchedAt = 0;
    this.wasDisconnected = false;
  }

  // Each scale is a request of its own: the table shows the kWh of the current period so far
  getSummary = async (tab = this.state.tab) => {
    if (!this.state.summary) {
      this.setState({ status: RequestStatus.Getting });
    }
    try {
      const summary = await this.props.httpClient.get('/api/v1/hawray/power/summary', { scale: tab });
      this.summaryFetchedAt = Date.now();
      // A tab clicked meanwhile wins over this answer
      if (this.state.tab === tab) {
        this.setState({ summary, status: RequestStatus.Success });
      }
      return summary;
    } catch (e) {
      console.error(e);
      this.setState({ status: RequestStatus.Error });
      return null;
    }
  };

  // The series of every charted feature in one call, on the grid of the bucket the server picks
  getSeries = async (summary = this.state.summary, range = this.state.range) => {
    const features = chartSelectors(summary);
    if (features.length === 0) {
      return;
    }
    this.setState({ seriesStatus: RequestStatus.Getting });
    try {
      const response = await this.props.httpClient.get('/api/v1/hawray/power/series', {
        features: features.join(','),
        ...rangeWindow(range)
      });
      // A range picked meanwhile wins over this answer
      if (this.state.range === range) {
        this.setState({ series: response.series, seriesStatus: RequestStatus.Success });
      }
    } catch (e) {
      console.error(e);
      this.setState({ seriesStatus: RequestStatus.Error });
    }
  };

  getDevices = async () => {
    try {
      const devices = await this.props.httpClient.get('/api/v1/device');
      this.setState({
        devices: devices
          .filter(device => device.features.some(feature => feature.type === POWER_DEVICE_FEATURE_TYPE))
          .map(device => ({ selector: device.selector, name: device.name }))
      });
    } catch (e) {
      console.error(e);
    }
  };

  // Summary, then series (the series are the charted roles of the summary)
  load = async () => {
    const summary = await this.getSummary();
    await this.getSeries(summary);
  };

  retry = () => {
    this.load();
  };

  handleWebsocketConnected = ({ connected }) => {
    // Values changed while the websocket was down are read again on reconnection
    if (!connected) {
      this.wasDisconnected = true;
    } else if (this.wasDisconnected) {
      this.load();
      this.wasDisconnected = false;
    }
  };

  // Appended in place: a live sample updates the Live column and the right edge of the charts. Nothing is
  // refetched per state (spec §8). The kWh tabs are refetched at most once a minute.
  handleNewState = payload => {
    if (!isDisplayedSelector(this.state.summary, payload.device_feature_selector)) {
      return;
    }
    this.setState(prevState => ({
      summary: applyLiveValue(prevState.summary, payload),
      series: appendSeriesPoint(prevState.series, payload)
    }));
    if (this.state.tab !== 'live' && Date.now() - this.summaryFetchedAt >= SUMMARY_REFRESH_MS) {
      this.getSummary();
    }
  };

  selectTab = tab => {
    storeChoice(TAB_STORAGE_KEY, tab);
    this.setState({ tab });
    this.getSummary(tab);
  };

  // The series are cleared so that the charts of the new range are drawn anew
  selectRange = range => {
    storeChoice(RANGE_STORAGE_KEY, range);
    this.setState({ range, series: null });
    this.getSeries(this.state.summary, range);
  };

  toggleOverlay = selector => {
    this.setState(prevState => ({
      overlay: prevState.overlay.includes(selector)
        ? prevState.overlay.filter(item => item !== selector)
        : [...prevState.overlay, selector]
    }));
  };

  saveMains = async deviceSelector => {
    this.setState({ savingSettings: true, settingsStatus: null });
    try {
      await this.props.httpClient.post('/api/v1/hawray/power/settings', {
        mains_device_selector: deviceSelector
      });
      this.setState({ savingSettings: false, settingsStatus: 'saved' });
      await this.load();
    } catch (e) {
      console.error(e);
      this.setState({ savingSettings: false, settingsStatus: 'error' });
    }
  };

  componentDidMount() {
    this.getDevices();
    this.load();
    this.props.session.dispatcher.addListener(WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE, this.handleNewState);
    this.props.session.dispatcher.addListener('websocket.connected', this.handleWebsocketConnected);
  }

  componentWillUnmount() {
    this.props.session.dispatcher.removeListener(WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE, this.handleNewState);
    this.props.session.dispatcher.removeListener('websocket.connected', this.handleWebsocketConnected);
  }

  render(props, state) {
    return (
      <PowerPage
        user={props.user}
        intl={props.intl}
        summary={state.summary}
        series={state.series}
        tab={state.tab}
        range={state.range}
        overlay={state.overlay}
        status={state.status}
        seriesStatus={state.seriesStatus}
        devices={state.devices}
        settingsStatus={state.settingsStatus}
        savingSettings={state.savingSettings}
        onSelectTab={this.selectTab}
        onSelectRange={this.selectRange}
        onToggleOverlay={this.toggleOverlay}
        onSaveMains={this.saveMains}
        onRetry={this.retry}
      />
    );
  }
}

export default withIntlAsProp(connect('httpClient,session,user', {})(Power));
