import { Text } from 'preact-i18n';
import cx from 'classnames';
import dayjs from 'dayjs';

import { TABS, buildTable } from './helpers';
import style from './style.css';

const PowerRow = ({ row, showShare, name }) => (
  <tr class={cx(row.muted && 'text-muted')}>
    <td class={style.name}>{name}</td>
    <td class={style.value}>{row.display}</td>
    {showShare && <td class={style.value}>{row.share === null ? '—' : `${row.share.toFixed(1)} %`}</td>}
  </tr>
);

const PowerTable = ({ summary, tab, user, onSelectTab }) => {
  const table = buildTable(summary, tab);
  const periodStart = summary && summary.period_starts ? summary.period_starts[tab] : null;
  return (
    <div class="card mb-0 h-100">
      <div class="card-body">
        <div class={cx('d-flex', 'mb-3', style.tabsWrap)}>
          <div class={cx('btn-group', 'btn-group-sm', style.tabs)} role="group">
            {TABS.map(key => (
              <button
                key={key}
                type="button"
                class={cx('btn', key === tab ? 'btn-primary' : 'btn-outline-primary')}
                aria-pressed={key === tab ? 'true' : 'false'}
                onClick={() => onSelectTab(key)}
              >
                <Text id={`hawrayPower.table.tabs.${key}`} />
              </button>
            ))}
          </div>
        </div>
        {table.total === null && summary && (
          <p class="text-muted small">
            <Text id="hawrayPower.table.noMains" />
          </p>
        )}
        <table class="table table-sm mb-0">
          <thead>
            <tr>
              <th scope="col">
                <Text id="hawrayPower.table.columns.name" />
              </th>
              <th scope="col" class={style.value}>
                <Text id="hawrayPower.table.columns.value" />
              </th>
              <th scope="col" class={style.value}>
                <Text id="hawrayPower.table.columns.share" />
              </th>
            </tr>
          </thead>
          <tbody>
            {table.total && (
              <tr class="font-weight-bold">
                <td>
                  <Text id="hawrayPower.table.total" />
                </td>
                <td class={style.value}>{table.total.display}</td>
                <td class={style.value}>{table.total.share === null ? '—' : '100.0 %'}</td>
              </tr>
            )}
            {table.circuits.map(row => (
              <PowerRow key={row.selector} row={row} showShare name={row.name} />
            ))}
            {table.other && <PowerRow row={table.other} showShare name={<Text id="hawrayPower.table.other" />} />}
          </tbody>
        </table>
        {table.plugs.length > 0 && (
          <div class="mt-3">
            <h3 class={cx('h6', 'text-muted', 'text-uppercase', style.sectionTitle)}>
              <Text id="hawrayPower.table.plugs" />
            </h3>
            <table class="table table-sm mb-0">
              <tbody>
                {table.plugs.map(row => (
                  <PowerRow key={row.selector} row={row} showShare={false} name={row.name} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p class="text-muted small mt-3 mb-0">
          {tab === 'live' ? (
            <Text id="hawrayPower.table.liveNote" />
          ) : (
            <Text
              id="hawrayPower.table.periodNote"
              fields={{
                start: periodStart
                  ? dayjs(periodStart)
                      .locale(user.language)
                      .format('LLL')
                  : '—'
              }}
            />
          )}
        </p>
      </div>
    </div>
  );
};

export default PowerTable;
