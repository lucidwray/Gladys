const { expect } = require('chai');
const sinon = require('sinon').createSandbox();
const EventEmitter = require('events');

const { fake, assert } = sinon;
const { EVENTS } = require('../../../../../utils/constants');
const { handleGladysMessage } = require('../../../../../services/mqtt/lib/handler/handleGladysMessage');
const StateManager = require('../../../../../lib/state');
const ServiceManager = require('../../../../../lib/service');
const Device = require('../../../../../lib/device');
const Job = require('../../../../../lib/job');
const db = require('../../../../../models');

const SERVICE_ID = 'a810b8db-6d04-4697-bed3-c4b72c996279';

describe('handleGladysMessage - device create', () => {
  let gladys;
  let context;

  beforeEach(() => {
    gladys = {
      event: { emit: fake.returns(null) },
      stateManager: { get: fake.returns(undefined) },
    };
    context = { gladys };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should emit a new device with its name and room, when the device is not known yet', () => {
    const payload = { external_id: 'midea-new', name: 'Midea AC', room_id: 'room-1', service_id: SERVICE_ID };
    handleGladysMessage.call(context, 'gladys/master/device/create', JSON.stringify(payload));
    assert.calledWith(gladys.stateManager.get, 'deviceByExternalId', 'midea-new');
    assert.calledWith(gladys.event.emit, EVENTS.DEVICE.NEW, payload);
  });

  it('should not emit the name and room of an existing device, but keep the features', () => {
    gladys.stateManager.get = fake.returns({ external_id: 'midea-1', name: 'Dylans Window AC', room_id: 'room-1' });
    const features = [{ external_id: 'midea-1:power', name: 'Power', category: 'switch', type: 'binary' }];
    handleGladysMessage.call(
      context,
      'gladys/master/device/create',
      JSON.stringify({ external_id: 'midea-1', name: 'Midea AC 43980465138801', room_id: 'room-2', features }),
    );
    assert.calledWith(gladys.event.emit, EVENTS.DEVICE.NEW, { external_id: 'midea-1', features });
  });

  it('should keep the name of an existing device in the database', async () => {
    const event = new EventEmitter();
    const stateManager = new StateManager(event);
    const serviceManager = new ServiceManager({}, stateManager);
    const device = new Device(event, {}, stateManager, serviceManager, {}, {}, new Job(event), {
      addNamedEntity: fake.returns(null),
      removeNamedEntity: fake.returns(null),
    });
    const externalId = 'hawray-keep-name-existing';
    const feature = {
      name: 'Power',
      external_id: `${externalId}:power`,
      category: 'switch',
      type: 'binary',
      read_only: false,
      keep_history: true,
      has_feedback: true,
      min: 0,
      max: 1,
    };
    await device.create({ service_id: SERVICE_ID, name: 'Dylans Window AC', external_id: externalId, features: [] });
    // the owner renamed the device in the UI, then the bridge resends its create message
    let pendingCreate;
    const realGladys = {
      event: {
        emit: (eventName, payload) => {
          pendingCreate = device.create(payload);
        },
      },
      stateManager,
    };
    handleGladysMessage.call(
      { gladys: realGladys },
      'gladys/master/device/create',
      JSON.stringify({
        service_id: SERVICE_ID,
        name: 'Midea AC 43980465138801',
        external_id: externalId,
        features: [feature],
      }),
    );
    await pendingCreate;
    const deviceInDb = await db.Device.findOne({ where: { external_id: externalId } });
    expect(deviceInDb.name).to.equal('Dylans Window AC');
    const featuresInDb = await db.DeviceFeature.findAll({ where: { device_id: deviceInDb.id } });
    expect(featuresInDb.map((f) => f.external_id)).to.deep.equal([`${externalId}:power`]);
  });
});
