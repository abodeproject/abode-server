var q = require('q'),
  Isy = require('../index'),
  ZWaveDevice = require('./ZWaveDevice');

var ZWaveDimmer = function () {

  Isy.ZWaveDevice.apply(this, arguments);
};
Object.assign(ZWaveDimmer, ZWaveDevice);
Object.assign(ZWaveDimmer.prototype, ZWaveDevice.prototype);
ZWaveDimmer.prototype.capabilities = ['light', 'dimmer'];

module.exports = ZWaveDimmer;
