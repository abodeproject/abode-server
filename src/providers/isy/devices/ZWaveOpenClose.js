var q = require('q'),
  Isy = require('../index'),
  logger = require('log4js'),
  log = logger.getLogger('isy'),
  ZWaveDevice = require('./ZWaveDevice');

var ZWaveOpenClose = function () {
  var self = this;

  ZWaveDevice.apply(this, arguments);
  self.capabilities = ['openclose', 'door', 'window'];

  self.on('state-change', function (msg) {
    var group = msg.node.split('_')[1];
    self.last_seen = new Date();

    console.log(group, msg);
    switch (group) {
      case '104':
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
      case 'ERR': //Error
        break;
      default:
        log.warn('Unknown control received for %s: %s', self.name, msg.control);
        break;
    }
  });
};
Object.assign(ZWaveOpenClose, ZWaveDevice);
Object.assign(ZWaveOpenClose.prototype, ZWaveDevice.prototype);
ZWaveOpenClose.prototype.build_state = function () {
  return {
    '_on': this._on,
    '_battery': this._battery,
    '_alerts': this._alerts,
    'last_off': this.last_off,
    'last_on': this.last_on,
    'last_seen': this.last_seen
  };
};

module.exports = ZWaveOpenClose;
