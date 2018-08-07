var q = require('q'),
  Isy = require('../index'),
  logger = require('log4js'),
  log = logger.getLogger('isy'),
  ZWaveDevice = require('./ZWaveDevice');

var alarms = {
  '1': 'Master Code Changed',
  '2': 'Tamper Code Entry Limit',
  '3': 'Escutcheon Removed',
  '4': 'Key/Manually Locked',
  '5': 'Locked by Touch',
  '6': 'Key/Manually Unlocked',
  '7': 'Remote Locking Jammed Bolt',
  '8': 'Remotely Locked',
  '9': 'Remotely Unlocked',
  '10': 'Deadbolt Jammed',
  '11': 'Battery Too Low to Operate',
  '12': 'Critical Low Battery',
  '13': 'Low Battery',
  '14': 'Automatically Locked',
  '15': 'Automatic Locking Jammed Bolt',
  '16': 'Remotely Power Cycled',
  '17': 'Lock Handling Completed',
  '19': 'User Deleted',
  '20': 'User Added',
  '21': 'Duplicate PIN',
  '22': 'Jammed Bolt by Locking with Keypad',
  '23': 'Locked by Keypad',
  '24': 'Unlocked by Keypad',
  '25': 'Keypad Attempt outside Schedule',
  '26': 'Hardware Failure',
  '27': 'Factory Reset'
};
var ZWaveLock = function () {
  var self = this;

  ZWaveDevice.apply(this, arguments);
  self.capabilities = ['lock'];

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
          self._alerts = [{'message': alarms[alarm], 'date': new Date()}];
        } else {
          log.warn('Unknown alarm code recieved for %s: %s', self.name, alarm);
        }
        break;
      case 'USRNUM':
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
    'last_seen': this.last_seen
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

module.exports = ZWaveLock;
