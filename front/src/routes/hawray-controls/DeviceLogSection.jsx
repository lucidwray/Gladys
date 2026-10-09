import { Component } from 'preact';
import { Text } from 'preact-i18n';
import { connect } from 'unistore/preact';
import cx from 'classnames';

import { WEBSOCKET_MESSAGE_TYPES } from '../../../../server/utils/constants';
import RelativeTime from '../../components/device/RelativeTime';
import { DEFAULT_RANGE_KEY, RANGES, formatAbsoluteDate, formatFeatureValue, getLogEntryKey, getRange } from './helpers';
import style from './style.css';

// The history endpoint answers for every device at once, so the log asks for the states of the device
// by its name, then keeps the ones of its selector. A page is filled up to LOG_PAGE_SIZE entries with at
// most MAX_REQUESTS_PER_PAGE sequential requests of REQUEST_SIZE states (500 is the server's MAX_TAKE).
const LOG_PAGE_SIZE = 100;
const REQUEST_SIZE = 500;
const MAX_REQUESTS_PER_PAGE = 2;
const HOUR_IN_MS = 60 * 60 * 1000;
// The log shows the latest VISIBLE_STEP entries, each "Show more" adds VISIBLE_STEP more: the entries already
// loaded first, then the next page of the server once they are all shown
const VISIBLE_STEP = 20;

// The states as the log keeps them: the feature, its value and the moment it was saved
const toEntry = state => ({
  key: getLogEntryKey(state.created_at, state.device_feature.id),
  createdAt: state.created_at,
  featureId: state.device_feature.id,
  feature: state.device_feature,
  value: state.value,
  valueString: null
});

// Section e: the state changes of the device over the range picked, newest first, updated live
class DeviceLogSection extends Component {
  constructor(props) {
    super(props);
    this.state = {
      rangeKey: DEFAULT_RANGE_KEY,
      entries: [],
      visibleCount: VISIBLE_STEP,
      cursor: null,
      exhausted: false,
      loading: true,
      loadingMore: false,
      error: false
    };
    // Each new load invalidates the previous one, so a slow answer never replaces a newer range
    this.requestId = 0;
  }

  loadPage = async ({ reset }) => {
    const { device } = this.props;
    const range = getRange(this.state.rangeKey);
    const requestId = this.requestId + 1;
    this.requestId = requestId;
    const since = new Date(Date.now() - range.hours * HOUR_IN_MS).toISOString();

    if (reset) {
      this.setState({
        loading: true,
        error: false,
        entries: [],
        visibleCount: VISIBLE_STEP,
        cursor: null,
        exhausted: false
      });
    } else {
      this.setState({ loadingMore: true, error: false });
    }

    try {
      let cursor = reset ? null : this.state.cursor;
      let exhausted = false;
      let collected = [];
      for (let request = 0; request < MAX_REQUESTS_PER_PAGE && collected.length < LOG_PAGE_SIZE; request += 1) {
        const params = { take: REQUEST_SIZE, since, search: device.name };
        if (cursor) {
          params.before = cursor.createdAt;
          params.before_id = cursor.featureId;
        }
        // eslint-disable-next-line no-await-in-loop
        const states = await this.props.httpClient.get('/api/v1/device_feature/states_history', params);
        if (requestId !== this.requestId) {
          return;
        }
        collected = collected.concat(states.filter(state => state.device.selector === device.selector).map(toEntry));
        if (states.length < REQUEST_SIZE) {
          exhausted = true;
          break;
        }
        const last = states[states.length - 1];
        cursor = { createdAt: last.created_at, featureId: last.device_feature.id };
      }

      if (collected.length > LOG_PAGE_SIZE) {
        // The page ends on its last kept entry: the next one resumes right after it
        collected = collected.slice(0, LOG_PAGE_SIZE);
        const lastKept = collected[collected.length - 1];
        cursor = { createdAt: lastKept.createdAt, featureId: lastKept.featureId };
        exhausted = false;
      }

      this.setState(prevState => {
        const known = new Set(reset ? [] : prevState.entries.map(entry => entry.key));
        const fresh = collected.filter(entry => !known.has(entry.key));
        return {
          entries: reset ? fresh : [...prevState.entries, ...fresh],
          cursor,
          exhausted,
          loading: false,
          loadingMore: false
        };
      });
    } catch (e) {
      console.error(e);
      if (requestId === this.requestId) {
        this.setState({ loading: false, loadingMore: false, error: true });
      }
    }
  };

  selectRange = rangeKey => {
    if (rangeKey === this.state.rangeKey) {
      return;
    }
    this.setState({ rangeKey }, () => this.loadPage({ reset: true }));
  };

  // Shows VISIBLE_STEP more entries; asks the server for its next page only when the loaded ones run out
  showMore = () => {
    const { entries, visibleCount, exhausted, loadingMore } = this.state;
    const nextCount = visibleCount + VISIBLE_STEP;
    this.setState({ visibleCount: nextCount });
    if (entries.length < nextCount && !exhausted && !loadingMore) {
      this.loadPage({ reset: false });
    }
  };

  // A state received live goes on top of the log, unless it is already there. The number of rows shown does not
  // grow with it: the oldest row shown moves under "Show more", so a page left open does not grow forever.
  addLiveEntry = (feature, lastValue, lastValueString, changedAt) => {
    const entry = {
      key: getLogEntryKey(changedAt, feature.id),
      createdAt: changedAt,
      featureId: feature.id,
      feature,
      value: lastValue,
      valueString: lastValueString
    };
    this.setState(prevState =>
      prevState.entries.some(known => known.key === entry.key) ? {} : { entries: [entry, ...prevState.entries] }
    );
  };

  updateDeviceStateWebsocket = payload => {
    const feature = this.props.features.find(item => item.selector === payload.device_feature_selector);
    if (feature) {
      this.addLiveEntry(feature, payload.last_value, null, payload.last_value_changed);
    }
  };

  updateDeviceTextWebsocket = payload => {
    const feature = this.props.features.find(item => item.selector === payload.device_feature);
    if (feature) {
      this.addLiveEntry(feature, null, payload.last_value_string, payload.last_value_changed);
    }
  };

  componentDidMount() {
    this.loadPage({ reset: true });
    this.props.session.dispatcher.addListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE,
      this.updateDeviceStateWebsocket
    );
    this.props.session.dispatcher.addListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STRING_STATE,
      this.updateDeviceTextWebsocket
    );
  }

  componentWillUnmount() {
    this.requestId += 1;
    this.props.session.dispatcher.removeListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STATE,
      this.updateDeviceStateWebsocket
    );
    this.props.session.dispatcher.removeListener(
      WEBSOCKET_MESSAGE_TYPES.DEVICE.NEW_STRING_STATE,
      this.updateDeviceTextWebsocket
    );
  }

  renderEntries(user, dictionary) {
    const { entries, visibleCount, loading, error, exhausted, loadingMore } = this.state;
    const language = user ? user.language : null;
    const options = { user, dictionary };

    if (loading && entries.length === 0) {
      return <div class={cx('card', 'mb-0', style.skeleton)} />;
    }
    if (error && entries.length === 0) {
      return (
        <div class="alert alert-danger d-flex align-items-center justify-content-between mb-0">
          <span>
            <Text id="hawrayControls.detail.log.error" />
          </span>
          <button type="button" class="btn btn-sm btn-outline-danger" onClick={() => this.loadPage({ reset: true })}>
            <Text id="hawrayControls.detail.retry" />
          </button>
        </div>
      );
    }
    if (entries.length === 0) {
      return (
        <div class="card">
          <div class="card-body text-muted">
            <Text id="hawrayControls.detail.log.empty" />
          </div>
        </div>
      );
    }
    return (
      <div class="card">
        <div class="table-responsive">
          <table class="table card-table table-vcenter">
            <thead>
              <tr>
                <th>
                  <Text id="hawrayControls.detail.log.time" />
                </th>
                <th>
                  <Text id="hawrayControls.detail.log.feature" />
                </th>
                <th>
                  <Text id="hawrayControls.detail.log.value" />
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.slice(0, visibleCount).map(entry => {
                const value = formatFeatureValue(
                  { ...entry.feature, last_value: entry.value, last_value_string: entry.valueString },
                  options
                );
                return (
                  <tr key={entry.key}>
                    <td class="text-nowrap">
                      <div>{formatAbsoluteDate(entry.createdAt, language)}</div>
                      <div class="small text-muted">
                        <RelativeTime datetime={entry.createdAt} language={language} futureDisabled />
                      </div>
                    </td>
                    <td>{entry.feature.name}</td>
                    <td>{value !== null ? value : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {(entries.length > visibleCount || !exhausted) && (
          <div class="card-footer text-center">
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              disabled={loadingMore}
              onClick={this.showMore}
            >
              <Text id={loadingMore ? 'hawrayControls.detail.log.loading' : 'hawrayControls.detail.log.showMore'} />
            </button>
          </div>
        )}
      </div>
    );
  }

  render({ user, intl }, { rangeKey }) {
    const range = getRange(rangeKey);
    return (
      <section class="mb-4">
        <div
          class={cx(
            'd-flex',
            'flex-wrap',
            'align-items-center',
            'justify-content-between',
            'mb-3',
            style.sectionHeader
          )}
        >
          <h2 class="h4 mb-2">
            <Text id="hawrayControls.detail.log.title" />
          </h2>
          <div class="btn-group mb-2" role="group">
            {RANGES.map(item => (
              <button
                key={item.key}
                type="button"
                class={cx('btn', 'btn-sm', item.key === range.key ? 'btn-primary' : 'btn-outline-secondary')}
                aria-pressed={item.key === range.key}
                onClick={() => this.selectRange(item.key)}
              >
                <Text id={`hawrayControls.detail.ranges.${item.key}`} />
              </button>
            ))}
          </div>
        </div>
        {this.renderEntries(user, intl.dictionary)}
      </section>
    );
  }
}

export default connect('httpClient,session')(DeviceLogSection);
