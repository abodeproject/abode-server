var q = require('q'),
  Isy = require('../index'),
  InsteonDevice = require('./InsteonDevice');

var InsteonIO = function () {
  var self = this;

  InsteonDevice.apply(this, arguments);
  self.capabilities = ['light', 'onoff'];

  self.on('state-change', function (msg) {
    var group = msg.node.split(' ')[3];
    self.last_seen = new Date();

    switch (group) {
      case '1': //Sensor
        if (self._on !== (parseInt(msg.action, 10) > 0) && self._on) {
          self.last_off = self.last_seen;
        } else if (self._on !== (parseInt(msg.action, 10) > 0) && !self._on) {
          self.last_on = self.last_seen;
        }
        self._on = (parseInt(msg.action, 10) > 0);
        break;
      case '2': //Relay
        break
      default:
        break;
    }
  });

  self.on('update', function (msg) {
    var group = msg.address.split(' ')[3];
    self.last_seen = new Date();

    if (msg.properties.ST) {
      switch (group) {
        case '1': //Sensor
          if (self._on !== (parseInt(msg.properties.ST.value, 10) > 0) && self._on) {
            self.last_off = self.last_seen;
          } else if (self._on !== (parseInt(msg.properties.ST.value, 10) > 0) && !self._on) {
            self.last_on = self.last_seen;
          }
          self._on = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        case '2': //Relay
        default:
          break;
      }
    }
  });
};
Object.assign(InsteonIO, InsteonDevice);
Object.assign(InsteonIO.prototype, InsteonDevice.prototype);
InsteonIO.prototype.build_state = function () {
  return {
    '_on': this._on,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};
InsteonIO.prototype.on_command = function () {
  var self = this,
    defer = q.defer();

  self.DON(self.config.address + ' 2')
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: true}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
InsteonIO.prototype.off_command = function () {
  var self = this,
    defer = q.defer();

  self.DOF(self.config.address + ' 2')
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: false}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

module.exports = InsteonIO;
