var q = require('q'),
  Isy = require('../index'),
  IsyDevice = require('./IsyDevice');

var ZWaveDevice = function () {
  var self = this;

  IsyDevice.apply(this, arguments);

  self.config.address = self.config.address.split('_').slice(0, 1).join('_');

  self.on('state-change', function (msg) {
    self.config.properties.ST.value = msg.action._;
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
ZWaveDevice.prototype.on_command = function () {
  var self = this,
    defer = q.defer();

  self.DON(self.config.address + '_1')
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: true}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
ZWaveDevice.prototype.off_command = function () {
  var self = this,
    defer = q.defer();

  self.DOF(self.config.address + '_1')
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: false}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
ZWaveDevice.prototype.status_command = function () {
  var self = this,
    defer = q.defer();

  self.STATUS(self.config.address + '_1').then(function (result) {
      defer.resolve({_on: parseInt(result.properties.ST.value, 10)  > 0});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

module.exports = ZWaveDevice;
