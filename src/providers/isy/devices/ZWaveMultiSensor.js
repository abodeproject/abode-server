var q = require('q'),
  Isy = require('../index'),
  ZWaveDevice = require('./ZWaveDevice');

var ZWaveMultiSensor = function () {

  ZWaveDevice.apply(this, arguments);
};
Object.assign(ZWaveMultiSensor, ZWaveDevice);
Object.assign(ZWaveMultiSensor.prototype, ZWaveDevice.prototype);
ZWaveMultiSensor.prototype.capabilities = ['sensor'];

module.exports = ZWaveMultiSensor;
