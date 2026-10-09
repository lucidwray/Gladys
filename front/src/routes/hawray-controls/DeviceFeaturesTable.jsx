import { Text } from 'preact-i18n';

import RelativeTime from '../../components/device/RelativeTime';
import { formatAbsoluteDate, formatFeatureValue, isChartableFeature } from './helpers';

const hasNumber = value => typeof value === 'number' && Number.isFinite(value);

// Section c: every feature of the device, with what it is, how it is accessed and what it last held
const DeviceFeaturesTable = ({ features, user, intl }) => {
  const { dictionary } = intl;
  const language = user ? user.language : null;
  const options = { user, dictionary };

  return (
    <section class="mb-4">
      <h2 class="h4 mb-3">
        <Text id="hawrayControls.detail.features.title" />
      </h2>
      {features.length === 0 ? (
        <div class="card">
          <div class="card-body text-muted">
            <Text id="hawrayControls.detail.features.empty" />
          </div>
        </div>
      ) : (
        <div class="card">
          <div class="table-responsive">
            <table class="table card-table table-vcenter text-nowrap">
              <thead>
                <tr>
                  <th>
                    <Text id="hawrayControls.detail.features.name" />
                  </th>
                  <th>
                    <Text id="hawrayControls.detail.features.type" />
                  </th>
                  <th>
                    <Text id="hawrayControls.detail.features.unit" />
                  </th>
                  <th>
                    <Text id="hawrayControls.detail.features.range" />
                  </th>
                  <th>
                    <Text id="hawrayControls.detail.features.access" />
                  </th>
                  <th>
                    <Text id="hawrayControls.detail.features.lastValue" />
                  </th>
                  <th>
                    <Text id="hawrayControls.detail.features.lastChanged" />
                  </th>
                  <th>
                    <Text id="hawrayControls.detail.features.selector" />
                  </th>
                </tr>
              </thead>
              <tbody>
                {features.map(feature => {
                  const value = formatFeatureValue(feature, options);
                  const hasRange = isChartableFeature(feature) && hasNumber(feature.min) && hasNumber(feature.max);
                  return (
                    <tr key={feature.selector}>
                      <td>{feature.name}</td>
                      <td>
                        <div>
                          <Text id={`deviceFeatureCategory.${feature.category}.${feature.type}`}>{feature.type}</Text>
                        </div>
                        <div class="small text-muted">
                          <Text id={`deviceFeatureCategory.${feature.category}.shortCategoryName`}>
                            {feature.category}
                          </Text>
                        </div>
                      </td>
                      <td>
                        {feature.unit ? <Text id={`deviceFeatureUnitShort.${feature.unit}`}>{feature.unit}</Text> : '—'}
                      </td>
                      <td>{hasRange ? `${feature.min} – ${feature.max}` : '—'}</td>
                      <td>
                        {feature.read_only ? (
                          <Text id="hawrayControls.detail.features.readOnly" />
                        ) : (
                          <Text id="hawrayControls.detail.features.writable" />
                        )}
                      </td>
                      <td>{value !== null ? value : <Text id="deviceFeatureValueText.noValue" />}</td>
                      <td>
                        {feature.last_value_changed ? (
                          <span title={formatAbsoluteDate(feature.last_value_changed, language)}>
                            <RelativeTime datetime={feature.last_value_changed} language={language} futureDisabled />
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        <code class="small">{feature.selector}</code>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
};

export default DeviceFeaturesTable;
