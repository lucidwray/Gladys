const sinon = require('sinon').createSandbox();

const { assert, fake } = sinon;
const UsbController = require('../../../services/usb/api/usb.controller');

const ports = [
  {
    path: '/dev/path',
    manufacturer: '/dev/tty.HC-05-DevB',
    productId: '/dev/comPID',
    vendorId: '/dev/comVID',
  },
];

const list = fake.resolves(ports);

const res = {
  json: fake.returns(null),
};

describe('GET /api/v1/service/usb/port', () => {
  it('should configure bridge', async () => {
    const usbController = UsbController({ list });
    const req = {};
    await usbController['get /api/v1/service/usb/port'].controller(req, res);
    assert.calledOnce(list);
    assert.calledOnceWithExactly(res.json, [
      {
        comPath: '/dev/path',
        comName: '/dev/tty.HC-05-DevB',
        comPID: '/dev/comPID',
        comVID: '/dev/comVID',
        comStablePath: null,
      },
    ]);
  });

  it('should expose the stable by-id path when the port has a pnpId', async () => {
    const listWithPnpId = fake.resolves([
      {
        path: '/dev/ttyACM1',
        manufacturer: 'ITead',
        productId: '5740',
        vendorId: '10c4',
        pnpId: 'usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus-if00',
      },
      {
        path: '/dev/ttyUSB0',
        manufacturer: 'FTDI',
        productId: '6001',
        vendorId: '0403',
        pnpId: '',
      },
    ]);
    const resWithPnpId = {
      json: fake.returns(null),
    };
    const usbController = UsbController({ list: listWithPnpId });
    await usbController['get /api/v1/service/usb/port'].controller({}, resWithPnpId);
    assert.calledOnceWithExactly(resWithPnpId.json, [
      {
        comPath: '/dev/ttyACM1',
        comName: 'ITead',
        comPID: '5740',
        comVID: '10c4',
        comStablePath: '/dev/serial/by-id/usb-ITead_Sonoff_Zigbee_3.0_USB_Dongle_Plus-if00',
      },
      {
        comPath: '/dev/ttyUSB0',
        comName: 'FTDI',
        comPID: '6001',
        comVID: '0403',
        comStablePath: null,
      },
    ]);
  });
});
