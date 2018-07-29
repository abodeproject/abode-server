var q = require('q'),
  Isy = require('../index');

var ZWaveDevice = function () {};
Object.assign(ZWaveDevice, Isy.IsyDevice);
Object.assign(ZWaveDevice.prototype, Isy.IsyDevice.prototype);

module.exports = ZWaveDevice;
