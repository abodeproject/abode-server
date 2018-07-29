var q = require('q'),
  Isy = require('../index'),
  ZWaveDevice = require('./ZWaveDevice');

var ZWaveTemperature = function () {

  Isy.ZWaveDevice.apply(this, arguments);
};
Object.assign(ZWaveTemperature, ZWaveDevice);
Object.assign(ZWaveTemperature.prototype, ZWaveDevice.prototype);
ZWaveTemperature.prototype.capabilities = ['temperaturesensor'];

module.exports = ZWaveTemperature;
