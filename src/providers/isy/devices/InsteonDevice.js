var q = require('q'),
  Isy = require('../index'),
  IsyDevice = require('./IsyDevice');

var InsteonDevice = function (config) {
  var self = this;

  IsyDevice.apply(this, arguments);

  self.config.address = self.config.address.split(' ').slice(0, 3).join(' ');

  var abode_device = InsteonDevice.find(self.config.address);
  if (abode_device) {
    Object.assign(self, abode_device);
  }

  self.on('state-change', function (msg) {
    var value = (msg.action && msg.action._) ? msg.action._ : msg.action;
    self.config.properties.ST.value = value;
  });

  self.on('update', function (msg) {
    if (self.config.addresses.indexOf(msg.address) === -1){
      self.config.addresses.push(msg.address);
    }
  });
};
Object.assign(InsteonDevice, IsyDevice);
Object.assign(InsteonDevice.prototype, IsyDevice.prototype);
InsteonDevice.find = function (address) {
  var matches = IsyDevice.devices.filter(function (device) {
    return (address.split(' ').slice(0, 3).join(' ') === device.config.address);
  });

  if (matches.length > 0) {
    return matches[0];
  }
};
InsteonDevice.prototype.on_command = function () {
  var self = this,
    defer = q.defer();

  self.DON(self.config.address + ' 1')
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: true}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
InsteonDevice.prototype.off_command = function () {
  var self = this,
    defer = q.defer();

  self.DOF(self.config.address + ' 1')
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: false}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
InsteonDevice.prototype.status_command = function () {
  var self = this,
    defer = q.defer();

  self.query_command().then(function () {
    self.STATUS(self.config.address + ' 1').then(function (result) {
        defer.resolve({_on: parseInt(result.properties.ST.value, 10)  > 0});
      })
      .fail(function (err) {
        defer.reject(err);
      });
  }).fail(function (err) {
    defer.reject(err);
  });

  return defer.promise;
};
InsteonDevice.prototype.query_command = function () {
  var self = this,
    defer = q.defer();

  self.QUERY(self.config.address + ' 1').then(function () {
      defer.resolve();
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

module.exports = InsteonDevice;

