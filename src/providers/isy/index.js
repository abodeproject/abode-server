'use strict';

var abode,
  routes,
  q = require('q'),
  WebSocket = require('ws'),
  parseString = require('xml2js').parseString,
  logger = require('log4js'),
  request = require('request'),
  log = logger.getLogger('isy');

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
  Isy.config.min_heartbeat_interval = Isy.config.heartbeat_interval || 45;

  // Set some defaults
  Isy.connected = false;
  Isy.attempt_reconnect = false;
  Isy.queue = [];
  Isy.devices = [];
  Isy.folders = [];
  Isy.groups = [];

  Object.assign(Isy, require('./groups'));
  Object.assign(Isy, require('./devices'));
  Object.assign(Isy, require('./programs'));

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


        Isy.heartbeat_checker = setInterval(function () {
          var now = new Date(),
            heartbeat_age = (now - Isy.last_heartbeat) / 1000;

          if (heartbeat_age > Isy.config.min_heartbeat_interval) {
            log.warn('Heartbeat not received in 30s, reconnecting event feed');
            clearInterval(Isy.heartbeat_checker);
            Isy.socket.close();
          }
        }, 1000);

        defer.resolve(true);
      });

      Isy.socket.on('error', function error(error) {
        if (Isy.heartbeat_checker) {
          clearTimeout(Isy.heartbeat_checker);
        }
        Isy.socket.close();
        log.error('Socket Error:', error.message, arguments);
        if (Isy.attempt_reconnect) {
          log.info('Disconnected due to Error.  Reconnecting in %s seconds', Isy.config.reconnect_timeout);
          setTimeout(function () {
            Isy.start();
          }, 1000 * Isy.config.reconnect_timeout);
        }
      });

      Isy.socket.on('close', function close() {
        if (Isy.heartbeat_checker) {
          clearTimeout(Isy.heartbeat_checker);
        }
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
      if (Isy.socket && Isy.socket.close) {
        Isy.socket.close();
      }
      log.error(err);
      if (Isy.attempt_reconnect) {
        log.info('Event feed error.  Reconnecting in %s seconds', Isy.config.reconnect_timeout);
        setTimeout(function () {
          Isy.start();
        }, 1000 * Isy.config.reconnect_timeout);
      }
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
      log.info('Finished getting nodes. Folders: %s, Devices: %s, Groups: %s', Isy.folders.length, Isy.IsyDevice.devices.length, Isy.IsyGroup.groups.length);

      defer.resolve({
        'devices': Isy.IsyDevice.devices,
        'groups': Isy.IsyGroup.groups,
        'programs': []
      });
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


Isy.parseGroups = function (groups) {
  var objs = {};

  groups.forEach(function (group) {
    Isy.parseGroup(group);
  });

  return objs;
};
Isy.parseGroup = function (node) {
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
          log.warn('Unknown control code: %s\n', parsed_event.control, parsed_event);
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
      Isy.last_heartbeat = new Date();
      log.info('Heartbeat received: %s', msg.action);
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
  '_5': {
    'name': '',
    'handler': function () {
    }
  },
  '_19': {
    'name': '',
    'handler': function () {}
  },
  '_21': {
    'name': '',
    'handler': function () {}
  },
  '_22': {
    'name': '',
    'handler': function () {}
  },
  '_23': {
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
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'CLITEMP': {
    'name': 'Climate Temperature',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'BATLVL': {
    'name': 'Battery Level',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'LUMIN': {
    'name': 'Luminance',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'UV': {
    'name': 'Ultraviolet',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'TPW': {
    'name': 'Total Power Wattage',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'USRNUM': {
    'name': 'User Number',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'ALARM': {
    'name': 'ALARM',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'ERR': {
    'name': 'Error',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'CC': {
    'name': 'Current Current',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
    }
  },
  'CV': {
    'name': 'Current Voltage',
    'handler': function (msg) {
      var device = Isy.IsyDevice.find(msg.node);
      if (device && device.emit) {
        device.emit('changed', msg);
      }
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

Isy.on = Isy.open = Isy.lock = function (device) {
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

Isy.off = Isy.close = Isy.unlock = function (device) {
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

Isy.set_code = Isy.enable_code = function (device, user, code) {
  var defer = q.defer();
  var address = device.address || device.config.address;
  var isy_node = Isy.lookup(device.config.type).find(address);

  if (!isy_node) {
    defer.reject({'response': false, 'message': 'Isy Device Not Found'});
    return defer.promise;
  }

  if (!isy_node.set_code) {
    defer.reject({'response': false, 'message': 'Command not supported by device'});
    return defer.promise;
  }

  isy_node.set_code(user, code)
    .then(function (result) {
      defer.resolve(result);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

Isy.delete_code = Isy.disable_code = function (device, user) {
  var defer = q.defer();
  var address = device.address || device.config.address;
  var isy_node = Isy.lookup(device.config.type).find(address);

  if (!isy_node) {
    defer.reject({'response': false, 'message': 'Isy Device Not Found'});
    return defer.promise;
  }

  if (!isy_node.delete_code) {
    defer.reject({'response': false, 'message': 'Command not supported by device'});
    return defer.promise;
  }

  isy_node.delete_code(user)
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

Isy.query_device = function (device) {
  var defer = q.defer(),
    address = device.address || device.config.address;
  var isy_node = Isy.lookup(device.config.type).find(address);

  if (!isy_node) {
    defer.reject({'response': false, 'message': 'Isy Device Not Found'});
    return defer.promise;
  }

  isy_node.query_command().then(function (state) {
    defer.resolve({'response': true, 'update': state})
  }).fail(function (err) {
    defer.reject(err);
  });

  return defer.promise;
};


Isy.is_open = Isy.is_on = Isy.is_locked = function (device) {
  var defer = q.defer();

  defer.resolve({'update': {'_on': device._on}, 'response': device._on});

  return defer.promise;
};

Isy.is_closed = Isy.is_off = Isy.is_unlocked = function (device) {
  var defer = q.defer();

  defer.resolve({'update': {'_on': device._on}, 'response': (!device._on)});

  return defer.promise;
};

Isy.has_motion = function (device) {
  var defer = q.defer();

  defer.resolve({'update': {'_motion': device._motion}, 'response': device._motion});

  return defer.promise;
};

module.exports = Isy;
