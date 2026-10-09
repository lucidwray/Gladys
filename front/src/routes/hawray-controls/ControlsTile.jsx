import { Text, Localizer } from 'preact-i18n';
import { Link } from 'preact-router';
import cx from 'classnames';

import RelativeTime from '../../components/device/RelativeTime';
import { getFeatureIcon } from '../devices/helpers';
import style from './style.css';
import { formatAbsoluteDate, getDeviceIconFeature, getDeviceSummary } from './helpers';

// One device of the list. The device name is a real link to the device page; its ::after overlay (style.css)
// stretches over the tile, so a click anywhere on the tile opens the page, and ctrl/middle click opens it in a
// new tab. The switch is NOT inside the link: it sits above the overlay and never navigates.
const ControlsTile = ({ device, user, intl, onToggle }) => {
  const summary = getDeviceSummary(device.features, { user, dictionary: intl.dictionary });
  const { binary } = summary;
  const isOn = binary ? binary.last_value === 1 : false;
  const detailUrl = `/dashboard/controls/${encodeURIComponent(device.selector)}`;

  return (
    <div class={cx('card', 'mb-0', style.tile)}>
      <div class="card-body p-3 d-flex align-items-center">
        <span class="stamp stamp-md">
          <i class={`fe fe-${getFeatureIcon(getDeviceIconFeature(device.features))}`} />
        </span>
        <div class={cx('ml-3', 'flex-fill', style.tileBody)}>
          <Link href={detailUrl} class={style.tileName}>
            {device.name}
          </Link>
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
          <label class={cx('custom-switch', 'm-0', 'ml-2', style.tileToggle)}>
            <Localizer>
              <input
                type="checkbox"
                class="custom-switch-input"
                checked={isOn}
                aria-label={<Text id="hawrayControls.list.toggle" fields={{ name: device.name }} />}
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
