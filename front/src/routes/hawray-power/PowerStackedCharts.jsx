import { Text } from 'preact-i18n';
import cx from 'classnames';

import PowerLineChart from './PowerLineChart';
import PowerTimeAxis from './PowerTimeAxis';
import { chartIdFor } from './powerChartOptions';
import style from './style.css';

// Section C: one compact chart per circuit (then Other), in the order fixed at the last summary fetch. They share the
// time axis through the chart group, each keeps its own y-scale from 0, and the label shows the current W.
const PowerStackedCharts = ({
  rows,
  series,
  language,
  loaded,
  windowStart,
  windowEnd,
  zoomed,
  zoomRange,
  onZoomChange
}) => {
  // The x range the rows show: the user's zoom, or the pinned window
  const axis = zoomed && zoomRange ? zoomRange : { min: windowStart, max: windowEnd };
  return (
    <div class="card mb-0">
      <div class="card-body">
        <h2 class="h5 mb-3">
          <Text id="hawrayPower.stack.title" />
        </h2>
        {!loaded && <div class={cx('mb-0', style.skeleton)} />}
        {loaded &&
          rows.map(row => (
            <div key={row.selector} class={style.stackRow}>
              <div class="d-flex justify-content-between small">
                <span class="text-truncate mr-2">{row.name}</span>
                <span class="font-weight-bold text-nowrap">
                  {row.watts === null ? (
                    '—'
                  ) : (
                    <Text id="hawrayPower.stack.current" fields={{ value: Math.round(row.watts) }} />
                  )}
                </span>
              </div>
              <PowerLineChart
                chartId={chartIdFor('hawray-power-stack', row.selector)}
                height={64}
                lines={[{ name: row.name, points: series[row.selector] || [] }]}
                language={language}
                zoomable
                showToolbar={false}
                compact
                grouped
                windowStart={windowStart}
                windowEnd={windowEnd}
                zoomed={zoomed}
                zoomRange={zoomRange}
                onZoomChange={onZoomChange}
              />
            </div>
          ))}
        {loaded && rows.length > 0 && <PowerTimeAxis start={axis.min} end={axis.max} language={language} />}
      </div>
    </div>
  );
};

export default PowerStackedCharts;
