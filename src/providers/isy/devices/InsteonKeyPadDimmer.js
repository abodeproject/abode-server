var q = require('q'),
  Isy = require('../index'),
  logger = require('log4js'),
  log = logger.getLogger('isy'),
  InsteonDevice = require('./InsteonDevice');

var InsteonKeyPadDimmer = function (config) {
  var self = this;

  InsteonDevice.apply(this, arguments);
  self.capabilities = ['light', 'dimmer'];

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
        self._level = Math.round((parseInt(value, 10) / 255) * 100);
        self._on = (self._level > 0);
        break;
      default:
        log.debug('KeyPad Button Changed for %s: %s %s', self.name, group, (parseInt(msg.action, 10) > 0) ? 'on': 'off');
        var groups = Isy.findGroupsByMember(self.config.address + ' ' + group, 16);
        groups.forEach(function (group) {
          if (parseInt(msg.action, 10) > 0) {
            group.emit('device-on');
          } else {
            group.emit('device-off');
          }
        });
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
Object.assign(InsteonKeyPadDimmer, InsteonDevice);
Object.assign(InsteonKeyPadDimmer.prototype, InsteonDevice.prototype);
InsteonKeyPadDimmer.prototype.build_state = function () {
  return {
    '_on': this._on,
    '_level': this._level,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};
InsteonKeyPadDimmer.prototype.on_command = function (level) {
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
InsteonKeyPadDimmer.prototype.off_command = function () {
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
InsteonKeyPadDimmer.prototype.status_command = function () {
  var self = this,
    defer = q.defer();

  self.query_command().then(function () {
    self.STATUS(self.config.address + ' 1').then(function (result) {
      defer.resolve({
        _on: parseInt(result.properties.ST.value, 10) > 0,
        _level: Math.round((parseInt(result.properties.ST.value, 10) / 255) * 100)
      });
    })
      .fail(function (err) {
        defer.reject(err);
      });
  }).fail(function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

module.exports = InsteonKeyPadDimmer;
