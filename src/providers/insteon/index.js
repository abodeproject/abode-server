'use strict';

var abode,
  routes,
  Q = require('q'),
  utils = require('./utils'),
  logger = require('log4js'),
  Modem = require('./modem'),
  Device = require('./device'),
  Scene = require('./scene'),
  Message = require('./message'),
  log = logger.getLogger('insteon');

var Insteon = function () {
  var defer = Q.defer();

  // Get abode
  abode = require('../../abode');

  // Set our routes
  routes = require('./routes');
  abode.web.server.use('/api/insteon', routes);


  // Build our config
  abode.config.insteon = abode.config.insteon || {};
  Insteon.config = abode.config.insteon;
  Insteon.config.enabled = (Insteon.config.enabled!== false);
  Insteon.config.message_log = Insteon.config.message_log || 'console';
  Insteon.config.message_log_size = Insteon.config.message_log_size || 4194304;
  Insteon.config.message_log_count = Insteon.config.message_log_count || 4;
  Insteon.config.polling_enabled = (Insteon.config.polling_enabled!==false);
  Insteon.config.poll_interval = Insteon.config.poll_interval || 5;
  Insteon.config.poll_wait = Insteon.config.poll_wait || 60;
  Insteon.config.skip_timeout = Insteon.config.skip_timeout || 30000;

  Insteon.modem = new Modem(Insteon.config);
  Insteon.modem.on('MESSAGE', Insteon.message_handler);
  Insteon.modem.on('linked', function (message) {
    new Device(Insteon, message.result);
    Insteon.linking = false;
    Insteon.last_linked = message.result;
    log.info('Device Linked: %s', message.result.address);
    Insteon.get_device(message.result.address).then(function (device) {
      abode.events.emit('INSTEON_LINKED', {'object': device});
    });

  });
  Insteon.modem.on('CLOSED', Insteon.disable);
  Insteon.enabled = false;
  Insteon.linking = false;
  Insteon.polling = false;
  Insteon.database = [];

  abode.triggers.types.push({'name': 'INSTEON_LINKED'});
  abode.events.on('ABODE_STARTED', function () {
    Insteon.load_devices();
    Insteon.load_scenes();
    setTimeout(Insteon.poll, 100);
  });

  if (Insteon.config.enabled) {
    Insteon.enable().then(function () {
      log.info('Provider Initialized');
      defer.resolve();
    }, function () {
      log.error('Provider initialized but failed to enable');
      defer.resolve();
    });

  } else {
    var msg = 'Provider initialized but not enabled';
    log.info(msg);
    defer.resolve();
  }



  if (Insteon.config.message_log !== 'console') {
    logger.addAppender(logger.appenders.file(Insteon.config.message_log, logger.layouts.patternLayout('[%d]%m'), Insteon.config.message_log_size, Insteon.config.message_log_count), 'insteon_message');
  } else {
    log.info('Logging access log to console');
    logger.addAppender(logger.appenders.console(), 'insteon_message');
  }


  return defer.promise;
};

Insteon.devices = [];
Insteon.scenes = [];
Insteon.statusable = [
  0x01,
  0x02,
  0x07
];
Insteon.heartbeats = [
  0x0a
];

Insteon.poll = function () {
  var i = 0;

  if (Insteon.config.polling_enabled === false) {
    return;
  }

  if (Insteon.devices.length === 0) {
    return;
  }

  if (Insteon.enabled === false || Insteon.connected === false) {
    return;
  }

  if (Insteon.polling !== false) {
    return;
  }

  var done = function () {
    var now = new Date();
    var diff = now - Insteon.polling;

    log.info('Finish polling devices: %d minutes', (diff / 1000 / 60).toFixed(2));

    Insteon.polling = false;
    setTimeout(Insteon.poll, 1000 * 60 * Insteon.config.poll_interval);
  };

  var next = function (attempt) {

    var now = new Date(),
      modem_idle_time = (now - Insteon.modem.last_sent);

    // Wait for modem to be idle
    if (modem_idle_time < (Insteon.config.poll_wait * 1000)) {
      // Sleep until we might be idle again (wait time minus current idle time).
      var idle_wait = (Insteon.config.poll_wait * 1000) - modem_idle_time;
      log.debug('Modem not idle, sleeping %s sec', (idle_wait / 1000).toFixed(2));
      setTimeout(next, idle_wait);
      return;
    }
    attempt = attempt || 1;

    if (i === Insteon.devices.length) {
      return done();
    }
    var device = Insteon.devices[i];

    if (attempt > 3) {
      i += 1;
      setTimeout(next, Insteon.config.poll_wait * 1000);
      return;
    }

    if (device.config.device_cat === undefined || parseInt(device.config.device_cat) === 0) {
      log.warn('Device has no devcat: %s', device.name || device.address);
    }

    if (Insteon.statusable.indexOf(parseInt(device.config.device_cat, 10)) === -1) {
      device.config.device_cat = device.config.device_cat || 0;
      log.debug('Cannot status device type: %s (devcat: 0x%s)', device.name || device.address, utils.toHex(device.config.device_cat));
      i += 1;
      setTimeout(next, 100);
      return;
    }

    log.debug('Polling device: %s (devcat: 0x%s)', device.name || device.address, utils.toHex(device.config.device_cat));

    Insteon.modem.polling = true;

    Insteon.get_status(device).then(function (result) {
      if (result.on !== device.on || result.level !== device.level) {

        Insteon.message_handler(result);
      }

      i += 1;
      setTimeout(next, 1000);
    }, function () {
      log.error('Failed to get device status, trying again...');
      setTimeout(function () {
        next(attempt + 1);
      }, 1000);
    });
  };

  log.info('Starting to poll devices');
  Insteon.polling = new Date();
  next();
};

Insteon.enable = function () {
  var defer = Q.defer();

  if (Insteon.enabled) {
    defer.reject({'status': 'failed', 'message': 'Insteon is already enabled'});
    return defer.promise;
  }

  if (!Insteon.config.serial_device) {
    defer.reject({'status': 'failed', 'message': 'No Insteon device specified'});
    return defer.promise;
  }

  log.debug('Enabling Insteon');

  Insteon.modem.connect().then(function () {
    log.info('Provider Enabled');
    Insteon.enabled = true;

    Insteon.get_im_info().then(function (info) {
      Insteon.modem_info = info;
      new Device(Insteon, info, abode.config.name);
    }, function (err) {
      log.error('Unable to get modem info: %s', err);
    });

    defer.resolve({'status': 'success', 'message': 'Insteon enabled'});
  }, function (err) {
    Insteon.enabled = false;
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.load_devices = function () {
  log.info('Loading Insteon devices');
  var devices = abode.devices.get_by_provider('insteon');

  devices.forEach(function (device) {
    var d = new Device(Insteon, device.config, device.name);
    d.on = device._on;
    d.last_seen = device.last_seen;
    d.low_battery = device.low_battery;
  });
};

Insteon.load_scenes = function () {
  log.info('Loading Insteon scenes');
  var i,
    devices = abode.devices.get_by_provider('insteon');

  for (i=1; i<=255; i++) {
    var name,
      matches = Insteon.devices.filter(function (dev) {
        return (dev.config.address.toLowerCase() === '00.00.' + utils.toHex(i));
      });

    if (matches.length > 0) {
      new Scene(Insteon, matches[0].config, matches[0].name);
    } else {
      new Scene(Insteon, {'address': '00.00.' + utils.toHex(i), 'used': false}, 'UNUSED');
    }
  }
};

Insteon.message_handler = function (msg) {
  var devices, insteon_devices, state = {};

  if (msg.command.indexOf('STOP_CHANGE') >= 0) {
    log.info('Sending status request due to local level change: %s', msg.from);
    var cmd = new Message();
    cmd.to = msg.from;
    cmd.command = 'LIGHT_STATUS_REQUEST';
    cmd.emit = true;
    cmd.send(Insteon.modem);
  }
  // Determine the values the set
  if (msg.on !== undefined) {
    state._on = msg.on;
  }
  if (msg.level !== undefined) {
    state._level = msg.level;
  }

  // Check if there are any values we can set
  if (Object.keys(state).length === 0) {
    log.debug('No values to set for device: %s', msg.from);
    return;
  }


  Insteon.get_device(msg.from).then(function (insteon_device) {
    if (msg.on !== undefined) { insteon_device.on = msg.on; }
    if (msg.level !== undefined) { insteon_device.level = msg.level; }
    insteon_device.last_seen = new Date();

    if (insteon_device.skip_command(msg.command[msg.command.length - 1])) {
      log.debug('Skipping cleanup command from %s (%s) to %s: %s', insteon_device.name, msg.from, msg.to, msg.command);
      return;
    }

    // Lookup the device
    log.debug('Looking for Abode device: %s', msg.from);
    insteon_devices = abode.devices.get_by_provider('insteon');
    devices = insteon_devices.filter(function (device) {
      return (device.config && device.config.address === msg.from);
    });

    if (devices.length === 0) {
      log.warn('No device found with address: %s', msg.from);
      return;
    }

    log.info('Message received: %s from %s (%s) for %s', msg.command, insteon_device.name, msg.from, msg.to);

    state.last_seen = new Date();

    devices.forEach(function (device) {

      if (device.active === false && msg.to === '00.00.04') {
        log.info('Heartbeat received: %s', device.name);
        state = {
          'last_seen': new Date(),
          'config': device.config
        };
        state.config.last_heartbeat = new Date();
        device.set_state(state);

        return;
      }

      if (device.active === false && msg.to === '00.00.03') {
        log.info('Low battery received: %s', device.name);
        state = {
          'last_seen': new Date(),
          'config': device.config
        };
        state._low_battery = true;
        device.set_state(state);

        return;
      }

      // Get our list of responders so we can set their state
      Insteon.process_responders(insteon_device, state);

      if (device.capabilities.indexOf('motion_sensor') >= 0) {
        state = {
          '_motion': state._on,
          'last_seen': state.last_seen
        };

        if (!device._motion && state._motion) {
          state.last_on = state.last_seen;
        } else if (device._motion && !state._motion) {
          state.last_off = state.last_seen;
        }

        device.set_state(state);
      } else {

        if (!device._on && state._on) {
          state.last_on = state.last_seen;
        } else if (device._on && !state._on) {
          state.last_off = state.last_seen;
        }

        device.set_state(state);
      }
    });
  });
};

Insteon.process_responders = function (device, state) {
  var defer = Q.defer(),
    addr_split = device.config.address.split('.'),
    devices = abode.devices.get_by_provider('insteon'),
    group = (addr_split[0] === '00') ? parseInt(addr_split[2], 16) : 1,
    address = (addr_split[0] === '00') ? device.insteon.modem_info.address : device.config.address;

  device.responders().then(function (responders) {

    responders.forEach(function (responder) {
      // Look for our link entry in the responders database
      var db_entry = responder.config.database.filter(function (link) {
        return (link.address === address && !link.controller && link.group === group);
      });

      // If for some reason we don't have a match, move along
      if (db_entry.length === 0) {
        return;
      }

      // Get our Abode device
      var linked_device = devices.filter(function (device) {
        return (device.config && device.config.address === responder.config.address);
      });

      // If no Abode device found, skip device
      if (linked_device.length === 0) {
        return;
      }

      log.info('Setting state for responder: %s (%s)', linked_device[0].name, linked_device[0].config.address);
      linked_device[0].set_state({
        '_on': state._on,
        '_level': (state._on) ? parseInt(db_entry[0].on_level / 255 * 100, 10) : 0
      });

    });

    defer.resolve();

  }, function () {
    defer.reject();
  });

  return defer.promise;
};

Insteon.disable = function () {
  var defer = Q.defer();

  if (!Insteon.enabled) {
    defer.reject({'status': 'failed', 'message': 'Insteon is not enabled'});
    return defer.promise;
  }

  if (!Insteon.modem.connected) {
    defer.reject({'status': 'failed', 'message': 'Insteon is not connected'});
    Insteon.enabled = false;
    return defer.promise;
  }

  Insteon.modem.disconnect().then(function () {
    log.info('Provider Disabled');

    Insteon.enabled = false;
    defer.resolve({'status': 'success', 'message': 'Insteon disabled'});

  }, function (err) {
    defer.resolve(err);
  });

  return defer.promise;
};

Insteon.is_enabled = function (req, res, next) {
  if (Insteon.enabled) {
    next();
  } else {
    res.status(400).send({'status': 'failed', 'message': 'Insteon is not enabled and this action cannot be completed'});
  }
};

Insteon.get_device = function (address) {
  var defer = Q.defer();

  var matches = Insteon.devices.filter(function (device) {
    return (device.config.address === address);
  });

  if (matches.length > 0) {
    defer.resolve(matches[0]);
  } else {
    defer.reject({'message': 'Could not find device'});
  }

  return defer.promise;
};

Insteon.get_device_sync = function (address) {

  var matches = Insteon.devices.filter(function (device) {
    return (device.config.address === address);
  });

  if (matches.length > 0) {
    return matches[0];
  } else {
    return {'name': 'UNKNOWN'};
  }
};

Insteon.get_scene = function (address) {
  var defer = Q.defer();

  var matches = Insteon.scenes.filter(function (scene) {
    return (scene.config.address === address);
  });

  if (matches.length > 0) {
    defer.resolve(matches[0]);
  } else {
    defer.reject({'message': 'Could not find scene'});
  }

  return defer.promise;
};

Insteon.get_status = function (device) {

  return Insteon.device_command(device, 'get_status');

};

Insteon.is_open = Insteon.is_on = function (device) {
  var defer = Q.defer();

  Insteon.get_status(device).then(function (state) {
    defer.resolve({'update': state.update, 'response': state.on});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.is_closed = Insteon.is_off = function (device) {
  var defer = Q.defer();

  Insteon.get_status(device).then(function (state) {
    defer.resolve({'update': state.update, 'response': (!state.on)});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.has_motion = function (device) {
  var defer = Q.defer();

  log.debug('Checking Insteon motion status: %s', device.name);

  defer.resolve({'update': {'_motion': device._motion}, 'response': device._motion});

  return defer.promise;
};

Insteon.device_command = function (device, cmd) {
  var defer = Q.defer(),
    cmd_args = [];

  if (arguments.length > 2) {
    cmd_args = [].splice.call(arguments, 2, arguments.length - 2);
  }

  Insteon.get_device(device.config.address)
    .then(function (device) {

      if (typeof(device[cmd]) !== 'function') {
        log.error('Invalid device command: %s', cmd);
        return defer.reject({'status': 'failed', 'message': 'Invalid device command'});
      }

      device[cmd].apply(device, cmd_args)
        .then(defer.resolve)
        .fail(defer.reject);
    })
    .fail(defer.reject);

  return defer.promise;
};

Insteon.on = Insteon.open = function (device) {

  return Insteon.device_command(device, 'light_on');

};

Insteon.on_fast = function (device) {

  return Insteon.device_command(device, 'on_fast');

};

Insteon.start_brighten = function (device) {

  return Insteon.device_command(device, 'start_brighten');

};

Insteon.unlock = function (device) {

  return Insteon.device_command(device, 'unlock');

};

Insteon.lock = function (device) {

  return Insteon.device_command(device, 'lock');

};

Insteon.off = Insteon.close = function (device) {

  return Insteon.device_command(device, 'light_off');

};

Insteon.off_fast = function (device) {

  return Insteon.device_command(device, 'off_fast');

};

Insteon.start_dim = function (device) {

  return Insteon.device_command(device, 'start_dim');

};

Insteon.stop_change = function (device) {

  return Insteon.device_command(device, 'stop_change');

};

Insteon.set_level = function (device, level, time) {

  return Insteon.device_command(device, 'set_level', level, time);

};

Insteon.enter_linking_mode = function (device, group) {

  return Insteon.device_command(device, 'enter_linking_mode', group);

};

Insteon.enter_unlinking_mode = function (device, group) {

  return Insteon.device_command(device, 'enter_unlinking_mode', group);

};

Insteon.get_im_info = function () {
  var defer = Q.defer();

  log.info('Insteon.get_im_info()');

  var cmd = new Message();
  cmd.command = 'GET_IM_INFO';

  cmd.send(Insteon.modem).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.get_im_info = function () {
  var defer = Q.defer();

  log.debug('Insteon.get_im_info()');

  var cmd = new Message();
  cmd.command = 'GET_IM_INFO';

  cmd.send(Insteon.modem).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.get_im_configuration = function () {
  var defer = Q.defer();

  log.debug('Insteon.get_im_configuration()');

  var cmd = new Message();
  cmd.command = 'GET_IM_CONFIGURATION';

  cmd.send(Insteon.modem).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.start_all_linking = function (options) {
  var defer = Q.defer();
  options = options || {};

  log.debug('Insteon.start_all_linking()');
  Insteon.last_link = undefined;
  Insteon.linking = true;

  var cmd = new Message();
  cmd.command = 'START_ALL_LINKING';
  cmd.controller = options.controller;
  cmd.group = options.group;

  cmd.send(Insteon.modem).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.cancel_all_linking = function () {
  var defer = Q.defer();

  log.debug('Insteon.cancel_all_linking()');

  var cmd = new Message();
  cmd.command = 'CANCEL_ALL_LINKING';

  cmd.send(Insteon.modem).then(function (result) {
    Insteon.linking = false;
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.led_on = function () {
  var defer = Q.defer();

  log.debug('Insteon.led_on()');

  var cmd = new Message();
  cmd.command = 'LED_ON';

  cmd.send(Insteon.modem).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.led_off = function () {
  var defer = Q.defer();

  log.debug('Insteon.led_off()');

  var cmd = new Message();
  cmd.command = 'LED_OFF';

  cmd.send(Insteon.modem).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.get_first_all_link_record = function () {
  var defer = Q.defer();

  log.debug('Insteon.get_first_all_link_record()');

  var cmd = new Message();
  cmd.command = 'GET_FIRST_ALL_LINK_RECORD';
  cmd.retries = 1;

  cmd.send(Insteon.modem).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.get_next_all_link_record = function () {
  var defer = Q.defer();

  log.debug('Insteon.get_next_all_link_record()');

  var cmd = new Message();
  cmd.command = 'GET_NEXT_ALL_LINK_RECORD';
  cmd.retries = 1;

  cmd.send(Insteon.modem).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.exit_linking_mode = function (device) {

  return Insteon.device_command(device, 'exit_linking_mode');

};

Insteon.set_button_tap = function (device, taps) {

  return Insteon.device_command(device, 'set_button_tap', taps);

};

Insteon.id_request = function (device) {

  return Insteon.device_command(device, 'id_request');

};

Insteon.device_text_string_request = function (device) {

  return Insteon.device_command(device, 'device_text_string_request');

};

Insteon.beep = function (device, count) {

  return Insteon.device_command(device, 'beep', count);

};

Insteon.get_all_link_database_delta = function (device) {

  return Insteon.device_command(device, 'get_all_link_database_delta');

};

Insteon.ping = function (device, count) {

  return Insteon.device_command(device, 'ping', count);

};

Insteon.read_all_link_database = function (device, id) {
  var finish,
    set_timer,
    record_handler,
    records = [],
    record_timer,
    defer = Q.defer();

  log.info('Insteon.read_all_link_database(%s, %s)', device.config.address, id);

  record_handler = function (msg) {
    if (msg.from && msg.command && msg.from.toLowerCase() === device.config.address.toLowerCase() && msg.command.indexOf('ALL_LINK_DATABASE_RECORD') >= 0) {
      var existing = records.filter(function (record) {
        return (record.id === msg.record.id);
      });

      if (existing.length === 0) {
        log.info('Link Record Received');
        records.push(msg.record);
      } else {
        log.info('Duplicate Link Record Received');
      }

      if (id || msg.record.address === '00.00.00') {
        records.push(msg.record);
        clearTimeout(record_timer);
        finish();
      } else {
        set_timer();
      }
    }
  };

  finish = function () {
    Insteon.modem.removeListener('MESSAGE', record_handler);
    if (id) {
      if (records[0]) {
        defer.resolve(records[0]);
      } else {
        defer.reject({'status': 'failed', 'message': 'Record not found'});
      }
    } else {
      defer.resolve(records);
    }
  };

  set_timer = function () {
    if (record_timer) {
      clearTimeout(record_timer);
    }

    record_timer = setTimeout(function () {
      finish();
    }, 20000);

  };

  var wait_for_records = function () {
    set_timer();

    Insteon.modem.on('MESSAGE', record_handler);
  };

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'READ_WRITE_ALL_LINK_DATABASE';
  cmd.action = 'request';

  if (id) {
    cmd.record = id;
  }

  cmd.send(Insteon.modem).then(function () {
    wait_for_records();
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.write_all_link_database = function (device, id, config) {
  var self = this,
    defer = Q.defer();

  Insteon.read_all_link_database(device, id).then(function (record) {
    var cmd = new Message();

    cmd.to = device.config.address;
    cmd.command = 'READ_WRITE_ALL_LINK_DATABASE';

    cmd.record = id;
    cmd.address = config.address || record.address;
    cmd.group = config.group || record.group;
    cmd.flags = record.flags;
    cmd.on_level = config.on_level || record.on_level;
    cmd.ramp_rate = config.ramp_rate || record.ramp_rate;
    cmd.button = config.button || record.button;
    cmd.action = 'write';
    cmd.used = true;
    cmd.controller = config.controller || record.controller;
    cmd.responder = !cmd.controller;

    cmd.send(self.modem).then(function (response) {
      defer.resolve(response);
    }, function (err) {
      defer.reject(err);
    });

  }, function (err) {
    defer.reject({'status': 'failed', 'message': 'Could not find record to be modified', 'error': err});
  });

  return defer.promise;
};

Insteon.delete_all_link_database = function (device, id) {
  var self = this,
    defer = Q.defer();

  Insteon.read_all_link_database(device, id).then(function (record) {
    var cmd = new Message();

    cmd.to = device.config.address;
    cmd.command = 'READ_WRITE_ALL_LINK_DATABASE';

    cmd.record = id;
    cmd.address = record.address;
    cmd.group = record.group;
    cmd.flags = record.flags;
    cmd.on_level = record.on_level;
    cmd.ramp_rate = record.ramp_rate;
    cmd.button = record.button;
    cmd.flags = record.flags;
    cmd.flags.used = 0;
    cmd.flags.type = 0;
    cmd.controller = false;
    cmd.responder = true;
    cmd.used = false;
    cmd.flags.used_before = true;
    cmd.action = 'delete';

    cmd.send(self.modem).then(function (response) {
      defer.resolve(response);
    }, function (err) {
      defer.reject(err);
    });

  }, function (err) {
    defer.reject({'status': 'failed', 'message': 'Could not find record to be modified', 'error': err});
  });

  return defer.promise;
};

Insteon.read_operating_flags = function (device, flag) {

  return Insteon.device_command(device, 'read_operating_flags', flag);

};

Insteon.get_extended_data = function (device, group) {

  return Insteon.device_command(device, 'get_extended_data', group);

};

Insteon.set_heartbeat_interval = function (device, interval) {

  return Insteon.device_command(device, 'set_heartbeat_interval', interval);

};

Insteon.set_low_battery_level = function (device, level) {

  return Insteon.device_command(device, 'set_low_battery_level', level);

};

Insteon.update = function (device) {
  var abode_device = abode.devices.get(device.name);
  abode_device.set_state({'config': device.config, 'last_seen': new Date()});
};

Insteon.post_save = function (record) {
  var defer = Q.defer();
  var get_func;

  if (record.config.address.split('.')[0] === '00') {
    get_func = Insteon.get_scene;
  } else {
    get_func = Insteon.get_device;
  }

  get_func(record.config.address).then(function (device) {
    device.name = record.name;
    defer.resolve();
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.load_modem_database = function () {
  var devices = [],
    defer = Q.defer();

  var done = function () {
    devices = devices.map(function (result) {
      var device = {
        'controller': result.controller,
        'address': result.addr,
        'group': result.group,
        'on_level': result.on_level,
        'ramp_rate': result.ramp_rate,
        'button': result.button
      };

      var matches = Insteon.devices.filter(function (device) {
        return (device.config.address === result.addr);
      });

      if (matches.length > 0) {
        device.name = matches[0].name;
      }

      return device;
    });

    Insteon.database = devices;

    defer.resolve(devices);
  };

  var next = function () {
    Insteon.get_next_all_link_record().then(function (result) {
      devices.push(result);
      next();
    }, function () {
      done();
    });
  };

  Insteon.get_first_all_link_record().then(function (result) {
    devices.push(result);
    next();
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.request_device = function (req, res, next) {
  Insteon.get_device(req.params.device)
    .then(function (device) {
      req.device = device;
      next();
    })
    .fail(function (err) {
      res.status(404).send(err);
    });
};

Insteon.request_scene = function (req, res, next) {
  Insteon.get_scene(req.params.scene)
    .then(function (scene) {
      req.scene = scene;
      next();
    })
    .fail(function (err) {
      res.status(404).send(err);
    });
};

module.exports = Insteon;
