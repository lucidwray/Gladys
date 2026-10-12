const { expect } = require('chai');
const sinon = require('sinon').createSandbox();

const { stub } = sinon;
const { resetBridge } = require('../../../../services/homekit/lib/resetBridge');
const { EVENTS } = require('../../../../utils/constants');

describe('Reset bridge', () => {
  it('should reset a bridge', async () => {
    const destroyFn = stub().resolves();
    const homekitHandler = {
      resetBridge,
      createBridge: stub().resolves(),
      gladys: {
        event: {
          removeListener: stub().returns(),
        },
      },
      notifyCb: stub().returns(),
      bridge: {
        destroy: destroyFn,
      },
    };

    await homekitHandler.resetBridge();

    expect(homekitHandler.gladys.event.removeListener.args[0][0]).eq(EVENTS.TRIGGERS.CHECK);
    expect(homekitHandler.notifyCb).to.eq(null);

    expect(destroyFn.callCount).to.eq(1);
    expect(homekitHandler.bridge).to.eq(null);
    expect(homekitHandler.createBridge.callCount).to.eq(1);
  });

  it('should cancel the momentary scene switches still waiting to turn off before rebuilding', async () => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const resetOn = stub();
    const homekitHandler = {
      resetBridge,
      createBridge: stub().resolves(),
      gladys: {
        event: {
          removeListener: stub().returns(),
        },
      },
      notifyCb: null,
      bridge: null,
      sceneSwitchTimeouts: new Map([['movie-night', setTimeout(resetOn, 1000)]]),
    };

    try {
      await homekitHandler.resetBridge();
      clock.tick(1000);
    } finally {
      clock.restore();
    }

    expect(resetOn.callCount).to.equal(0);
    expect(homekitHandler.sceneSwitchTimeouts.size).to.equal(0);
    expect(homekitHandler.createBridge.callCount).to.equal(1);
  });
});
