var q = require('q'),
  Isy = require('../index'),
  logger = require('log4js'),
  log = logger.getLogger('isy'),
  ZWaveDevice = require('./ZWaveDevice');

var ZWaveOnOff = function () {
  var self = this;

  ZWaveDevice.apply(this, arguments);
  self.capabilities = ['appliance', 'onoff'];

  self.on('state-change', function (msg) {
    var group = msg.node.split('_')[1];
    self.last_seen = new Date();

    switch (group) {
      case '1':
        self._on = parseInt(msg.action._, 10) > 0;
        break;
      case '119':
        break;
      case '143':
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
      case 'TPW':
        if (msg.action.$.uom === '33') {
          var value = msg.action._.split('');
          value.splice(msg.action._.length - 2, 0, '.');
          self._power = parseFloat(value.join(''));
        } else {
          log.warn('Unknown uv UOM');
        }
        break;
      case 'CC': // Current Current
        break;
      case 'CV': //Current Voltage
        break;
      case 'ERR': //Error
        break;
      default:
        log.warn('Unknown control received for %s: %s', self.name, msg.control);
        break;
    }
  });
};
Object.assign(ZWaveOnOff, ZWaveDevice);
Object.assign(ZWaveOnOff.prototype, ZWaveDevice.prototype);
ZWaveOnOff.prototype.capabilities = ['appliance', 'onoff'];

module.exports = ZWaveOnOff;
