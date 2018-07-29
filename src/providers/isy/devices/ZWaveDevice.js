var q = require('q'),
  Isy = require('../index'),
  IsyDevice = require('./IsyDevice');

var ZWaveDevice = function () {};
Object.assign(ZWaveDevice, IsyDevice);
Object.assign(ZWaveDevice.prototype, IsyDevice.prototype);

module.exports = ZWaveDevice;
