const { expect } = require('chai');
const { randomUUID } = require('crypto');
const EventEmitter = require('events');
const db = require('../../../models');
const StateManager = require('../../../lib/state');
const { BadParameters } = require('../../../utils/coreErrors');
const { MAINS_OVERRIDE_VARIABLE } = require('../../../lib/hawray-power/constants');
const { getSummary } = require('../../../lib/hawray-power/summary');

const MINUTE_MS = 60 * 1000;
const NOW_MS = Date.parse('2026-10-13T16:30:00Z'); // 12:30 EDT, Tuesday

const buildFeature = (selector, category, type, lastValue) => ({
  id: randomUUID(),
  selector,
  name: `${selector} name`,
  external_id: `${selector}-ext`,
  category,
  type,
  unit: 'W',
  last_value: lastValue,
  last_value_changed: '2026-10-13T16:29:30.000Z',
});

const buildDevice = (selector, externalId, model, features) => ({
  id: randomUUID(),
  selector,
  name: `${selector} name`,
  external_id: externalId,
  model,
  features,
});

// A variable manager stub: the values of the test, nothing persisted.
const buildVariable = (values = {}) => ({
  getValue: async (key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null),
});

const buildDeps = ({ variableValues = { TIMEZONE: 'America/New_York' }, devices = [] } = {}) => {
  const stateManager = new StateManager(new EventEmitter());
  devices.forEach((device) => {
    stateManager.setState('device', device.selector, device);
    device.features.forEach((feature) => stateManager.setState('deviceFeature', feature.selector, feature));
  });
  return { stateManager, variable: buildVariable(variableValues) };
};

// Writes one sample per minute between two instants, each with the same value.
const sampleEveryMinute = (featureId, fromMs, toMs, value) => {
  const samples = [];
  for (let t = fromMs; t < toMs; t += MINUTE_MS) {
    samples.push({ value, created_at: new Date(t) });
  }
  return db.duckDbBatchInsertState(featureId, samples);
};

const rowBySelector = (summary, selector) => summary.roles.find((row) => row.power_feature_selector === selector);

describe('hawray power summary', () => {
  let mainsFeature;
  let kitchenFeature;
  let plugFeature;
  let house;

  const buildHouse = () => {
    const emporia = (selector, externalId, features) =>
      buildDevice(selector, externalId, 'Emporia Vue channel', features);
    mainsFeature = buildFeature('sum-mains-power', 'energy-sensor', 'power', 2400);
    const balanceFeature = buildFeature('sum-balance-power', 'energy-sensor', 'power', 300);
    kitchenFeature = buildFeature('sum-kitchen-power', 'energy-sensor', 'power', 0);
    plugFeature = buildFeature('sum-plug-power', 'switch', 'power', -12.5);
    return [
      emporia('sum-mains', 'emporia-1:1-2-3', [mainsFeature]),
      emporia('sum-balance', 'emporia-1:balance', [balanceFeature]),
      emporia('sum-kitchen', 'emporia-1:1-7', [kitchenFeature]),
      buildDevice('sum-plug', 'plug-ext', 'Zigbee plug', [plugFeature]),
    ];
  };

  beforeEach(() => {
    house = buildHouse();
  });

  describe('live', () => {
    it('returns the roles as a flat list, with last_value and last_value_changed and kwh null', async () => {
      const summary = await getSummary(buildDeps({ devices: house }), 'live', { nowMs: NOW_MS });
      expect(summary.scale).to.equal('live');
      expect(summary.roles.map((row) => [row.role, row.power_feature_selector])).to.deep.equal([
        ['mains', 'sum-mains-power'],
        ['balance', 'sum-balance-power'],
        ['circuit', 'sum-kitchen-power'],
        ['plug', 'sum-plug-power'],
      ]);
      expect(rowBySelector(summary, 'sum-mains-power')).to.deep.equal({
        role: 'mains',
        device_selector: 'sum-mains',
        name: 'sum-mains name',
        power_feature_selector: 'sum-mains-power',
        last_value: 2400,
        last_value_changed: '2026-10-13T16:29:30.000Z',
        kwh: null,
      });
      // raw values: negative and zero are not clamped here
      expect(rowBySelector(summary, 'sum-plug-power').last_value).to.equal(-12.5);
      expect(rowBySelector(summary, 'sum-kitchen-power').last_value).to.equal(0);
    });

    it('returns the period starts of every scale in the house timezone, and the override', async () => {
      const summary = await getSummary(buildDeps({ devices: house }), 'live', { nowMs: NOW_MS });
      expect(summary.timezone).to.equal('America/New_York');
      expect(summary.period_starts).to.deep.equal({
        min: '2026-10-13T16:30:00.000Z',
        hr: '2026-10-13T16:00:00.000Z',
        day: '2026-10-13T04:00:00.000Z',
        wk: '2026-10-12T04:00:00.000Z',
        mo: '2026-10-01T04:00:00.000Z',
        yr: '2026-01-01T05:00:00.000Z',
      });
      expect(summary.mains_override).to.equal(null);
      expect(summary).to.have.all.keys('scale', 'timezone', 'period_starts', 'mains_override', 'roles');
    });

    it('falls back to Europe/Paris when the TIMEZONE variable is unset', async () => {
      const summary = await getSummary(buildDeps({ devices: house, variableValues: {} }), 'live', {
        nowMs: NOW_MS,
      });
      expect(summary.timezone).to.equal('Europe/Paris');
      expect(summary.period_starts.hr).to.equal('2026-10-13T16:00:00.000Z'); // 18:00 CEST
    });
  });

  describe('kWh of the period so far', () => {
    it('is the sum of one-minute average power times the minute, for the current hour only', async () => {
      const hourStart = Date.parse('2026-10-13T16:00:00Z');
      // 30 minutes at 1000 W in the current hour => 30 x 1000 x 60 / 3.6e6 = 0.5 kWh
      await sampleEveryMinute(mainsFeature.id, hourStart, NOW_MS, 1000);
      // before the hour and at or after now: not counted
      await sampleEveryMinute(mainsFeature.id, hourStart - 30 * MINUTE_MS, hourStart, 9999);
      await sampleEveryMinute(mainsFeature.id, NOW_MS, NOW_MS + 10 * MINUTE_MS, 9999);
      const summary = await getSummary(buildDeps({ devices: house }), 'hr', { nowMs: NOW_MS });
      expect(summary.period_starts.hr).to.equal('2026-10-13T16:00:00.000Z');
      const mains = rowBySelector(summary, 'sum-mains-power');
      expect(mains.kwh).to.be.closeTo(0.5, 1e-9);
      expect(mains.last_value).to.equal(2400);
    });

    it('counts an empty minute as 0, so an outage lowers the kWh', async () => {
      const hourStart = Date.parse('2026-10-13T16:00:00Z');
      // 20 of the 30 minutes have samples at 600 W => 20 x 600 x 60 / 3.6e6 = 0.2 kWh
      await sampleEveryMinute(kitchenFeature.id, hourStart, hourStart + 20 * MINUTE_MS, 600);
      await sampleEveryMinute(kitchenFeature.id, hourStart + 25 * MINUTE_MS, NOW_MS, 600);
      const summary = await getSummary(buildDeps({ devices: house }), 'hr', { nowMs: NOW_MS });
      expect(rowBySelector(summary, 'sum-kitchen-power').kwh).to.be.closeTo(0.2 + (5 * 600 * 60) / 3.6e6, 1e-9);
    });

    it('keeps negative averages raw, and reports 0 for a feature without samples', async () => {
      const hourStart = Date.parse('2026-10-13T16:00:00Z');
      await sampleEveryMinute(plugFeature.id, hourStart, NOW_MS, -500);
      const summary = await getSummary(buildDeps({ devices: house }), 'hr', { nowMs: NOW_MS });
      expect(rowBySelector(summary, 'sum-plug-power').kwh).to.be.closeTo(-0.25, 1e-9);
      expect(rowBySelector(summary, 'sum-balance-power').kwh).to.equal(0);
    });

    it('uses the day period in the house timezone, starting at local midnight', async () => {
      const dayStart = Date.parse('2026-10-13T04:00:00Z'); // local midnight, EDT
      const nowDay = dayStart + 23 * 60 * MINUTE_MS + 30 * MINUTE_MS;
      // 23.5 hours at 1000 W from local midnight => 23.5 kWh; the samples after now do not count
      await sampleEveryMinute(mainsFeature.id, dayStart, nowDay, 1000);
      await sampleEveryMinute(mainsFeature.id, nowDay, nowDay + 10 * MINUTE_MS, 9999);
      const summary = await getSummary(buildDeps({ devices: house }), 'day', { nowMs: nowDay });
      expect(summary.period_starts.day).to.equal('2026-10-13T04:00:00.000Z');
      expect(rowBySelector(summary, 'sum-mains-power').kwh).to.be.closeTo(23.5, 1e-9);
    });

    it('returns no roles, and no kWh query, when the house has no power feature', async () => {
      const summary = await getSummary(buildDeps({ devices: [] }), 'day', { nowMs: NOW_MS });
      expect(summary.roles).to.deep.equal([]);
      expect(summary.period_starts.day).to.equal('2026-10-13T04:00:00.000Z');
    });
  });

  describe('mains override', () => {
    it('uses the override device for mains when it is valid, and reports it', async () => {
      const deps = buildDeps({
        devices: house,
        variableValues: { TIMEZONE: 'America/New_York', [MAINS_OVERRIDE_VARIABLE]: 'sum-plug' },
      });
      const summary = await getSummary(deps, 'live', { nowMs: NOW_MS });
      expect(summary.mains_override).to.equal('sum-plug');
      expect(summary.roles.filter((row) => row.role === 'mains').map((row) => row.device_selector)).to.deep.equal([
        'sum-plug',
      ]);
      expect(summary.roles.filter((row) => row.role === 'circuit').map((row) => row.device_selector)).to.deep.equal([
        'sum-kitchen',
        'sum-mains',
      ]);
    });

    it('reports no override when the stored one is not valid', async () => {
      const deps = buildDeps({
        devices: house,
        variableValues: { TIMEZONE: 'America/New_York', [MAINS_OVERRIDE_VARIABLE]: 'no-such-device' },
      });
      const summary = await getSummary(deps, 'live', { nowMs: NOW_MS });
      expect(summary.mains_override).to.equal(null);
      expect(summary.roles[0].device_selector).to.equal('sum-mains');
    });
  });

  it('rejects an unknown scale with BadParameters', async () => {
    let error;
    try {
      await getSummary(buildDeps({ devices: house }), 'week', { nowMs: NOW_MS });
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(BadParameters);
    expect(error.message).to.include('Invalid scale parameter');
  });
});
