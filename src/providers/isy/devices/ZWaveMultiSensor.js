var q = require('q'),
  Isy = require('../index'),
  logger = require('log4js'),
  log = logger.getLogger('isy'),
  ZWaveDevice = require('./ZWaveDevice');

var ZWaveMultiSensor = function () {
  var self = this;

  ZWaveDevice.apply(this, arguments);
  self.capabilities = ['motion_sensor'];

  self.on('state-change', function (msg) {
    var group = msg.node.split('_')[1];
    self.last_seen = new Date();

    switch (group) {
      default:
        break;
    }
  });

  self.on('device-on', function (msg) {
    self.last_seen = new Date();
    if (self._motion !== true) {
      self.last_off = self.last_seen;
    }
    self._motion = true;
    self.emit('changed');
  });

  self.on('device-off', function (msg) {
    self.last_seen = new Date();
    if (self._motion === true) {
      self.last_on = self.last_seen;
    }
    self._motion = false;
    self.emit('changed');
  });
  self.on('changed', function (msg) {

    if (!msg || !msg.control) {
      return;
    }
    switch(msg.control) {
      case 'CLITEMP':
        if (self.capabilities.indexOf('temperature_sensor') === -1) {
          self.capabilities.push('temperature_sensor');
        }
        if (msg.action.$.uom === '17') {
          var value = msg.action._.split('');
          value.splice(msg.action._.length - 2, 0, '.');
          self._temperature = parseFloat(value.join(''));
        } else {
          log.warn('Unknown temperature UOM');
        }
        break;
      case 'CLIHUM':
        if (self.capabilities.indexOf('humidity_sensor') === -1) {
          self.capabilities.push('humidity_sensor');
        }
        if (msg.action.$.uom === '22') {
        self._humidity = parseInt(msg.action._, 10);
        } else {
          log.warn('Unknown humidity UOM');
        }
        break;
      case 'UV':
        if (self.capabilities.indexOf('uv_sensor') === -1) {
          self.capabilities.push('uv_sensor');
        }
        if (msg.action.$.uom === '71') {
          var value = msg.action._.split('');
          value.splice(msg.action._.length - 2, 0, '.');
          self._uv = parseFloat(value.join(''));
        } else {
          log.warn('Unknown uv UOM');
        }
        break;
      case 'BATLVL':
        if (self.capabilities.indexOf('battery_sensor') === -1) {
          self.capabilities.push('battery_sensor');
        }
        if (msg.action.$.uom === '51') {
          self._battery = parseInt(msg.action._, 10);
        } else {
          log.warn('Unknown uv UOM');
        }
        break;
      case 'LUMIN':
        if (self.capabilities.indexOf('light_sensor') === -1) {
          self.capabilities.push('light_sensor');
        }
        if (msg.action.$.uom === '36') {
          var value = msg.action._.split('');
          value.splice(msg.action._.length - 2, 0, '.');
          self._lumens = parseFloat(value.join(''));
        } else {
          log.warn('Unknown humidity UOM');
        }
        break;
      case 'ERR': //Error
        break;
      default:
        log.warn('Unknown control received for %s: %s', self.name, msg.control);
        break;
    }
  });
  self.on('update', function (msg) {
    var group = msg.address.split('_')[1];
    self.last_seen = new Date();

    if (msg.properties && msg.properties.ST && msg.properties.ST.value !== " ") {
      switch (group) {
        case '1':
          if (self._motion !== (parseInt(msg.properties.ST, 10) > 0) && self._motion) {
            self.last_off = self.last_seen;
          } else if (self._motion !== (parseInt(msg.properties.ST, 10) > 0) && !self._motion) {
            self.last_on = self.last_seen;
          }
          self._motion = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        case '104': // Motion?:
          self._motion = ((parseInt(msg.properties.ST.value, 10)) / 255 * 100);
          break;
        case '155': // Motion:
          if (self._motion !== (parseInt(msg.properties.ST, 10) > 0) && self._motion) {
            self.last_off = self.last_seen;
          } else if (self._motion !== (parseInt(msg.properties.ST, 10) > 0) && !self._motion) {
            self.last_on = self.last_seen;
          }
          self._motion = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        case '157': //Tamper Alarm
          break;
        default:
          break;
      }
    }
  });
};
Object.assign(ZWaveMultiSensor, ZWaveDevice);
Object.assign(ZWaveMultiSensor.prototype, ZWaveDevice.prototype);
ZWaveMultiSensor.prototype.build_state = function () {
  return {
    '_motion': this._motion,
    '_lumens': this._lumens,
    '_battery': this._battery,
    '_uv': this._uv,
    '_temperature': this._temperature,
    '_humidity': this._humidity,
    'low_battery': this.low_battery,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};

module.exports = ZWaveMultiSensor;
