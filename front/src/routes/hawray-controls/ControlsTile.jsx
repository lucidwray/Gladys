import { Text, Localizer } from 'preact-i18n';
import { route } from 'preact-router';
import cx from 'classnames';

import RelativeTime from '../../components/device/RelativeTime';
import { getFeatureIcon } from '../devices/helpers';
import style from './style.css';
import { formatAbsoluteDate, getDeviceIconFeature, getDeviceSummary } from './helpers';

// One device of the list: the whole tile opens the device page (click, or Enter on the focused tile).
// The switch sits inside the tile and stops the event before it reaches the tile, so it never navigates.
const ControlsTile = ({ device, user, intl, onToggle }) => {
  const summary = getDeviceSummary(device.features, { user, dictionary: intl.dictionary });
  const { binary } = summary;
  const isOn = binary ? binary.last_value === 1 : false;
  const detailUrl = `/dashboard/controls/${encodeURIComponent(device.selector)}`;

  const openDevice = () => route(detailUrl);
  const handleKeyDown = event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      openDevice();
    }
  };
  // Stops the click of the switch (and of its label) from reaching the tile
  const keepInSwitch = event => event.stopPropagation();

  return (
    <div
      class={cx('card', 'mb-0', style.tile)}
      role="link"
      tabIndex={0}
      aria-label={device.name}
      onClick={openDevice}
      onKeyDown={handleKeyDown}
    >
      <div class="card-body p-3 d-flex align-items-center">
        <span class="stamp stamp-md">
          <i class={`fe fe-${getFeatureIcon(getDeviceIconFeature(device.features))}`} />
        </span>
        <div class={cx('ml-3', 'flex-fill', style.tileBody)}>
          <div class={style.tileName}>{device.name}</div>
          <div class={cx('small text-muted', style.tileSummary)}>
            {summary.text && <span>{summary.text}</span>}
            {summary.lastSeen && (
              <span title={formatAbsoluteDate(summary.lastSeen, user && user.language)}>
                <Text id="hawrayControls.list.lastSeen" />{' '}
                <RelativeTime datetime={summary.lastSeen} language={user ? user.language : null} futureDisabled />
              </span>
            )}
            {summary.empty && <Text id="hawrayControls.list.noState" />}
          </div>
        </div>
        {binary && (
          <label class={cx('custom-switch', 'm-0', 'ml-2', style.tileToggle)} onClick={keepInSwitch}>
            <Localizer>
              <input
                type="checkbox"
                class="custom-switch-input"
                checked={isOn}
                aria-label={<Text id="hawrayControls.list.toggle" fields={{ name: device.name }} />}
                onKeyDown={keepInSwitch}
                onChange={() => onToggle(binary, isOn ? 0 : 1)}
              />
            </Localizer>
            <span class="custom-switch-indicator" />
          </label>
        )}
      </div>
    </div>
  );
};

export default ControlsTile;
