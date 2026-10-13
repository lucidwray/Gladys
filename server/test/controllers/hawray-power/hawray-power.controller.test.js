const { expect } = require('chai');
const { authenticatedRequest, nonAdminRequest, request, NON_ADMIN_USER_ID } = require('../request.test');
const db = require('../../../models');
const { USER_ROLE } = require('../../../utils/constants');

const POWER_DEVICE = 'hawray-power-plug';
const POWER_FEATURE = 'hawray-power-plug-power';

const seedNonAdminUser = () =>
  db.User.create({
    id: NON_ADMIN_USER_ID,
    firstname: 'Pepper',
    lastname: 'Potts',
    selector: 'pepper-habitant',
    email: 'pepper-habitant@pots.com',
    password: 'mysuperpassword',
    role: USER_ROLE.HABITANT,
    language: 'en',
    birthdate: '1990-12-12',
  });

describe('hawray power endpoints', () => {
  before(async () => {
    // a switch with a power feature, so that a mains override can point at it
    await authenticatedRequest
      .post('/api/v1/device')
      .send({
        service_id: 'a810b8db-6d04-4697-bed3-c4b72c996279',
        name: 'Hawray power plug',
        model: 'Zigbee plug',
        external_id: 'hawray-power-plug-ext',
        params: [],
        features: [
          {
            name: 'Hawray power plug power',
            external_id: 'hawray-power-plug-ext-power',
            category: 'switch',
            type: 'power',
            unit: 'watt',
            read_only: true,
            has_feedback: false,
            keep_history: true,
            min: 0,
            max: 10000,
          },
        ],
      })
      .expect(200);
  });

  describe('GET /api/v1/hawray/power/series', () => {
    it('answers an authenticated user with the bucketed series', async () => {
      await authenticatedRequest
        .get('/api/v1/hawray/power/series')
        .query({
          features: 'test-device-feature',
          from: '2026-10-12T00:00:00.000Z',
          to: '2026-10-12T01:00:00.000Z',
        })
        .expect('Content-Type', /json/)
        .expect(200)
        .then((res) => {
          expect(res.body).to.have.property('bucket_seconds', 60);
          expect(res.body.series).to.deep.equal([{ feature_selector: 'test-device-feature', points: [] }]);
        });
    });

    it('answers a non-admin user', async () => {
      await seedNonAdminUser();
      await nonAdminRequest
        .get('/api/v1/hawray/power/series')
        .query({ features: 'test-device-feature', from: '2026-10-12T00:00:00Z', to: '2026-10-12T01:00:00Z' })
        .expect('Content-Type', /json/)
        .expect(200);
    });

    it('refuses an unauthenticated user', async () => {
      await request
        .get('/api/v1/hawray/power/series')
        .query({ features: 'test-device-feature', from: '2026-10-12T00:00:00Z', to: '2026-10-12T01:00:00Z' })
        .expect(401);
    });

    it('answers 400 BadParameters on an invalid parameter', async () => {
      await authenticatedRequest
        .get('/api/v1/hawray/power/series')
        .query({
          features: 'test-device-feature',
          from: '2026-10-12T00:00:00Z',
          to: '2026-10-12T01:00:00Z',
          bucket: '30',
        })
        .expect('Content-Type', /json/)
        .expect(400);
      await authenticatedRequest
        .get('/api/v1/hawray/power/series')
        .query({ features: 'no-such-feature', from: '2026-10-12T00:00:00Z', to: '2026-10-12T01:00:00Z' })
        .expect(400);
    });
  });

  describe('GET /api/v1/hawray/power/summary', () => {
    it('answers an authenticated user with the roles, the periods and the live values', async () => {
      await authenticatedRequest
        .get('/api/v1/hawray/power/summary')
        .query({ scale: 'live' })
        .expect('Content-Type', /json/)
        .expect(200)
        .then((res) => {
          expect(res.body).to.have.property('scale', 'live');
          expect(res.body).to.have.property('timezone');
          expect(res.body.period_starts).to.have.all.keys('min', 'hr', 'day', 'wk', 'mo', 'yr');
          expect(res.body.roles).to.have.all.keys('mains', 'balance', 'circuits', 'plugs');
          expect(res.body.roles.plugs.map((role) => role.power_feature_selector)).to.include(POWER_FEATURE);
        });
    });

    it('answers kWh for a period scale, and the live scale when scale is omitted', async () => {
      await authenticatedRequest
        .get('/api/v1/hawray/power/summary')
        .query({ scale: 'day' })
        .expect(200)
        .then((res) => {
          expect(res.body.period_start).to.equal(res.body.period_starts.day);
          const plug = res.body.values.find((value) => value.feature_selector === POWER_FEATURE);
          expect(plug).to.have.property('kwh', 0);
        });
      await authenticatedRequest
        .get('/api/v1/hawray/power/summary')
        .expect(200)
        .then((res) => {
          expect(res.body.scale).to.equal('live');
        });
    });

    it('answers a non-admin user', async () => {
      await seedNonAdminUser();
      await nonAdminRequest
        .get('/api/v1/hawray/power/summary')
        .query({ scale: 'hr' })
        .expect(200);
    });

    it('refuses an unauthenticated user', async () => {
      await request
        .get('/api/v1/hawray/power/summary')
        .query({ scale: 'live' })
        .expect(401);
    });

    it('answers 400 BadParameters on an unknown scale', async () => {
      await authenticatedRequest
        .get('/api/v1/hawray/power/summary')
        .query({ scale: 'week' })
        .expect(400);
    });
  });

  describe('POST /api/v1/hawray/power/settings', () => {
    afterEach(async () => {
      await authenticatedRequest
        .post('/api/v1/hawray/power/settings')
        .send({ mains_device_selector: '' })
        .expect(200);
    });

    it('stores the mains override that the summary then uses', async () => {
      await authenticatedRequest
        .post('/api/v1/hawray/power/settings')
        .send({ mains_device_selector: POWER_DEVICE })
        .expect('Content-Type', /json/)
        .expect(200)
        .then((res) => {
          expect(res.body).to.deep.equal({ mains_device_selector: POWER_DEVICE });
        });
      await authenticatedRequest
        .get('/api/v1/hawray/power/summary')
        .query({ scale: 'live' })
        .expect(200)
        .then((res) => {
          expect(res.body.mains_source).to.equal('override');
          expect(res.body.mains_device_selector).to.equal(POWER_DEVICE);
          expect(res.body.roles.mains.power_feature_selector).to.equal(POWER_FEATURE);
        });
    });

    it('lets a non-admin user write the override', async () => {
      await seedNonAdminUser();
      await nonAdminRequest
        .post('/api/v1/hawray/power/settings')
        .send({ mains_device_selector: POWER_DEVICE })
        .expect('Content-Type', /json/)
        .expect(200)
        .then((res) => {
          expect(res.body).to.deep.equal({ mains_device_selector: POWER_DEVICE });
        });
    });

    it('refuses an unauthenticated user', async () => {
      await request
        .post('/api/v1/hawray/power/settings')
        .send({ mains_device_selector: POWER_DEVICE })
        .expect(401);
    });

    it('refuses an unknown device and a non-string selector with 400', async () => {
      await authenticatedRequest
        .post('/api/v1/hawray/power/settings')
        .send({ mains_device_selector: 'no-such-device' })
        .expect('Content-Type', /json/)
        .expect(400);
      await authenticatedRequest
        .post('/api/v1/hawray/power/settings')
        .send({ mains_device_selector: 42 })
        .expect(400);
    });
  });
});
