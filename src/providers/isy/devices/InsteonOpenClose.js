var q = require('q'),
  Isy = require('../index'),
  InsteonDevice = require('./InsteonDevice');

var InsteonOpenClose = function () {
  var self = this;

  InsteonDevice.apply(this, arguments);
  self.capabilities = ['openclose', 'battery_sensor'];

  self.on('state-change', function (msg) {
    var group = msg.node.split(' ')[3];
    self.last_seen = new Date();

    switch (group) {
      case '1':
        var value = (msg.action && msg.action._) ? msg.action._ : msg.action;
        if (self._on !== (parseInt(value, 10) > 0) && self._on) {
          self.last_off = self.last_seen;
        } else if (self._on !== (parseInt(value, 10) > 0) && !self._on) {
          self.last_on = self.last_seen;
        }
        self._on = (parseInt(value, 10) > 0);
        break;
      case '3':
        self.low_battery = (parseInt(msg.action, 10) > 0);
        self._battery = (parseInt(msg.action, 10) === 0);
        break;
      default:
        break;
    }
  });

  self.on('update', function (msg) {
    var group = msg.address.split(' ')[3];
    self.last_seen = new Date();

    if (msg.properties.ST) {
      switch (group) {
        case '1':
          if (self._on !== (parseInt(msg.properties.ST.value, 10) > 0) && self._on) {
            self.last_off = self.last_seen;
          } else if (self._on !== (parseInt(msg.properties.ST.value, 10) > 0) && !self._on) {
            self.last_on = self.last_seen;
          }
          self._on = (parseInt(msg.properties.ST.value, 10) > 0);
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
Object.assign(InsteonOpenClose, InsteonDevice);
Object.assign(InsteonOpenClose.prototype, InsteonDevice.prototype);
InsteonOpenClose.prototype.build_state = function () {
  return {
    '_on': this._on,
    '_battery': this._battery,
    'low_battery': this.low_battery,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};
InsteonOpenClose.prototype.status_command = function () {
  var self = this,
    defer = q.defer();

  self.STATUS(self.config.address + ' 1').then(function (result) {
      defer.resolve({_on: parseInt(result.properties.ST.value, 10)  > 0});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
InsteonOpenClose.prototype.on_command = function () {
  var defer = q.defer();

  defer.resolve({'response': true, 'update': {_on: true}});

  return defer.promise;
};
InsteonOpenClose.prototype.off_command = function () {
  var defer = q.defer();

  defer.resolve({'response': true, 'update': {_on: false}});

  return defer.promise;
};

module.exports = InsteonOpenClose;
