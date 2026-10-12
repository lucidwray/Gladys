const { expect } = require('chai');
const sinon = require('sinon').createSandbox();

const { stub } = sinon;
const { stopBridge } = require('../../../../services/homekit/lib/stopBridge');

describe('Stop bridge', () => {
  it('should stop a bridge', async () => {
    const homekitHandler = {
      serviceId: '7056e3d4-31cc-4d2a-bbdd-128cd49755e6',
      stopBridge,
      gladys: {
        event: {
          removeListener: stub().returns(),
        },
      },
      notifyTimeouts: {
        'home:door:binary': {
          startDateTime: new Date().getTime(),
        },
      },
      notifyCb: stub().returns(),
      bridge: {
        unpublish: stub().resolves(),
      },
    };

    await homekitHandler.stopBridge();

    expect(homekitHandler.notifyTimeouts).to.eql({});
    expect(homekitHandler.notifyCb).to.eql(null);
    expect(homekitHandler.bridge).to.eql(null);
  });

  it('should cancel the momentary scene switches still waiting to turn off', async () => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resetOn = stub();
    const homekitHandler = {
      serviceId: '7056e3d4-31cc-4d2a-bbdd-128cd49755e6',
      stopBridge,
      gladys: {
        event: {
          removeListener: stub().returns(),
        },
      },
      notifyTimeouts: {},
      notifyCb: null,
      bridge: null,
      sceneSwitchTimeouts: new Map([['movie-night', setTimeout(resetOn, 1000)]]),
    };

    try {
      await homekitHandler.stopBridge();
      clock.tick(1000);
    } finally {
      clock.restore();
    }

    expect(resetOn.callCount).to.equal(0);
    expect(homekitHandler.sceneSwitchTimeouts.size).to.equal(0);
  });
});
