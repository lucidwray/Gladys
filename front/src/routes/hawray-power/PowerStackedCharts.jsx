import { Text } from 'preact-i18n';
import cx from 'classnames';

import PowerLineChart from './PowerLineChart';
import style from './style.css';

// Section C: one compact chart per circuit (then Other), in the table's order. They share the time axis through
// the chart group, each keeps its own y-scale from 0, and the label shows the current W.
const PowerStackedCharts = ({ rows, series, range, language, loaded }) => (
  <div class="card mb-0">
    <div class="card-body">
      <h2 class="h5 mb-3">
        <Text id="hawrayPower.stack.title" />
      </h2>
      {!loaded && <div class={cx('mb-0', style.skeleton)} />}
      {loaded &&
        rows.map((row, index) => (
          <div key={`${range}-${row.selector}`} class={style.stackRow}>
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
              chartId={`hawray-power-stack-${index}`}
              height={index === rows.length - 1 ? 90 : 64}
              lines={[{ name: row.name, points: series[row.selector] || [] }]}
              language={language}
              zoomable
              showToolbar={false}
              compact
              showXAxisLabels={index === rows.length - 1}
            />
          </div>
        ))}
    </div>
  </div>
);

export default PowerStackedCharts;
