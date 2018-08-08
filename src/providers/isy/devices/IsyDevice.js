var q = require('q'),
  Isy = require('../index'),
  logger = require('log4js'),
  log = logger.getLogger('isy'),
  abode = require('../../../abode'),
  EventEmitter = require('events');

var IsyDevice = function (config) {
  var self = this;
  IsyDevice.devices.push(self);

  self.config = config;
  self.name = config.name;
  self.update_timer;

  self.config.addresses = [];
  self.config.addresses.push(self.config.address);

  self.on('update', function (msg) {

    if (msg.properties && msg.properties.BATLVL && msg.properties.BATLVL.value) {
      self._battery = parseInt(msg.properties.BATLVL.value, 10);
    }

    if (msg.properties && msg.properties.CLIHUM) {
      self._humidity = parseInt(msg.properties.CLIHUM.value, 10);
    }

    if (msg.properties && msg.properties.CLITEMP) {
      self._temp = parseInt(msg.properties.CLITEMP.value, 10);
    }

    if (msg.properties && msg.properties.LUMIN) {
      self._lumens = parseInt(msg.properties.LUMIN.value, 10);
    }

    if (msg.properties && msg.properties.UV) {
      self._uv = parseInt(msg.properties.UV.value, 10);
    }

    if (msg.properties && msg.properties.OL) {
      self.config.on_level = parseInt(msg.properties.OL.value, 10);
    }

    if (msg.properties && msg.properties.RR) {
      self.config.ramp_rate = parseInt(msg.properties.RR.value, 10);
    }

    self.emit('changed');
  });

  self.on('state-change', function () {
    self.emit('changed');
  });

  self.on('device-on', function () {
    self.emit('changed');
  });

  self.on('device-off', function () {
    self.emit('changed');
  });

  self.on('changed', function () {
    if (self.update_timer) {
      clearTimeout(self.update_timer);
    }

    self.update_timer = setTimeout(function () {
      self.update();
    }, 1000);
  });

  log.debug('Added device:', self.name);
};
IsyDevice.devices = [];
Object.assign(IsyDevice.prototype, EventEmitter.prototype);
IsyDevice.find = function (address) {
  var matches = IsyDevice.devices.filter(function (device) {
    return (device.config.addresses.indexOf(address) !== -1 || device.config.address === address);
  });

  if (matches.length > 0) {
    return matches[0];
  }
};
IsyDevice.prototype.build_state = function () { return {}; };
IsyDevice.prototype.get_abode_device = function () {
  var self = this;

  var matches = abode.devices.get_by_provider('isy').filter(function (device) {
    return (device.config.address === self.config.address);
  })

  if (matches.length > 0) {
    return matches[0];
  }
};
IsyDevice.prototype.update = function () {
  var abode_device = this.get_abode_device();

  if (abode_device) {
    var state = this.build_state();
    state.last_seen = new Date();
    log.debug('Updating device: ', this.name, state);
    abode_device.set_state(state);
  } else {
    log.debug('Device updated but not linked to an Abode device: ', this.name);
  }

};
IsyDevice.prototype.DON = function (address, level) {
  var defer = q.defer(),
    url = (level) ? '/rest/nodes/' + address + '/cmd/DON/' + ((level / 100) * 255) : '/rest/nodes/' + address + '/cmd/DON';

  Isy.req(url)
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
IsyDevice.prototype.DOF = function (address) {
  var defer = q.defer();

  Isy.req('/rest/nodes/' + address + '/cmd/DOF')
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
IsyDevice.prototype.SECMD = function (address, state) {
  var defer = q.defer();

  Isy.req('/rest/nodes/' + address + '/cmd/SECMD/' + state)
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
IsyDevice.prototype.STATUS = function (address) {
  var defer = q.defer();

  Isy.req('/rest/nodes/' + address)
    .then(function (result) {
      var parsed = Isy.parseDevice(result.nodeInfo.node[0], result.nodeInfo.properties[0]);
      defer.resolve(parsed);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

module.exports = IsyDevice;
