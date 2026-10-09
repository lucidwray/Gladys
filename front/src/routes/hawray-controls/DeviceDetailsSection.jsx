import { Text } from 'preact-i18n';
import get from 'get-value';

import { formatAbsoluteDate, getDisplayedParamValue } from './helpers';

// Shown in place of the value of a param whose name looks like a credential
const MASK = '••••••••';

const DetailRow = ({ label, children }) => (
  <div class="row mb-2">
    <dt class="col-sm-4 text-muted font-weight-normal">{label}</dt>
    <dd class="col-sm-8 mb-0 text-break">{children}</dd>
  </div>
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
          <dl class="row mb-0">
            <DetailRow label={<Text id="hawrayControls.detail.details.model" />}>{device.model || '—'}</DetailRow>
            <DetailRow label={<Text id="hawrayControls.detail.details.externalId" />}>
              {device.external_id ? <code class="small">{device.external_id}</code> : '—'}
            </DetailRow>
            <DetailRow label={<Text id="hawrayControls.detail.details.selector" />}>
              <code class="small">{device.selector}</code>
            </DetailRow>
            <DetailRow label={<Text id="hawrayControls.detail.details.createdAt" />}>
              {device.created_at ? formatAbsoluteDate(device.created_at, language) : '—'}
            </DetailRow>
            <DetailRow label={<Text id="hawrayControls.detail.details.updatedAt" />}>
              {device.updated_at ? formatAbsoluteDate(device.updated_at, language) : '—'}
            </DetailRow>
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
                            {MASK}
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
