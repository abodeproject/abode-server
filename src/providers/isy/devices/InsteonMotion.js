var q = require('q'),
  Isy = require('../index'),
  InsteonDevice = require('./InsteonDevice');

var InsteonMotion = function () {
  var self = this;

  InsteonDevice.apply(this, arguments);
  self.capabilities = ['motion_sensor', 'battery_sensor'];

  self.on('state-change', function (msg) {
    var group = msg.node.split(' ')[3];
    self.last_seen = new Date();

    switch (group) {
      case '1':
        if (self._motion !== (parseInt(msg.action, 10) > 0) && self._motion) {
          self.last_off = self.last_seen;
        } else if (self._motion !== (parseInt(msg.action, 10) > 0) && !self._motion) {
          self.last_on = self.last_seen;
        }
        self._motion = (parseInt(msg.action, 10) > 0);
        break;
      case '2':
        self._lumens = (parseInt(msg.action, 10) / 255);
        break;
      case '3':
        self.low_battery = (parseInt(msg.actione, 10) > 0);
        self._battery = (parseInt(msg.action, 10) === 0);
        break;
      default:
        break;
    }
  });

  self.on('update', function (msg) {
    var group = msg.address.split(' ')[3];
    self.last_seen = new Date();

    if (msg.properties.ST && msg.properties.ST.value !== " ") {
      switch (group) {
        case '1':
          if (self._motion !== (parseInt(msg.properties.ST, 10) > 0) && self._motion) {
            self.last_off = self.last_seen;
          } else if (self._motion !== (parseInt(msg.properties.ST, 10) > 0) && !self._motion) {
            self.last_on = self.last_seen;
          }
          self._motion = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        case '2':
          self._lumens = ((parseInt(msg.properties.ST.value, 10)) / 255 * 100);
          break;
        case '3':
          self.low_battery = (parseInt(msg.properties.ST.value, 10) > 0);
          self._battery = (parseInt(msg.properties.ST.value, 10) === 0);
          break;
        default:
          break;
      }
    }
  });
};
Object.assign(InsteonMotion, InsteonDevice);
Object.assign(InsteonMotion.prototype, InsteonDevice.prototype);
InsteonMotion.prototype.build_state = function () {
  return {
    '_motion': this._motion,
    '_lumens': this._lumens,
    '_battery': this._battery,
    'low_battery': this.low_battery,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};
InsteonMotion.prototype.on_command = function () {
  var defer = q.defer();

  defer.resolve({'response': true, 'update': {_motion: true}});

  return defer.promise;
};
InsteonMotion.prototype.off_command = function () {
  var defer = q.defer();

  defer.resolve({'response': true, 'update': {_motion: false}});

  return defer.promise;
};
InsteonMotion.prototype.status_command = function () {
  var self = this,
    defer = q.defer();

  self.STATUS(self.config.address + ' 1').then(function (result) {
      defer.resolve({_motion: parseInt(result.properties.ST.value, 10)  > 0});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

module.exports = InsteonMotion;
