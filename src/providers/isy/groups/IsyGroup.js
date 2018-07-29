var q = require('q'),
  Isy = require('../index'),
  logger = require('log4js'),
  log = logger.getLogger('isy'),
  abode = require('../../../abode'),
  EventEmitter = require('events');

var IsyGroup = function (config) {
  var self = this;
  IsyGroup.groups.push(self);

  self.config = config;
  self.name = config.name;

  self.on('update', function (msg) {

    if (msg.properties && msg.properties.BATLVL) {
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

  log.debug('Added group:', self.name);
};
IsyGroup.groups = [];

Object.assign(IsyGroup.prototype, EventEmitter.prototype);
IsyGroup.prototype.capabilities = ['scene', 'onoff'];
IsyGroup.find = function (address) {
  var matches = IsyGroup.groups.filter(function (group) {
    return (group.config.address === address);
  });

  if (matches.length > 0) {
    return matches[0];
  }
};
IsyGroup.prototype.build_state = function () { return {'_on': this._on}; };
IsyGroup.prototype.get_abode_device = function () {
  var self = this;

  var matches = abode.devices.get_by_provider('isy').filter(function (device) {
    return (device.config.address === self.config.address);
  });

  if (matches.length > 0) {
    return matches[0];
  }
};
IsyGroup.prototype.update = function () {
  var abode_device = this.get_abode_device();

  if (abode_device) {
    var state = this.build_state();
    log.debug('Updating group: ', this.name, state);
    abode_device.set_state(state);
  } else {
    log.debug('Group updated but not linked to an Abode device: ', this.name);
  }

};
IsyGroup.prototype.DON = function (address, level) {
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
IsyGroup.prototype.DOF = function (address) {
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
IsyGroup.prototype.STATUS = function (address) {
  var defer = q.defer();

  Isy.req('/rest/nodes/' + address)
    .then(function (result) {
      var parsed = Isy.parseGroup(result.nodeInfo.group[0]);
      defer.resolve(parsed);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
IsyGroup.prototype.on_command = function () {
  var self = this,
    defer = q.defer();

  self.DON(self.config.address)
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: true}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
IsyGroup.prototype.off_command = function () {
  var self = this,
    defer = q.defer();

  self.DOF(self.config.address)
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: false}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
IsyGroup.prototype.status_command = function () {
  var self = this,
    defer = q.defer();

  self.STATUS(self.config.address).then(function () {
      defer.resolve({});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

module.exports = IsyGroup;
