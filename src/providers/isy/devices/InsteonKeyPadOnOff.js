var q = require('q'),
  Isy = require('../index'),
  logger = require('log4js'),
  log = logger.getLogger('isy'),
  InsteonDevice = require('./InsteonDevice');

var InsteonKeyPadOnOff = function () {
  var self = this;

  InsteonDevice.apply(this, arguments);
  self.capabilities = ['light', 'onoff'];

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
          self._on = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        default:
          break;
      }
    }
  });
};
Object.assign(InsteonKeyPadOnOff, InsteonDevice);
Object.assign(InsteonKeyPadOnOff.prototype, InsteonDevice.prototype);
InsteonKeyPadOnOff.prototype.build_state = function () {
  return {
    '_on': this._on,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};

module.exports = InsteonKeyPadOnOff;
