var q = require('q'),
  Isy = require('../index'),
  ZWaveDevice = require('./ZWaveDevice');

var ZWaveOnOff = function () {

  ZWaveDevice.apply(this, arguments);
};
Object.assign(ZWaveOnOff, ZWaveDevice);
Object.assign(ZWaveOnOff.prototype, ZWaveDevice.prototype);
ZWaveOnOff.prototype.capabilities = ['appliance', 'onoff'];

module.exports = ZWaveOnOff;
