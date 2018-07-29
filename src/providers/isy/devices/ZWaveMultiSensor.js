var q = require('q'),
  Isy = require('../index'),
  ZWaveDevice = require('./ZWaveDevice');

var ZWaveMultiSensor = function () {

  Isy.ZWaveDevice.apply(this, arguments);
};
Object.assign(ZWaveMultiSensor, ZWaveDevice);
Object.assign(ZWaveMultiSensor.prototype, ZWaveDevice.prototype);
Isy.ZWaveMultiSensor.prototype.capabilities = ['sensor'];

module.exports = ZWaveMultiSensor;
