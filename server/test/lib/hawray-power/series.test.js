const { expect } = require('chai');
const { randomUUID } = require('crypto');
const EventEmitter = require('events');
const db = require('../../../models');
const StateManager = require('../../../lib/state');
const { BadParameters } = require('../../../utils/coreErrors');
const {
  getSeries,
  pointCount,
  resolveBucketSeconds,
  parseDateParameter,
  parseFeatures,
} = require('../../../lib/hawray-power/series');

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// A feature with its own UUID, so each test reads only the states it wrote.
const buildFeatureState = (stateManager, selector) => {
  const feature = { id: randomUUID(), selector, name: selector, category: 'energy-sensor', type: 'power' };
  stateManager.setState('deviceFeature', selector, feature);
  return feature;
};

const insertSamples = (featureId, samples) =>
  db.duckDbBatchInsertState(
    featureId,
    samples.map(([createdAt, value]) => ({ value, created_at: new Date(createdAt) })),
  );

describe('hawray power series', () => {
  let stateManager;
  beforeEach(() => {
    stateManager = new StateManager(new EventEmitter());
  });

  describe('pointCount', () => {
    it('counts the epoch-aligned buckets that can hold samples of the window', () => {
      expect(pointCount(0, DAY_MS, 3600)).to.equal(25);
      expect(pointCount(30 * 1000, 30 * 1000 + 1000, 60)).to.equal(1); // inside one bucket
      expect(pointCount(59 * 1000, 61 * 1000, 60)).to.equal(2); // straddles a boundary
    });
  });

  describe('resolveBucketSeconds', () => {
    const from = 0;
    it('picks the automatic step for each range of the spec', () => {
      expect(resolveBucketSeconds(undefined, from, DAY_MS)).to.equal(60); // 24 h
      expect(resolveBucketSeconds(null, from, 7 * DAY_MS)).to.equal(600); // 7 d
      expect(resolveBucketSeconds('', from, 30 * DAY_MS)).to.equal(1800); // 30 d
      expect(resolveBucketSeconds(undefined, from, 365 * DAY_MS)).to.equal(21600); // 1 y
    });

    it('moves to the next step exactly when the smaller one would exceed 1,500 points', () => {
      // 1,500 buckets of 60 s fit exactly; one more bucket does not
      expect(resolveBucketSeconds(undefined, from, 1499 * MINUTE_MS)).to.equal(60);
      expect(resolveBucketSeconds(undefined, from, 1500 * MINUTE_MS)).to.equal(300);
    });

    it('rejects a window that no automatic step can cover under the cap', () => {
      expect(() => resolveBucketSeconds(undefined, from, 11 * 365 * DAY_MS)).to.throw(
        BadParameters,
        'The window is too long',
      );
    });

    it('accepts an explicit integer bucket of at least 60 s that keeps the cap', () => {
      expect(resolveBucketSeconds('120', from, DAY_MS)).to.equal(120);
      expect(resolveBucketSeconds(60, from, DAY_MS)).to.equal(60);
    });

    it('rejects an explicit bucket below 60 s, non-integer, or above the point cap', () => {
      expect(() => resolveBucketSeconds('30', from, DAY_MS)).to.throw(BadParameters, 'at least 60 seconds');
      expect(() => resolveBucketSeconds(90.5, from, DAY_MS)).to.throw(BadParameters, 'at least 60 seconds');
      expect(() => resolveBucketSeconds('abc', from, DAY_MS)).to.throw(BadParameters, 'at least 60 seconds');
      expect(() => resolveBucketSeconds('60', from, 2 * DAY_MS)).to.throw(BadParameters, 'More than 1500 points');
    });
  });

  describe('parseDateParameter / parseFeatures', () => {
    it('parses ISO dates and rejects anything else', () => {
      expect(parseDateParameter('2026-10-12T00:00:00Z', 'from').toISOString()).to.equal('2026-10-12T00:00:00.000Z');
      expect(() => parseDateParameter(undefined, 'from')).to.throw(BadParameters, 'Invalid from parameter');
      expect(() => parseDateParameter('', 'to')).to.throw(BadParameters, 'Invalid to parameter');
      expect(() => parseDateParameter('not a date', 'to')).to.throw(BadParameters, 'Invalid to parameter');
      expect(() => parseDateParameter(['2026-10-12'], 'from')).to.throw(BadParameters, 'Invalid from parameter');
    });

    it('splits, trims and de-duplicates the selectors, keeping the request order', () => {
      buildFeatureState(stateManager, 'feat-a');
      buildFeatureState(stateManager, 'feat-b');
      const features = parseFeatures(' feat-b, feat-a ,feat-b,', stateManager);
      expect(features.map((feature) => feature.selector)).to.deep.equal(['feat-b', 'feat-a']);
    });

    it('rejects an empty list, a non-string list and an unknown selector', () => {
      expect(() => parseFeatures(undefined, stateManager)).to.throw(BadParameters, 'non-empty');
      expect(() => parseFeatures(' , ', stateManager)).to.throw(BadParameters, 'non-empty');
      expect(() => parseFeatures(['feat-a'], stateManager)).to.throw(BadParameters, 'non-empty');
      expect(() => parseFeatures('missing-feature', stateManager)).to.throw(
        BadParameters,
        'Unknown device feature selector: missing-feature',
      );
    });
  });

  describe('getSeries', () => {
    it('averages each bucket and omits empty buckets', async () => {
      const feature = buildFeatureState(stateManager, 'series-gaps');
      const base = Date.parse('2026-10-12T00:00:00Z');
      await insertSamples(feature.id, [
        [base + 10 * 1000, 100],
        [base + 40 * 1000, 300], // bucket 0 averages to 200
        [base + 2 * MINUTE_MS + 5 * 1000, -50], // bucket 2, negative values stay raw
      ]);
      const result = await getSeries(stateManager, {
        features: 'series-gaps',
        from: new Date(base).toISOString(),
        to: new Date(base + 5 * MINUTE_MS).toISOString(),
      });
      expect(result.bucket_seconds).to.equal(60);
      expect(result.series).to.have.lengthOf(1);
      expect(result.series[0].feature_selector).to.equal('series-gaps');
      expect(result.series[0].points).to.deep.equal([
        { t: new Date(base).toISOString(), avg_w: 200 },
        { t: new Date(base + 2 * MINUTE_MS).toISOString(), avg_w: -50 },
      ]);
    });

    it('puts two features on one grid, even when their samples are offset', async () => {
      const first = buildFeatureState(stateManager, 'grid-a');
      const second = buildFeatureState(stateManager, 'grid-b');
      const base = Date.parse('2026-10-12T00:00:00Z');
      const samples = [];
      for (let minute = 0; minute < 12; minute += 1) {
        samples.push([base + minute * MINUTE_MS + 10 * 1000, 1000 + minute]);
      }
      const otherSamples = [];
      for (let minute = 0; minute < 12; minute += 1) {
        otherSamples.push([base + minute * MINUTE_MS + 50 * 1000, 2000 + minute]);
      }
      await insertSamples(first.id, samples);
      await insertSamples(second.id, otherSamples);
      const result = await getSeries(stateManager, {
        features: 'grid-a,grid-b',
        from: new Date(base).toISOString(),
        to: new Date(base + 12 * MINUTE_MS).toISOString(),
        bucket: '300',
      });
      const [firstSeries, secondSeries] = result.series;
      expect(firstSeries.points.map((p) => p.t)).to.deep.equal([
        '2026-10-12T00:00:00.000Z',
        '2026-10-12T00:05:00.000Z',
        '2026-10-12T00:10:00.000Z',
      ]);
      expect(secondSeries.points.map((p) => p.t)).to.deep.equal(firstSeries.points.map((p) => p.t));
      // bucket 0 of the first feature: minutes 0..4 => 1000..1004
      expect(firstSeries.points[0].avg_w).to.equal(1002);
      expect(secondSeries.points[0].avg_w).to.equal(2002);
    });

    it('aligns the bucket starts on the epoch, whatever the from', async () => {
      const feature = buildFeatureState(stateManager, 'align-epoch');
      const base = Date.parse('2026-10-12T00:03:00Z');
      await insertSamples(feature.id, [[base + 20 * 1000, 10]]);
      const result = await getSeries(stateManager, {
        features: 'align-epoch',
        from: new Date(base + 5 * 1000).toISOString(), // not on a bucket boundary
        to: new Date(base + 2 * MINUTE_MS).toISOString(),
        bucket: '300',
      });
      expect(result.series[0].points).to.deep.equal([{ t: '2026-10-12T00:00:00.000Z', avg_w: 10 }]);
    });

    it('returns only the requested features, with an empty points array when none has samples', async () => {
      buildFeatureState(stateManager, 'silent-feature');
      const result = await getSeries(stateManager, {
        features: 'silent-feature',
        from: '2026-10-12T00:00:00Z',
        to: '2026-10-12T01:00:00Z',
      });
      expect(result.bucket_seconds).to.equal(60);
      expect(result.from).to.equal('2026-10-12T00:00:00.000Z');
      expect(result.to).to.equal('2026-10-12T01:00:00.000Z');
      expect(result.series).to.deep.equal([{ feature_selector: 'silent-feature', points: [] }]);
    });

    it('rejects from >= to, and the invalid parameters, with BadParameters', async () => {
      buildFeatureState(stateManager, 'rejected-feature');
      const base = { features: 'rejected-feature', from: '2026-10-12T00:00:00Z', to: '2026-10-12T01:00:00Z' };
      let error;
      try {
        await getSeries(stateManager, { ...base, from: base.to, to: base.from });
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(BadParameters);
      expect(error.message).to.include('from must be before to');
      try {
        await getSeries(stateManager, { ...base, from: base.from, to: base.from });
      } catch (e) {
        error = e;
      }
      expect(error.message).to.include('from must be before to');
      try {
        await getSeries(stateManager, { ...base, bucket: '10' });
      } catch (e) {
        error = e;
      }
      expect(error).to.be.instanceOf(BadParameters);
      try {
        await getSeries(stateManager, { features: 'nope', from: base.from, to: base.to });
      } catch (e) {
        error = e;
      }
      expect(error.message).to.include('Unknown device feature selector: nope');
    });
  });
});
