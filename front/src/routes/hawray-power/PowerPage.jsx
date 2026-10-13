import { Text } from 'preact-i18n';
import cx from 'classnames';

import dashboardStyle from '../dashboard/style.css';
import PowerTable from './PowerTable';
import PowerMainChart from './PowerMainChart';
import PowerStackedCharts from './PowerStackedCharts';
import PowerSettings from './PowerSettings';
import { buildTable, mainsOf, rolesOf, ROLE_CIRCUIT, seriesOf } from './helpers';
import style from './style.css';

// Layout only: the data and the requests live in ./index.js
const PowerPage = ({
  user,
  intl,
  summary,
  series,
  tab,
  range,
  overlay,
  status,
  seriesStatus,
  devices,
  settingsStatus,
  savingSettings,
  onSelectTab,
  onSelectRange,
  onToggleOverlay,
  onSaveMains,
  onRetry
}) => {
  const mains = mainsOf(summary);
  const table = buildTable(summary, tab);
  const circuits = rolesOf(summary, ROLE_CIRCUIT);
  const loaded = Boolean(series);
  const hasError = status === 'error' || seriesStatus === 'error';

  // Section B: the mains line, then the ticked circuits on the same axis
  const lines = [];
  if (mains && loaded) {
    lines.push({
      name: intl.dictionary.hawrayPower.chart.mains,
      points: seriesOf(series, mains.power_feature_selector)
    });
  }
  circuits
    .filter(circuit => overlay.includes(circuit.power_feature_selector))
    .forEach(circuit => {
      lines.push({ name: circuit.name, points: seriesOf(series, circuit.power_feature_selector) });
    });

  // Section C: circuits in the table's order, then Other
  const stackRows = [...table.circuits];
  if (table.other) {
    stackRows.push({ ...table.other, name: intl.dictionary.hawrayPower.table.other });
  }

  return (
    <div class="page">
      <div
        class={cx(
          'page-main',
          'glass-theme',
          style.powerPage,
          dashboardStyle.dashboardBackground,
          dashboardStyle.glassScene
        )}
      >
        <div class="py-3 py-md-5">
          <div class="container">
            <div class="page-header">
              <h1 class="page-title">
                <Text id="hawrayPower.title" />
              </h1>
              <div class="page-subtitle">
                <Text id="hawrayPower.subtitle" />
              </div>
            </div>
            {hasError && (
              <div class="alert alert-danger d-flex align-items-center justify-content-between">
                <span>
                  <Text id="hawrayPower.error" />
                </span>
                <button type="button" class="btn btn-sm btn-outline-danger" onClick={onRetry}>
                  <Text id="hawrayPower.retry" />
                </button>
              </div>
            )}
            {!summary && !hasError && (
              <div class="text-muted mb-3">
                <Text id="hawrayPower.loading" />
              </div>
            )}
            {summary && (
              <div class="row">
                <div class="col-12 col-lg-5 mb-3">
                  <PowerTable summary={summary} tab={tab} user={user} onSelectTab={onSelectTab} />
                </div>
                <div class="col-12 col-lg-7 mb-3">
                  <PowerMainChart
                    lines={lines}
                    circuits={circuits}
                    overlay={overlay}
                    range={range}
                    language={user.language}
                    loaded={loaded}
                    hasMains={Boolean(mains)}
                    rangeLabel={intl.dictionary.hawrayPower.chart.rangeLabel}
                    onSelectRange={onSelectRange}
                    onToggleOverlay={onToggleOverlay}
                  />
                </div>
                <div class="col-12 mb-3">
                  <PowerStackedCharts
                    rows={stackRows}
                    series={series || {}}
                    range={range}
                    language={user.language}
                    loaded={loaded && stackRows.length > 0}
                  />
                </div>
              </div>
            )}
            {summary && (
              <div class="row">
                <div class="col-12 mb-3">
                  <PowerSettings
                    devices={devices}
                    mainsOverride={summary.mains_override}
                    status={settingsStatus}
                    saving={savingSettings}
                    onSave={onSaveMains}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PowerPage;
