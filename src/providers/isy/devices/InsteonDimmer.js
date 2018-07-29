var q = require('q'),
  Isy = require('../index'),
  InsteonDevice = require('./InsteonDevice');

var InsteonDimmer = function (config) {
  var self = this;

  InsteonDevice.apply(this, arguments);
  self.capabilities = ['light', 'dimmer'];

  self.on('state-change', function (msg) {
    var group = msg.node.split(' ')[3];
    self.last_seen = new Date();

    switch (group) {
      case '1':
        if (self._on !== (parseInt(msg.action, 10) > 0) && self._on) {
          self.last_off = self.last_seen;
        } else if (self._on !== (parseInt(msg.action, 10) > 0) && !self._on) {
          self.last_on = self.last_seen;
        }
        self._level = Math.round((parseInt(msg.action, 10) / 255) * 100);
        self._on = (self._level > 0);
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
          self._level = Math.round((parseInt(msg.properties.ST.value, 10) / 255) * 100);
          self._on = (self._level > 0);
          break;
        default:
          break;
      }
    }
  });

};
Object.assign(InsteonDimmer, InsteonDevice);
Object.assign(InsteonDimmer.prototype, InsteonDevice.prototype);
InsteonDimmer.prototype.build_state = function () {
  return {
    '_on': this._on,
    '_level': this._level,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};
InsteonDimmer.prototype.on_command = function (level) {
  var self = this,
    defer = q.defer();

  self.DON(self.config.address + ' 1', level)
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: true, _level: level || 100}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
InsteonDimmer.prototype.off_command = function () {
  var self = this,
    defer = q.defer();

  self.DOF(self.config.address + ' 1')
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: false, _level: 0}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
InsteonDevice.prototype.status_command = function () {
  var self = this,
    defer = q.defer();

  self.STATUS(self.config.address + ' 1').then(function (result) {
      defer.resolve({_on: parseInt(result.properties.ST.value, 10)  > 0, _level: Math.round((parseInt(result.properties.ST.value, 10)/ 255) * 100)});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

module.exports = InsteonDimmer;
