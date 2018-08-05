var q = require('q'),
  Isy = require('../index'),
  IsyDevice = require('./IsyDevice');

var ZWaveDevice = function () {
  var self = this;

  IsyDevice.apply(this, arguments);

  self.config.address = self.config.address.split('_').slice(0, 1).join('_');

  self.on('state-change', function (msg) {
    self.config.properties.ST.value = msg.action;
  });

  self.on('update', function (msg) {
    if (self.config.addresses.indexOf(msg.address) === -1) {
      self.config.addresses.push(msg.address);
    }
  });
};
Object.assign(ZWaveDevice, IsyDevice);
Object.assign(ZWaveDevice.prototype, IsyDevice.prototype);
ZWaveDevice.find = function (address) {
  var matches = IsyDevice.devices.filter(function (device) {
    return (address.split('_').slice(0, 1).join('_') === device.config.address);
  });

  if (matches.length > 0) {
    return matches[0];
  }
};

module.exports = ZWaveDevice;
