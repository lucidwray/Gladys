const asyncMiddleware = require('../middlewares/asyncMiddleware');
const { getSeries } = require('../../lib/hawray-power/series');
const { getSummary } = require('../../lib/hawray-power/summary');
const { setMainsOverride } = require('../../lib/hawray-power/settings');

/**
 * @description Hawray Power page REST controller (docs/specs/hawray-power-page.md, section 7).
 * @param {object} gladys - Gladys service container.
 * @returns {object} Controller handlers.
 * @example
 * HawrayPowerController(gladys);
 */
module.exports = function HawrayPowerController(gladys) {
  /**
   * @api {get} /api/v1/hawray/power/series getSeries
   * @apiName getSeries
   * @apiGroup HawrayPower
   * @apiDescription Time-bucketed average power of several features on one grid.
   */
  async function series(req, res) {
    const result = await getSeries(gladys.stateManager, req.query);
    res.json(result);
  }

  /**
   * @api {get} /api/v1/hawray/power/summary getSummary
   * @apiName getSummary
   * @apiGroup HawrayPower
   * @apiDescription Roles, mains override, period starts and the table values of one scale.
   */
  async function summary(req, res) {
    const result = await getSummary(gladys, req.query.scale || 'live');
    res.json(result);
  }

  /**
   * @api {post} /api/v1/hawray/power/settings setMainsOverride
   * @apiName setMainsOverride
   * @apiGroup HawrayPower
   * @apiDescription Set (or clear, with an empty value) the mains device override.
   */
  async function settings(req, res) {
    const result = await setMainsOverride(gladys, req.body.mains_device_selector);
    res.json(result);
  }

  return Object.freeze({
    series: asyncMiddleware(series),
    summary: asyncMiddleware(summary),
    settings: asyncMiddleware(settings),
  });
};
