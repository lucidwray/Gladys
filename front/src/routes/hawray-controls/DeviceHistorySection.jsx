import { Component } from 'preact';
import { Text } from 'preact-i18n';
import cx from 'classnames';

import Chart from '../../components/boxs/chart/Chart';
import { RANGES, DEFAULT_RANGE_KEY, getRange } from './helpers';
import style from './style.css';

// Section d: one chart per numeric feature, over the range picked above them. The charts are the
// dashboard chart widget itself, fed with the box it expects; only the range is chosen here.
class DeviceHistorySection extends Component {
  constructor(props) {
    super(props);
    this.state = { rangeKey: DEFAULT_RANGE_KEY };
    // The chart reloads its data when the list of its features changes: each one keeps the same array
    this.selectorLists = new Map();
  }

  getSelectorList = selector => {
    if (!this.selectorLists.has(selector)) {
      this.selectorLists.set(selector, [selector]);
    }
    return this.selectorLists.get(selector);
  };

  selectRange = rangeKey => {
    this.setState({ rangeKey });
  };

  render({ features }, { rangeKey }) {
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
            <Text id="hawrayControls.detail.history.title" />
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
        {features.length === 0 ? (
          <div class="card">
            <div class="card-body text-muted">
              <Text id="hawrayControls.detail.history.empty" />
            </div>
          </div>
        ) : (
          features.map(feature => (
            <div key={feature.selector} class="mb-3">
              <Chart
                box={{
                  title: feature.name,
                  device_features: this.getSelectorList(feature.selector),
                  interval: range.interval,
                  chart_type: 'line',
                  display_axes: true,
                  display_variation: true
                }}
              />
            </div>
          ))
        )}
      </section>
    );
  }
}

export default DeviceHistorySection;
