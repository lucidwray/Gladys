import { Text } from 'preact-i18n';
import { Link } from 'preact-router/match';
import cx from 'classnames';

import style from './style.css';

// Section a: the name of the device, its room, and the integration it comes from with a link to its settings
const DeviceInfoSection = ({ device, integration, loading }) => {
  if (!device) {
    return loading ? (
      <div class="page-header mb-4">
        <div class={cx(style.titleSkeleton)} />
      </div>
    ) : null;
  }

  let integrationLabel = null;
  if (integration) {
    const name = integration.i18nKey ? <Text id={integration.i18nKey}>{integration.name}</Text> : integration.name;
    integrationLabel = (
      <span>
        <Text id="hawrayControls.detail.integration" />{' '}
        {integration.deviceUrl || integration.url ? (
          <Link href={integration.deviceUrl || integration.url}>{name}</Link>
        ) : (
          name
        )}
      </span>
    );
  }

  return (
    <div class="page-header mb-4">
      <h1 class={cx('page-title', style.deviceTitle)}>{device.name}</h1>
      <div class="page-subtitle d-flex flex-wrap">
        <span class="mr-3">{device.room ? device.room.name : <Text id="hawrayControls.detail.noRoom" />}</span>
        {integrationLabel}
      </div>
    </div>
  );
};

export default DeviceInfoSection;
