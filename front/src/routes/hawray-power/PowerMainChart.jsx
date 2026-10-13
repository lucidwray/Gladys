import { Text } from 'preact-i18n';
import cx from 'classnames';

import PowerLineChart from './PowerLineChart';
import { RANGES } from './helpers';
import style from './style.css';

// Section B: the mains as one large chart, with circuits overlaid on the same axis when ticked
const PowerMainChart = ({
  lines,
  circuits,
  overlay,
  range,
  language,
  loaded,
  hasMains,
  rangeLabel,
  windowStart,
  windowEnd,
  zoomed,
  zoomRange,
  onZoomChange,
  onSelectRange,
  onToggleOverlay
}) => (
  <div class="card mb-0 h-100">
    <div class="card-body">
      <div class="d-flex flex-wrap align-items-center justify-content-between mb-2">
        <h2 class="h5 mb-2">
          <Text id="hawrayPower.chart.title" />
        </h2>
        <select
          class="form-control custom-select w-auto mb-2"
          aria-label={rangeLabel}
          onChange={event => onSelectRange(event.target.value)}
        >
          {RANGES.map(item => (
            <option key={item.key} value={item.key} selected={item.key === range}>
              <Text id={`hawrayPower.chart.ranges.${item.key}`} />
            </option>
          ))}
        </select>
      </div>
      {!hasMains && (
        <p class="text-muted small">
          <Text id="hawrayPower.chart.noMains" />
        </p>
      )}
      {hasMains && loaded && (
        <div class={style.bigChart}>
          <PowerLineChart
            key={range}
            chartId="hawray-power-mains"
            height={300}
            lines={lines}
            language={language}
            zoomable
            showToolbar
            compact={false}
            showXAxisLabels
            windowStart={windowStart}
            windowEnd={windowEnd}
            zoomed={zoomed}
            zoomRange={zoomRange}
            onZoomChange={onZoomChange}
          />
        </div>
      )}
      {hasMains && !loaded && <div class={cx('mb-0', style.skeleton)} />}
      {circuits.length > 0 && (
        <div class="mt-2 d-flex flex-wrap">
          <span class="text-muted small mr-3 mb-1">
            <Text id="hawrayPower.chart.overlay" />
          </span>
          {circuits.map(circuit => (
            <div key={circuit.power_feature_selector} class="custom-control custom-checkbox custom-control-inline mb-1">
              <input
                type="checkbox"
                class="custom-control-input"
                id={`hawray-power-overlay-${circuit.power_feature_selector}`}
                checked={overlay.includes(circuit.power_feature_selector)}
                onChange={() => onToggleOverlay(circuit.power_feature_selector)}
              />
              <label class="custom-control-label" for={`hawray-power-overlay-${circuit.power_feature_selector}`}>
                {circuit.name}
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
);

export default PowerMainChart;
