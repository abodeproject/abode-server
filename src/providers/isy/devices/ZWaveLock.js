var q = require('q'),
  Isy = require('../index'),
  logger = require('log4js'),
  log = logger.getLogger('isy'),
  ZWaveDevice = require('./ZWaveDevice');

var alarms = {
  '1': {'message': 'Master Code Changed', 'icon': 'icon-password', 'type': 'info'},
  '2': {'message': 'Tamper Code Entry Limit', 'icon': 'icon-password', 'type': 'danger'},
  '3': {'message': 'Escutcheon Removed', 'icon': 'icon-warning-sign', 'type': 'warn'},
  '4': {'message': 'Key/Manually Locked', 'icon': 'icon-lock', 'type': 'info'},
  '5': {'message': 'Locked by Touch', 'icon': 'icon-lock', 'type': 'info'},
  '6': {'message': 'Key/Manually Unlocked', 'icon': 'icon-unlock', 'type': 'info'},
  '7': {'message': 'Remote Locking Jammed Bolt', 'icon': 'icon-lock', 'type': 'danger'},
  '8': {'message': 'Remotely Locked', 'icon': 'icon-lock', 'type': 'info'},
  '9': {'message': 'Remotely Unlocked', 'icon': 'icon-unlock', 'type': 'info'},
  '10': {'message': 'Deadbolt Jammed', 'icon': 'icon-warning-sign', 'type': 'danger'},
  '11': {'message': 'Battery Too Low to Operate', 'icon': 'icon-batteryempty', 'type': 'danger'},
  '12': {'message': 'Critical Low Battery', 'icon': 'icon-batteryempty', 'type': 'danger'},
  '13': {'message': 'Low Battery', 'icon': 'icon-batteryempty', 'type': 'warn'},
  '14': {'message': 'Automatically Locked', 'icon': 'icon-lock', 'type': 'info'},
  '15': {'message': 'Automatic Locking Jammed Bolt', 'icon': '', 'type': 'danger'},
  '16': {'message': 'Remotely Power Cycled', 'icon': 'icon-warning-sign', 'type': 'warn'},
  '17': {'message': 'Lock Handling Completed', 'icon': 'icon-warning-sign', 'type': 'info'},
  '19': {'message': 'User Deleted', 'icon': 'icon-removeuseralt', 'type': 'info'},
  '20': {'message': 'User Added', 'icon': 'icon-adduseralt', 'type': 'info'},
  '21': {'message': 'Duplicate PIN', 'icon': 'icon-password', 'type': 'warn'},
  '22': {'message': 'Jammed Bolt by Locking with Keypad', 'icon': '', 'type': 'danger'},
  '23': {'message': 'Locked by Keypad', 'icon': 'icon-lock', 'type': 'info'},
  '24': {'message': 'Unlocked by Keypad', 'icon': 'icon-lock', 'type': 'info'},
  '25': {'message': 'Keypad Attempt outside Schedule', 'icon': 'icon-warning-sign', 'type': 'danger'},
  '26': {'message': 'Hardware Failure', 'icon': 'icon-warning-sign', 'type': 'danger'},
  '27': {'message': 'Factory Reset', 'icon': 'icon-warning-sign', 'type': 'warn'}
};
var ZWaveLock = function () {
  var self = this;

  ZWaveDevice.apply(this, arguments);
  self.capabilities = ['lock'];

  self.on('update', function (msg) {
      //console.log(msg);
  });

  self.on('state-change', function (msg) {
    var group = msg.node.split('_')[1];
    self.last_seen = new Date();

    switch (group) {
      case '1':
        if (self._on !== (parseInt(msg.action._, 10) > 0) && self._on) {
          self.last_off = self.last_seen;
        } else if (self._on !== (parseInt(msg.action._, 10) > 0) && !self._on) {
          self.last_on = self.last_seen;
        }
        self._on = parseInt(msg.action._, 10) > 0;
        break;
      default:
        log.warn('Unsupported sub device for %s: %s', self.name,group);
        break;
    }
  });

  self.on('device-on', function (msg) {
    self._on = true;
    self.emit('changed');
  });

  self.on('device-off', function (msg) {
    self._on = false;
    self.emit('changed');
  });
  self.on('changed', function (msg) {

    if (!msg || !msg.control) {
      return;
    }
    switch (msg.control) {
      case 'BATLVL':
        if (self.capabilities.indexOf('battery_sensor') === -1) {
          self.capabilities.push('battery_sensor');
        }
        if (msg.action.$.uom === '51') {
          self._battery = parseInt(msg.action._, 10);
          self.low_battery = (self._battery < 33);
        } else {
          log.warn('Unknown batl UOM');
        }
        break;
      case 'ALARM':
        var alarm = msg.action._;
        if (alarms[alarm]) {
          if (self._alerts && self._alerts[0] && self._alerts[0].message === alarms[alarm].message) {
            break;
          }
          self._alerts = self._alerts || [];
          alarm = Object.assign({}, alarms[alarm]);
          alarm.date = new Date();
          self._alerts.unshift(alarm);

          if (self._alerts.length > 100) {
            self._alerts.splice(100, self._alerts.length - 100);
          }
        } else {
          log.warn('Unknown alarm code recieved for %s: %s', self.name, alarm);
        }
        break;
      case 'USRNUM':
        if (self.capabilities.indexOf('user_codes') === -1) {
          self.capabilities.push('user_codes');
        }
        self.config.user_codes = parseInt(msg.action._, 10);
        break;
      case 'ERR':
        log.error(msg);
        break;
      default:
        log.warn('Unknown control received for %s: %s', self.name, msg.control);
        break;
    }
  });
};
Object.assign(ZWaveLock, ZWaveDevice);
Object.assign(ZWaveLock.prototype, ZWaveDevice.prototype);
ZWaveLock.prototype.build_state = function () {
  return {
    '_on': this._on,
    '_battery': this._battery,
    '_alerts': this._alerts,
    'last_off': this.last_off,
    'last_on': this.last_on,
    'last_seen': this.last_seen,
    'config': this.config
  };
};
ZWaveLock.prototype.on_command = function () {
  var self = this,
    defer = q.defer();

  self.SECMD(self.config.address + '_1', 1)
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: true}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
ZWaveLock.prototype.off_command = function () {
  var self = this,
    defer = q.defer();

  self.SECMD(self.config.address + '_1', 0)
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: false}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
ZWaveLock.prototype.set_code = function (user, code) {
  var self = this,
    defer = q.defer();

  Isy.req('/rest/zwave/node/' + self.config.address + '_1/security/user/' + user + '/set/code/' + code)
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

ZWaveLock.prototype.delete_code = function (user) {
  var self = this,
    defer = q.defer();

  Isy.req('/rest/zwave/node/' + self.config.address + '_1/security/user/' + user + '/delete')
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

module.exports = ZWaveLock;
