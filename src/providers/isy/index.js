'use strict';

var abode,
  routes,
  q = require('q'),
  WebSocket = require('ws'),
  parseString = require('xml2js').parseString,
  logger = require('log4js'),
  request = require('request'),
  log = logger.getLogger('isy'),
  EventEmitter = require('events');

var Isy = function () {
  var defer = q.defer();

  // Get abode
  abode = require('../../abode');

  // Set our routes
  routes = require('./routes');
  abode.web.server.use('/api/isy', routes);

  // Build our config
  abode.config.Isy = abode.config.Isy || {};
  Isy.config = abode.config.isy;
  Isy.config.enabled = (Isy.config.enabled === true);
  Isy.config.username = Isy.config.username || 'admin';
  Isy.config.password = Isy.config.password || 'admin';
  Isy.config.timeout = Isy.config.reconnect_timeout || 60;
  Isy.config.reconnect_timeout = Isy.config.reconnect_timeout || 10;
  Isy.config.message_time = Isy.config.message_time || 2;
  Isy.config.queue_interval = Isy.config.queue_interval || 100;
  Isy.config.poll_interval = Isy.config.poll_interval || 60;

  // Set some defaults
  Isy.connected = false;
  Isy.attempt_reconnect = false;
  Isy.queue = [];
  Isy.devices = [];
  Isy.folders = [];
  Isy.groups = [];

  // If we are enabled, start it up
  if (Isy.config.enabled && Isy.config.server) {

    log.info('Isy provider initialized');
    Isy.start();

  } else {
    log.info('Isy provider not enabled');
    Isy.enabled = false;
  }

  defer.resolve();

  return defer.promise;
};

Isy.start = function () {
  var defer = q.defer();
  var url = 'ws://' + Isy.config.server + '/rest/subscribe';
  var opts = {
    'headers': {
      'Authorization': 'Basic ' + new Buffer(Isy.config.username + ':' + Isy.config.password).toString('base64'),
      'Origin': 'com.universal-devices.websockets.isy'
    }
  };

  Isy.get_nodes()
    .then(function () {
      log.info('Subscribing to event feed:', url);
      Isy.socket = new WebSocket('ws://' + Isy.config.server + '/rest/subscribe', 'ISYSUB', opts);

      Isy.socket.on('open', function open() {
        log.info('Connected to event stream');
        Isy.connected = true;
        Isy.enabled = true;
        Isy.attempt_reconnect = true;
        defer.resolve(true);
      });

      Isy.socket.on('error', function error(error) {
        log.error(error.message, arguments);
      });

      Isy.socket.on('close', function close() {
        if (Isy.attempt_reconnect) {
          log.info('Disconnected.  Reconnecting in %s seconds', Isy.config.reconnect_timeout);
          setTimeout(function () {
            Isy.start();
          }, 1000 * Isy.config.reconnect_timeout);
        } else {
          log.info('Unable to conect');
          defer.reject();
        }

        Isy.connected = false;
      });

      Isy.socket.on('message', Isy.message_handler);

      Isy.poll();
    })
    .fail(function (err) {
      log.error(err);
      defer.reject(err);
    });

  return defer.promise;

};

Isy.stop = function () {
  var defer = q.defer();

  if (!Isy.connected) {
    defer.reject(new Error('Not connected'));
  }

  Isy.attempt_reconnect = false;
  Isy.socket.close(0, 'Stopping subscription');
  defer.resolve();

  return defer.promise;
};

Isy.poll = function () {
  var defer = q.defer();

  if (Isy.polling) {
    defer.reject(new Error('Already polling'));
    return;
  }

  log.info('Polling Devices');
  Isy.polling = new Date();

  var index;

  var next = function () {
    var device = Isy.devices[index];
    index += 1;

    if (!device) {
      log.info('Finished Polling Devices');
      Isy.polling = undefined;
      return defer.resolve();
    }

    Isy.req('/rest/nodes/' + device.config.address)
      .then(function (result) {
        Isy.parseDevice(result.nodeInfo.node[0], result.nodeInfo.properties[0]);
        next();
      })
      .fail(function (err) {
        log.error(err);
        next();
      });
  };

  next();

  return defer.promise;
};

Isy.get_nodes = function () {
  var defer = q.defer();

  Isy.req('/rest/nodes')
    .then(function (results) {
      Isy.folders = Isy.parseFolders(results.nodes.folder);
      Isy.parseDevices(results.nodes.node);
      Isy.parseGroups(results.nodes.group);
      log.info('Finished getting nodes. Folders: %s, Devices: %s, Groups: %s', Isy.folders.length, Isy.devices.length, Isy.groups.length);

      defer.resolve();
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

Isy.lookup = function (type) {
  switch (type) {
    case 'group':
      return Isy.IsyGroup;
    default:
      return Isy.IsyDevice;
  }
};

Isy.parseDevices = function (devices) {
  var objs = {};

  devices.forEach(function (device) {
    Isy.parseDevice(device);
  });

  return objs;
};

Isy.parseDevice = function (node, properties) {
  var parsed = {};
  var device;

  Object.keys(node).forEach(function (key) {
    parsed[key] = (Array.isArray(node[key])) ? node[key][0] : node[key];
  });

  if (parsed.parent) {
    parsed.parent = {
      'address': parsed.parent._,
      'type': parsed.parent.$.type
    };
  }

  if (parsed.$ && parsed.$.flag) {
    parsed.flag = parsed.$.flag;
    delete parsed.$;
  }

  if (parsed.property) {
    parsed.properties = {};
    parsed.properties[parsed.property.$.id] = {
      'id': parsed.property.$.id,
      'value': parsed.property.$.value,
      'formatted': parsed.property.$.formatted,
      'uom': parsed.property.$.uom
    };

    delete parsed.property;
  }

  if (properties) {
    properties.property.forEach(function (property) {
      var item = property.$;
      parsed.properties[item.id] = {
        'id': item.id,
        'value': item.value,
        'formatted': item.formatted,
        'uom': item.uom
      };
    });
  }

  var DeviceContructor = Isy.get_constructor(parsed);
  device = DeviceContructor.find(parsed.address);

  if (!device) {
    device = new DeviceContructor(Object.assign({}, parsed));
  }

  device.emit('update', parsed);

  return parsed;
};

Isy.IsyDevice = function (config) {
  var self = this;
  Isy.devices.push(self);

  self.config = config;
  self.name = config.name;
  self.update_timer;

  self.config.addresses = [];
  self.config.addresses.push(self.config.address);

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

  log.debug('Added device:', self.name);
};
Object.assign(Isy.IsyDevice.prototype, EventEmitter.prototype);
Isy.IsyDevice.find = function (address) {
  var matches = Isy.devices.filter(function (device) {
    return (device.config.addresses.indexOf(address) !== -1 || device.config.address === address);
  });

  if (matches.length > 0) {
    return matches[0];
  }
};
Isy.IsyDevice.prototype.build_state = function () { return {}; };
Isy.IsyDevice.prototype.get_abode_device = function () {
  var self = this;

  var matches = abode.devices.get_by_provider('isy').filter(function (device) {
    return (device.config.address === self.config.address);
  })

  if (matches.length > 0) {
    return matches[0];
  }
};
Isy.IsyDevice.prototype.update = function () {
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
Isy.IsyDevice.prototype.DON = function (address, level) {
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
Isy.IsyDevice.prototype.DOF = function (address) {
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
Isy.IsyDevice.prototype.STATUS = function (address) {
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

Isy.InsteonDevice = function (config) {
  var self = this;

  Isy.IsyDevice.apply(this, arguments);

  self.config.address = self.config.address.split(' ').slice(0, 3).join(' ');

  self.on('state-change', function (msg) {
    self.config.properties.ST.value = msg.action;
  });

  self.on('update', function (msg) {
    if (self.config.addresses.indexOf(msg.address) === -1){
      self.config.addresses.push(msg.address);
    }
  });
};
Object.assign(Isy.InsteonDevice, Isy.IsyDevice);
Object.assign(Isy.InsteonDevice.prototype, Isy.IsyDevice.prototype);
Isy.InsteonDevice.find = function (address) {
  var matches = Isy.devices.filter(function (device) {
    return (address.split(' ').slice(0, 3).join(' ') === device.config.address);
  });

  if (matches.length > 0) {
    return matches[0];
  }
};
Isy.InsteonDevice.prototype.on_command = function () {
  var self = this,
    defer = q.defer();

  self.DON(self.config.address + ' 1')
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: true}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
Isy.InsteonDevice.prototype.off_command = function () {
  var self = this,
    defer = q.defer();

  self.DOF(self.config.address + ' 1')
    .then(function (result) {
      defer.resolve({'response': true, 'update': {_on: false}, 'result': result});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};
Isy.InsteonDevice.prototype.status_command = function () {
  var self = this,
    defer = q.defer();

  self.STATUS(self.config.address + ' 1').then(function (result) {
      defer.resolve({_on: parseInt(result.properties.ST.value, 10)  > 0});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

Isy.ZWaveDevice = function () {};
Object.assign(Isy.ZWaveDevice, Isy.IsyDevice);
Object.assign(Isy.ZWaveDevice.prototype, Isy.IsyDevice.prototype);

Isy.Program = function () {};
Isy.Program.prototype.capabilities = ['scene', 'onoff'];

Isy.InsteonLightDimmer = function (config) {
  var self = this;

  Isy.InsteonDevice.apply(this, arguments);

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
Object.assign(Isy.InsteonLightDimmer, Isy.InsteonDevice);
Object.assign(Isy.InsteonLightDimmer.prototype, Isy.InsteonDevice.prototype);
Isy.InsteonLightDimmer.prototype.capabilities = ['light', 'dimmer'];
Isy.InsteonLightDimmer.prototype.build_state = function () {
  return {
    '_on': this._on,
    '_level': this._level,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};
Isy.InsteonLightDimmer.prototype.on_command = function (level) {
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
Isy.InsteonLightDimmer.prototype.off_command = function () {
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
Isy.InsteonDevice.prototype.status_command = function () {
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

Isy.InsteonLightOnOff = function () {
  var self = this;

  Isy.InsteonDevice.apply(this, arguments);

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
        self._on = (parseInt(msg.action, 10) > 0);
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
          self._on = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        default:
          break;
      }
    }
  });
};
Object.assign(Isy.InsteonLightOnOff, Isy.InsteonDevice);
Object.assign(Isy.InsteonLightOnOff.prototype, Isy.InsteonDevice.prototype);
Isy.InsteonLightOnOff.prototype.capabilities = ['light', 'onoff'];
Isy.InsteonLightOnOff.prototype.build_state = function () {
  return {
    '_on': this._on,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};

Isy.InsteonApplianceOnOff = function () {
  var self = this;

  Isy.InsteonDevice.apply(this, arguments);

  self.on('state-change', function (msg) {
    var group = msg.node.split(' ')[3];
    self.last_seen = new Date();

    switch (group) {
      case '1':
        self._on = (parseInt(msg.action, 10) > 0);
        if (self._on !== (parseInt(msg.action, 10) > 0) && self._on) {
          self.last_off = self.last_seen;
        } else if (self._on !== (parseInt(msg.action, 10) > 0) && !self._on) {
          self.last_on = self.last_seen;
        }
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
          self._on = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        default:
          break;
      }
    }
  });

  this.on('device-on', function () {
    this._on = true;
  });

  this.on('device-off', function () {
    this._on = false;
  });
};
Object.assign(Isy.InsteonApplianceOnOff, Isy.InsteonDevice);
Object.assign(Isy.InsteonApplianceOnOff.prototype, Isy.InsteonDevice.prototype);
Isy.InsteonApplianceOnOff.prototype.capabilities = ['appliance', 'onoff'];
Isy.InsteonApplianceOnOff.prototype.build_state = function () {
  return {
    '_on': this._on,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};

Isy.InsteonOpenClose = function () {
  var self = this;

  Isy.InsteonDevice.apply(this, arguments);

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
        self._on = (parseInt(msg.action, 10) > 0);
        break;
      case '3':
        self.low_battery = (parseInt(msg.action, 10) > 0);
        self._battery = (parseInt(msg.action, 10) === 0);
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
          self._on = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        case '3':
          self.low_battery = (parseInt(msg.properties.ST.value, 10) > 0);
          self._battery = (parseInt(msg.properties.ST.value, 10) === 0);
          break;
        default:
          break;
      }
    }
  });
};
Object.assign(Isy.InsteonOpenClose, Isy.InsteonDevice);
Object.assign(Isy.InsteonOpenClose.prototype, Isy.InsteonDevice.prototype);
Isy.InsteonOpenClose.prototype.capabilities = ['openclose', 'battery_sensor'];
Isy.InsteonOpenClose.prototype.build_state = function () {
  return {
    '_on': this._on,
    '_battery': this._battery,
    'low_battery': this.low_battery,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};
Isy.InsteonOpenClose.prototype.on_command = function () {
  var defer = q.defer();

  defer.resolve({'response': true, 'update': {_on: true}});

  return defer.promise;
};
Isy.InsteonOpenClose.prototype.off_command = function () {
  var defer = q.defer();

  defer.resolve({'response': true, 'update': {_on: false}});

  return defer.promise;
};

Isy.InsteonMotion = function () {
  var self = this;

  Isy.InsteonDevice.apply(this, arguments);

  self.on('state-change', function (msg) {
    var group = msg.node.split(' ')[3];
    self.last_seen = new Date();

    switch (group) {
      case '1':
        if (self._motion !== (parseInt(msg.action, 10) > 0) && self._motion) {
          self.last_off = self.last_seen;
        } else if (self._motion !== (parseInt(msg.action, 10) > 0) && !self._motion) {
          self.last_on = self.last_seen;
        }
        self._motion = (parseInt(msg.action, 10) > 0);
        break;
      case '2':
        self._lumens = (parseInt(msg.action, 10) / 255);
        break;
      case '3':
        self.low_battery = (parseInt(msg.actione, 10) > 0);
        self._battery = (parseInt(msg.action, 10) === 0);
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
          if (self._motion !== (parseInt(msg.properties.ST, 10) > 0) && self._motion) {
            self.last_off = self.last_seen;
          } else if (self._motion !== (parseInt(msg.properties.ST, 10) > 0) && !self._motion) {
            self.last_on = self.last_seen;
          }
          self._motion = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        case '2':
          self._lumens = (parseInt(msg.properties.ST.value, 10) / 255);
          break;
        case '3':
          self.low_battery = (parseInt(msg.properties.ST.value, 10) > 0);
          self._battery = (parseInt(msg.properties.ST.value, 10) === 0);
          break;
        default:
          break;
      }
    }
  });
};
Object.assign(Isy.InsteonMotion, Isy.InsteonDevice);
Object.assign(Isy.InsteonMotion.prototype, Isy.InsteonDevice.prototype);
Isy.InsteonMotion.prototype.capabilities = ['motionsensor', 'battery_sensor'];
Isy.InsteonMotion.prototype.build_state = function () {
  return {
    '_motion': this._motion,
    '_lumens': this._lumens,
    '_battery': this._battery,
    'low_battery': this.low_battery,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};
Isy.InsteonMotion.prototype.on_command = function () {
  var defer = q.defer();

  defer.resolve({'response': true, 'update': {_motion: true}});

  return defer.promise;
};
Isy.InsteonMotion.prototype.off_command = function () {
  var defer = q.defer();

  defer.resolve({'response': true, 'update': {_motion: false}});

  return defer.promise;
};
Isy.InsteonDevice.prototype.status_command = function () {
  var self = this,
    defer = q.defer();

  self.STATUS(self.config.address + ' 1').then(function (result) {
      defer.resolve({_motion: parseInt(result.properties.ST.value, 10)  > 0});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

Isy.InsteonLock = function () {
  var self = this;

  Isy.InsteonDevice.apply(this, arguments);

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
        self._on = (parseInt(msg.action, 10) > 0);
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
          self._on = (parseInt(msg.properties.ST.value, 10) > 0);
          break;
        default:
          break;
      }
    }
  });
};
Object.assign(Isy.InsteonLock, Isy.InsteonDevice);
Object.assign(Isy.InsteonLock.prototype, Isy.InsteonDevice.prototype);
Isy.InsteonLock.prototype.capabilities = ['lock'];
Isy.InsteonLock.prototype.build_state = function () {
  return {
    '_on': this._on,
    'last_seen': this.last_seen,
    'last_on': this.last_on,
    'last_off': this.last_off
  };
};

Isy.ZWaveTemperature = function () {

  Isy.ZWaveDevice.apply(this, arguments);
};
Object.assign(Isy.ZWaveTemperature, Isy.ZWaveDevice);
Object.assign(Isy.ZWaveTemperature.prototype, Isy.ZWaveDevice.prototype);
Isy.ZWaveTemperature.prototype.capabilities = ['temperaturesensor'];

Isy.ZWaveMultiSensor = function () {

  Isy.ZWaveDevice.apply(this, arguments);
};
Object.assign(Isy.ZWaveMultiSensor, Isy.ZWaveDevice);
Object.assign(Isy.ZWaveMultiSensor.prototype, Isy.ZWaveDevice.prototype);
Isy.ZWaveMultiSensor.prototype.capabilities = ['sensor'];

Isy.ZWaveOnOff = function () {

  Isy.ZWaveDevice.apply(this, arguments);
};
Object.assign(Isy.ZWaveOnOff, Isy.ZWaveDevice);
Object.assign(Isy.ZWaveOnOff.prototype, Isy.ZWaveDevice.prototype);
Isy.ZWaveOnOff.prototype.capabilities = ['appliance', 'onoff'];

Isy.ZWaveLightDimmer = function () {

  Isy.ZWaveDevice.apply(this, arguments);
};
Object.assign(Isy.ZWaveLightDimmer, Isy.ZWaveDevice);
Object.assign(Isy.ZWaveLightDimmer.prototype, Isy.ZWaveDevice.prototype);
Isy.ZWaveLightDimmer.prototype.capabilities = ['light', 'dimmer'];

Isy.get_constructor = function (device) {
  var types = {
    '1.14.65.0': Isy.InsteonLightDimmer,
    '1.14.67.0': Isy.InsteonLightDimmer,
    '1.25.56.0': Isy.InsteonLightDimmer,
    '1.32.65.0': Isy.InsteonLightDimmer,
    '1.32.69.0': Isy.InsteonLightDimmer,
    '1.58.72.0': Isy.InsteonLightDimmer,
    '1.66.68.0': Isy.InsteonLightDimmer,
    '1.66.69.0': Isy.InsteonLightDimmer,
    '2.42.67.0': Isy.InsteonLightOnOff,
    '2.44.68.0': Isy.InsteonLightOnOff,
    '2.42.69.0': Isy.InsteonLightOnOff,
    '2.55.72.0': Isy.InsteonApplianceOnOff,
    '2.56.67.0': Isy.InsteonApplianceOnOff,
    '4.16.1.0': Isy.ZWaveOnOff,
    '4.33.1.0': Isy.ZWaveTemperature,
    '7.0.65.0': Isy.InsteonOpenClose,
    '15.10.67.0': Isy.InsteonLock,
    '16.1.0.0': Isy.InsteonMotion,
    '16.1.65.0': Isy.InsteonMotion,
    '16.2.64.0': Isy.InsteonOpenClose,
    '16.2.67.0': Isy.InsteonOpenClose,
    '16.17.67.0': Isy.InsteonOpenClose,
    '16.17.69.0': Isy.InsteonOpenClose
  };

  if (!types[device.type]) {
    log.warn('Unknown device type: ', device.type);
    return Isy.InsteonDevice;
  }

  return types[device.type];
};

Isy.get_capabilities = function (device) {
  var capabilities = {
    '1.14.65.0': ['light', 'dimmer'],
    '1.14.67.0': ['light', 'dimmer'],
    '1.25.56.0': ['light', 'dimmer'],
    '1.32.65.0': ['light', 'dimmer'],
    '1.32.69.0': ['light', 'dimmer'],
    '1.58.72.0': ['light', 'dimmer'],
    '1.66.68.0': ['light', 'dimmer'],
    '1.66.69.0': ['light', 'dimmer'],
    '2.42.67.0': ['light', 'onoff'],
    '2.44.68.0': ['light', 'onoff'],
    '2.42.69.0': ['light', 'onoff'],
    '2.55.72.0': ['onoff'],
    '2.56.67.0': ['onoff'],
    '4.16.1.0': ['onoff'],
    '4.33.1.0': ['temperaturesensor'],
    '7.0.65.0': ['openclose'],
    '15.10.67.0': ['lock'],
    '16.1.0.0': ['motionsensor'],
    '16.1.65.0': ['motionsensor'],
    '16.2.64.0': ['openclose'],
    '16.2.67.0': ['openclose'],
    '16.17.67.0': ['openclose'],
    '16.17.69.0': ['openclose']
  };

  if (!capabilities[device.type]) {
    log.warn('Unknown device type: ', device.type);
    return [];
  }

  return capabilities[device.type];
};

Isy.parseGroups = function (groups) {
  var objs = {};

  groups.forEach(function (group) {
    Isy.parseGroup(group);
  });

  return objs;
};
Isy.parseGroup = function (node, properties) {
  var parsed = {};
  var group;

  parsed.type = 'group';

  var address = node.address[0];
  Object.keys(node).forEach(function (key) {
    parsed[key] = (Array.isArray(node[key])) ? node[key][0] : node[key];
  });

  if (parsed.parent) {
    parsed.parent = {
      'address': parsed.parent._,
      'type': parsed.parent.$.type
    };
  }

  if (parsed.$ && parsed.$.flag) {
    parsed.flag = parsed.$.flag;
    delete parsed.$;
  }

  if (parsed.members && parsed.members.link) {
    var members = [];
    parsed.members.link.forEach(function (member) {
      var device = Isy.IsyDevice.find(member._);
      members.push({
        'name': (device) ? device.name : undefined,
        'address': member._,
        'type': member.$.type
      });
    });

    parsed.members = members;
  }
  group = Isy.IsyGroup.find(parsed.address);

  if (!group) {
    group = new Isy.IsyGroup(Object.assign({}, parsed));
  }

  group.emit('update', parsed);

  return parsed;
};
Isy.IsyGroup = function (config) {
  var self = this;
  Isy.groups.push(self);

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
Object.assign(Isy.IsyGroup.prototype, EventEmitter.prototype);
Isy.IsyGroup.prototype.capabilities = ['scene', 'onoff'];
Isy.IsyGroup.find = function (address) {
  var matches = Isy.groups.filter(function (group) {
    return (group.config.address === address);
  });

  if (matches.length > 0) {
    return matches[0];
  }
};
Isy.IsyGroup.prototype.build_state = function () { return {'_on': this._on}; };
Isy.IsyGroup.prototype.get_abode_device = function () {
  var self = this;

  var matches = abode.devices.get_by_provider('isy').filter(function (device) {
    return (device.config.address === self.config.address);
  });

  if (matches.length > 0) {
    return matches[0];
  }
};
Isy.IsyGroup.prototype.update = function () {
  var abode_device = this.get_abode_device();

  if (abode_device) {
    var state = this.build_state();
    log.debug('Updating group: ', this.name, state);
    abode_device.set_state(state);
  } else {
    log.debug('Group updated but not linked to an Abode device: ', this.name);
  }

};
Isy.IsyGroup.prototype.DON = function (address, level) {
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
Isy.IsyGroup.prototype.DOF = function (address) {
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
Isy.IsyGroup.prototype.STATUS = function (address) {
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
Isy.IsyGroup.prototype.on_command = function () {
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
Isy.IsyGroup.prototype.off_command = function () {
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
Isy.IsyGroup.prototype.status_command = function () {
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

Isy.parseFolders = function (folders) {
  var objs = {};

  folders.forEach(function (folder) {
    var address = folder.address[0];
    objs[address] = {};
    Object.keys(folder).forEach(function (key) {
      objs[address][key] = (Array.isArray(folder[key])) ? folder[key][0] : folder[key];
    });

    if (objs[address].parent) {
      objs[address].parent = {
        'address': objs[address].parent._,
        'type': objs[address].parent.$.type
      };
    }

    if (objs[address].$ && objs[address].$.flag) {
      objs[address].flag = objs[address].$.flag;
      delete objs[address].$;
    }

  });

  return objs;
};

Isy.req = function (uri, method, data) {
  var url,
    options,
    defer = q.defer();

  url = 'http://' + Isy.config.server + uri;

  options = {
    'uri': url,
    'method': method || 'GET',
    'data': data,
    'headers': {
      'Authorization': 'Basic ' + new Buffer(Isy.config.username + ':' + Isy.config.password).toString('base64')
    }
  };

  request(options, function (err, response, body) {
    if (err) {
      defer.reject(err);
      return;
    }

    parseString(body, function (err, parsed) {
      if (err) {
        return defer.reject(err);
      }

      defer.resolve(parsed);
    });
  });

  return defer.promise;
};

Isy.message_handler = function (data) {
    parseString(data, function (err, parsed) {
      if (err) {
        log.error('Unable to parse message:', err);
        return;
      }
      if (parsed.Event) {
        var control, action;
        var parsed_event = parsed.Event;

        if (parsed_event.$ && parsed_event.$.seqnum) {
          parsed_event.seqnum = parsed_event.$.seqnum;
        }
        if (parsed_event.$ && parsed_event.$.sid) {
          parsed_event.sid = parsed_event.$.sid;
        }
        delete parsed_event.$;

        if (parsed_event.control) {
          parsed_event.control = parsed_event.control[0];
        }
        if (parsed_event.action) {
          parsed_event.action = parsed_event.action[0];
        }
        if (parsed_event.eventInfo) {
          parsed_event.eventInfo = parsed_event.eventInfo[0];
        }
        if (parsed_event.node) {
          parsed_event.node = parsed_event.node[0];
        }

        control = Isy.controls[parsed_event.control];
        if (!control) {
          log.debug('Unknown control code: %s\n', parsed_event.control, parsed_event);
          return;
        }

        if (control.handler) {
          control.handler(parsed_event);
          return;
        }

        action = control.actions[parsed_event.action];
        if (!action) {
          log.debug('Unknown action code: %s', parsed_event.action);
          return;
        }
        log.debug('Received control: %s, action: %s', control.name, action.name);
        log.debug(parsed_event);
      }
    });
};

Isy.controls = {
  '_0': {
    'name': 'Heartbeat',
    'handler': function (msg) {
      log.debug('Heartbeat received: %s', msg.action);
    }
  },
  '_1': {
    'name': 'Trigger Event',
    'handler': function (msg) {
      log.debug('Trigger Event: %s', msg.action);
    }
  },
  '_3': {
    'name': 'Node Changed/Updated',
    'handler': function (msg) {
      log.debug('Node Changed/Updated: %s', msg.action);
    }
  },
  '_4': {
    'name': 'System Configuration Updated',
    'handler': function (msg) {
      log.debug('System Configuration Updated: %s', msg.action);
    }
  },
  '_23': {
    'name': '',
    'handler': function () {}
  },
  '_22': {
    'name': '',
    'handler': function () {}
  },
  'ST': {
    'name': 'State',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('state-change', msg);
      }
    }
  },
  'DON': {
    'name': 'Device On',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('device-on', msg);
      }
      log.debug('ON:', msg.node, msg.action);
    }
  },
  'DOF': {
    'name': 'Device Off',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('device-off', msg);
      }
      log.debug('OFF:', msg.node, msg.action);
    }
  },
  'BMAN': {
    'name': 'BEGIN Manual',
    'handler': function (msg) {
      log.debug('START MANUAL:', msg.node, msg.action);
    }
  },
  'SMAN': {
    'name': 'Stop Manual',
    'handler': function (msg) {
      log.debug('STOP MANUAL:', msg.node, msg.action);
    }
  },
  'CLIHUM': {
    'name': 'Climate Humidity',
    'handler': function (msg) {
      log.debug('HUMIDITY:', msg.node, msg.action);
    }
  },
  'CLITEMP': {
    'name': 'Climate Temperature',
    'handler': function (msg) {
      log.debug('TEMP:', msg.node, msg.action);
    }
  },
  'BATLVL': {
    'name': 'Battery Level',
    'handler': function (msg) {
      log.debug('BATTERY:', msg.node, msg.action);
    }
  },
  'LUMIN': {
    'name': 'Luminance',
    'handler': function (msg) {
      log.debug('LUMENS:', msg.node, msg.action);
    }
  },
  'UV': {
    'name': 'Ultraviolet',
    'handler': function (msg) {
      log.debug('UV:', msg.node, msg.action);
    }
  },
  'OL': {
    'name': 'On-Level',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.config.on_level = parseInt(msg.action, 10);
        device.emit('changed', msg);
      }
    }
  },
  'RR': {
    'name': 'Ramp-Rate',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.config.ramp_rate = parseInt(msg.action, 10);
        device.emit('changed', msg);
      }
    }
  }
};

Isy.on = function (device) {
  var defer = q.defer();
  var address = device.address || device.config.address;
  var isy_node = Isy.lookup(device.config.type).find(address);

  if (!isy_node) {
    defer.reject({'response': false, 'message': 'Isy Device Not Found'});
    return defer.promise;
  }

  isy_node.on_command()
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

Isy.off = function (device) {
  var defer = q.defer();
  var address = device.address || device.config.address;
  var isy_node = Isy.lookup(device.config.type).find(address);

  if (!isy_node) {
    defer.reject({'response': false, 'message': 'Isy Device Not Found'});
    return defer.promise;
  }

  isy_node.off_command()
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

Isy.set_level = function (device, level) {
  var defer = q.defer();
  var address = device.address || device.config.address;
  var isy_node = Isy.lookup(device.config.type).find(address);

  if (!isy_node) {
    defer.reject({'response': false, 'message': 'Isy Device Not Found'});
    return defer.promise;
  }

  isy_node.on_command(level)
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

Isy.get_status = function (device) {
  var defer = q.defer(),
    address = device.address || device.config.address;
  var isy_node = Isy.lookup(device.config.type).find(address);

  if (!isy_node) {
    defer.reject({'response': false, 'message': 'Isy Device Not Found'});
    return defer.promise;
  }

  isy_node.status_command().then(function (state) {
    defer.resolve({'response': true, 'update': state})
  }).fail(function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

module.exports = Isy;
