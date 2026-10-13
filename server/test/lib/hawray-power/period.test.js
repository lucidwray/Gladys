const { expect } = require('chai');
const { getHouseTimezone, getPeriodStarts } = require('../../../lib/hawray-power/period');
const { SYSTEM_VARIABLE_NAMES, DEFAULT_TIMEZONE } = require('../../../utils/constants');

const NEW_YORK = 'America/New_York';

describe('hawray power period starts', () => {
  describe('getHouseTimezone', () => {
    it('reads the TIMEZONE system variable', async () => {
      const requested = [];
      const variable = {
        getValue: async (key) => {
          requested.push(key);
          return NEW_YORK;
        },
      };
      expect(await getHouseTimezone(variable)).to.equal(NEW_YORK);
      expect(requested).to.deep.equal([SYSTEM_VARIABLE_NAMES.TIMEZONE]);
    });

    it('falls back to DEFAULT_TIMEZONE when the variable is unset or empty', async () => {
      expect(await getHouseTimezone({ getValue: async () => null })).to.equal(DEFAULT_TIMEZONE);
      expect(await getHouseTimezone({ getValue: async () => '' })).to.equal(DEFAULT_TIMEZONE);
      expect(DEFAULT_TIMEZONE).to.equal('Europe/Paris');
    });
  });

  describe('getPeriodStarts', () => {
    it('starts every period at its local wall-clock boundary in the timezone (EDT)', () => {
      // Tuesday 2026-10-13 12:37 EDT
      const starts = getPeriodStarts(Date.parse('2026-10-13T16:37:12Z'), NEW_YORK);
      expect(starts).to.deep.equal({
        min: '2026-10-13T16:37:00.000Z',
        hr: '2026-10-13T16:00:00.000Z',
        day: '2026-10-13T04:00:00.000Z',
        wk: '2026-10-12T04:00:00.000Z',
        mo: '2026-10-01T04:00:00.000Z',
        yr: '2026-01-01T05:00:00.000Z',
      });
    });

    it('starts the week on Monday, also when now is a Sunday', () => {
      // Sunday 2026-10-18 15:00 EDT: the week started Monday 2026-10-12
      const starts = getPeriodStarts(Date.parse('2026-10-18T19:00:00Z'), NEW_YORK);
      expect(starts.wk).to.equal('2026-10-12T04:00:00.000Z');
      expect(starts.day).to.equal('2026-10-18T04:00:00.000Z');
    });

    it('starts the week on the same day when now is a Monday', () => {
      // Monday 2026-11-02 07:00 EST
      const starts = getPeriodStarts(Date.parse('2026-11-02T12:00:00Z'), NEW_YORK);
      expect(starts.wk).to.equal('2026-11-02T05:00:00.000Z');
      expect(starts.day).to.equal('2026-11-02T05:00:00.000Z');
    });

    it('keeps local midnight across the spring DST change (2026-03-08, EST to EDT)', () => {
      // Sunday 2026-03-08 12:00 EDT, the clocks moved at 02:00 that day
      const starts = getPeriodStarts(Date.parse('2026-03-08T16:00:00Z'), NEW_YORK);
      expect(starts.min).to.equal('2026-03-08T16:00:00.000Z');
      expect(starts.hr).to.equal('2026-03-08T16:00:00.000Z');
      expect(starts.day).to.equal('2026-03-08T05:00:00.000Z'); // midnight is still EST
      expect(starts.wk).to.equal('2026-03-02T05:00:00.000Z'); // Monday midnight EST
      expect(starts.mo).to.equal('2026-03-01T05:00:00.000Z');
    });

    it('keeps local midnight across the autumn DST change (2026-11-01, EDT to EST)', () => {
      // Monday 2026-11-02 07:00 EST: the week started Monday 2026-10-26 in EDT
      const starts = getPeriodStarts(Date.parse('2026-11-02T12:00:00Z'), NEW_YORK);
      expect(starts.mo).to.equal('2026-11-01T04:00:00.000Z'); // midnight of 1 November is still EDT
      const weekStarts = getPeriodStarts(Date.parse('2026-11-01T20:00:00Z'), NEW_YORK);
      expect(weekStarts.wk).to.equal('2026-10-26T04:00:00.000Z');
      expect(weekStarts.day).to.equal('2026-11-01T04:00:00.000Z'); // midnight of 1 November, before the change at 02:00
    });

    it('starts the year and the month in the house timezone, not in UTC', () => {
      // 2026-01-01 00:30 in New York is still 2026-01-01 05:30 UTC: the year started at 05:00 UTC
      const starts = getPeriodStarts(Date.parse('2026-01-01T05:30:00Z'), NEW_YORK);
      expect(starts.yr).to.equal('2026-01-01T05:00:00.000Z');
      expect(starts.mo).to.equal('2026-01-01T05:00:00.000Z');
    });

    it('uses the Europe/Paris default timezone when none is set', () => {
      // Tuesday 2026-10-13 00:30 in Paris (CEST): the day started at 22:00 UTC on 2026-10-12
      const starts = getPeriodStarts(Date.parse('2026-10-12T22:30:00Z'), DEFAULT_TIMEZONE);
      expect(starts.day).to.equal('2026-10-12T22:00:00.000Z');
      expect(starts.wk).to.equal('2026-10-11T22:00:00.000Z'); // Monday 2026-10-12 00:00 CEST
    });
  });
});
