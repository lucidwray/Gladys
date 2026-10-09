import { Component } from 'preact';
import { Text } from 'preact-i18n';

import Chart from '../../components/boxs/chart/Chart';

// Each chart opens on its last day. The range is then chosen by the chart's own control, the same one as on
// the dashboard: the page has no second range to disagree with it.
const DEFAULT_INTERVAL = 'last-day';

// Section d: one chart per numeric feature. The charts are the dashboard chart widget itself, fed with the
// box it expects.
class DeviceHistorySection extends Component {
  constructor(props) {
    super(props);
    // The chart reloads its data when the list of its features changes: each feature keeps the same array
    this.selectorLists = new Map();
  }

  getSelectorList = selector => {
    if (!this.selectorLists.has(selector)) {
      this.selectorLists.set(selector, [selector]);
    }
    return this.selectorLists.get(selector);
  };

  render({ features }) {
    return (
      <section class="mb-4">
        <h2 class="h4 mb-3">
          <Text id="hawrayControls.detail.history.title" />
        </h2>
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
                  interval: DEFAULT_INTERVAL,
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
