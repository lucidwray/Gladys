import { Fragment } from 'preact';
import { Text } from 'preact-i18n';
import get from 'get-value';

import { MASKED_SECRET, formatAbsoluteDate, getDisplayedParamValue } from './helpers';
import style from './style.css';

// One label and its value, two cells of the details grid (style.detailsList)
const DetailRow = ({ label, children }) => (
  <Fragment>
    <dt class="text-muted">{label}</dt>
    <dd class="text-break">{children}</dd>
  </Fragment>
);

// Section f: what the device is, as the server knows it, and its params
const DeviceDetailsSection = ({ device, user, intl }) => {
  const language = user ? user.language : null;
  const params = device.params || [];
  const yesNo = value => <Text id={value ? 'hawrayControls.detail.details.yes' : 'hawrayControls.detail.details.no'} />;

  return (
    <section class="mb-4">
      <h2 class="h4 mb-3">
        <Text id="hawrayControls.detail.details.title" />
      </h2>
      <div class="card">
        <div class="card-body">
          <dl class={style.detailsList}>
            <DetailRow label={<Text id="hawrayControls.detail.details.model" />}>{device.model || '—'}</DetailRow>
            <DetailRow label={<Text id="hawrayControls.detail.details.externalId" />}>
              {device.external_id ? <code class="small">{device.external_id}</code> : '—'}
            </DetailRow>
            <DetailRow label={<Text id="hawrayControls.detail.details.selector" />}>
              <code class="small">{device.selector}</code>
            </DetailRow>
            {/* The server sends both dates (the device as read from the database); a device without them
                shows no row rather than an empty one */}
            {device.created_at && (
              <DetailRow label={<Text id="hawrayControls.detail.details.createdAt" />}>
                {formatAbsoluteDate(device.created_at, language)}
              </DetailRow>
            )}
            {device.updated_at && (
              <DetailRow label={<Text id="hawrayControls.detail.details.updatedAt" />}>
                {formatAbsoluteDate(device.updated_at, language)}
              </DetailRow>
            )}
            <DetailRow label={<Text id="hawrayControls.detail.details.shouldPoll" />}>
              {yesNo(device.should_poll)}
            </DetailRow>
            <DetailRow label={<Text id="hawrayControls.detail.details.pollFrequency" />}>
              {device.poll_frequency || '—'}
            </DetailRow>
          </dl>
        </div>
        <div class="card-header">
          <h3 class="card-title">
            <Text id="hawrayControls.detail.details.params" />
          </h3>
        </div>
        {params.length === 0 ? (
          <div class="card-body text-muted">
            <Text id="hawrayControls.detail.details.noParams" />
          </div>
        ) : (
          <div class="table-responsive">
            <table class="table card-table table-vcenter">
              <tbody>
                {params.map(param => {
                  // null: a credential, its value is never rendered (not even in a title attribute)
                  const displayed = getDisplayedParamValue(param);
                  return (
                    <tr key={param.name}>
                      <td class="text-muted">
                        <code class="small">{param.name}</code>
                      </td>
                      <td class="text-break">
                        {displayed === null ? (
                          <span class="text-muted" title={get(intl.dictionary, 'hawrayControls.detail.details.masked')}>
                            {MASKED_SECRET}
                          </span>
                        ) : (
                          displayed
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};

export default DeviceDetailsSection;
