const fs = require('fs');
const sinon = require('sinon').createSandbox();
const { expect } = require('chai');

const { assert } = sinon;
const findUsbPort = require('../../../../services/zigbee2mqtt/lib/findUsbPort');

const usbList = [
  {
    path: '/dev/ttyUSB0',
    pnpId: 'usb-FTDI_FT232R-if00',
  },
  {
    path: '/dev/ttyACM1',
    pnpId: 'usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus-if00',
  },
  {
    path: '/dev/ttyACM2',
  },
];

describe('zigbee2mqtt findUsbPort', () => {
  let realpath;

  beforeEach(() => {
    realpath = sinon.stub(fs.promises, 'realpath');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('should return the port matching the kernel path', async () => {
    const port = await findUsbPort(usbList, '/dev/ttyACM1');
    expect(port).to.deep.equal(usbList[1]);
    assert.notCalled(realpath);
  });

  it('should return the port matching the by-id path through pnpId', async () => {
    const port = await findUsbPort(usbList, '/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus-if00');
    expect(port).to.deep.equal(usbList[1]);
    assert.notCalled(realpath);
  });

  it('should resolve a by-id path that matches no pnpId and return the port at the resolved path', async () => {
    realpath.withArgs('/dev/serial/by-id/usb-Other-if00').resolves('/dev/ttyACM2');
    const port = await findUsbPort(usbList, '/dev/serial/by-id/usb-Other-if00');
    expect(port).to.deep.equal(usbList[2]);
    assert.calledOnceWithExactly(realpath, '/dev/serial/by-id/usb-Other-if00');
  });

  it('should return undefined when the resolved by-id path matches no port', async () => {
    realpath.resolves('/dev/ttyACM9');
    const port = await findUsbPort(usbList, '/dev/serial/by-id/usb-Other-if00');
    expect(port).to.equal(undefined);
    assert.calledOnce(realpath);
  });

  it('should return undefined when realpath throws for a by-id path', async () => {
    const error = new Error('ENOENT: no such file or directory');
    error.code = 'ENOENT';
    realpath.rejects(error);
    const port = await findUsbPort(usbList, '/dev/serial/by-id/usb-Unplugged-if00');
    expect(port).to.equal(undefined);
    assert.calledOnce(realpath);
  });

  it('should return undefined without resolving when the path is not by-id and matches nothing', async () => {
    const port = await findUsbPort(usbList, '/dev/ttyACM9');
    expect(port).to.equal(undefined);
    assert.notCalled(realpath);
  });

  it('should return undefined without looking anything up when the driver path is empty', async () => {
    const port = await findUsbPort(usbList, undefined);
    expect(port).to.equal(undefined);
    assert.notCalled(realpath);
  });
});
