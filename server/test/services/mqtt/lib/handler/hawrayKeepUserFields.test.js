const { expect } = require('chai');
const sinon = require('sinon').createSandbox();

const { fake, assert } = sinon;
const { keepUserFieldsOfExistingDevice } = require('../../../../../services/mqtt/lib/handler/hawrayKeepUserFields');

describe('hawrayKeepUserFields', () => {
  let stateManager;

  beforeEach(() => {
    stateManager = {
      get: fake.returns(undefined),
    };
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return the message untouched when the device is not in RAM yet', () => {
    const device = { external_id: 'midea-1', name: 'Midea AC', room_id: 'room-1' };
    const result = keepUserFieldsOfExistingDevice(stateManager, device);
    assert.calledWith(stateManager.get, 'deviceByExternalId', 'midea-1');
    expect(result).to.equal(device);
    expect(result).to.deep.equal({ external_id: 'midea-1', name: 'Midea AC', room_id: 'room-1' });
  });

  it('should drop name and room_id for an existing device and keep the other fields', () => {
    stateManager.get = fake.returns({ external_id: 'midea-1', name: 'Dylans Window AC', room_id: 'room-1' });
    const device = {
      external_id: 'midea-1',
      name: 'Midea AC 43980465138801',
      room_id: 'room-2',
      service_id: 'service-1',
      features: [{ external_id: 'midea-1:power', name: 'Power' }],
    };
    const result = keepUserFieldsOfExistingDevice(stateManager, device);
    expect(result).to.deep.equal({
      external_id: 'midea-1',
      service_id: 'service-1',
      features: [{ external_id: 'midea-1:power', name: 'Power' }],
    });
    // the parsed message is not mutated
    expect(device).to.have.property('name', 'Midea AC 43980465138801');
    expect(device).to.have.property('room_id', 'room-2');
  });

  it('should drop a null room_id of an existing device', () => {
    stateManager.get = fake.returns({ external_id: 'midea-1', name: 'Dylans Window AC', room_id: null });
    const result = keepUserFieldsOfExistingDevice(stateManager, { external_id: 'midea-1', room_id: null });
    expect(result).to.deep.equal({ external_id: 'midea-1' });
  });

  it('should keep working for an existing device whose payload has no name', () => {
    stateManager.get = fake.returns({ external_id: 'midea-1', name: 'Dylans Window AC' });
    const result = keepUserFieldsOfExistingDevice(stateManager, { external_id: 'midea-1', service_id: 'service-1' });
    expect(result).to.deep.equal({ external_id: 'midea-1', service_id: 'service-1' });
  });

  it('should return the message untouched when there is no external_id, device.create rejects it', () => {
    const result = keepUserFieldsOfExistingDevice(stateManager, { name: 'No id' });
    assert.notCalled(stateManager.get);
    expect(result).to.deep.equal({ name: 'No id' });
  });

  it('should return the message untouched when the payload is not an object', () => {
    expect(keepUserFieldsOfExistingDevice(stateManager, null)).to.equal(null);
    assert.notCalled(stateManager.get);
  });
});
