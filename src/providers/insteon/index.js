'use strict';

var abode,
  routes,
  Q = require('q'),
  utils = require('./utils'),
  logger = require('log4js'),
  Modem = require('./modem'),
  Device = require('./device'),
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
  Insteon.config.serial_device = Insteon.config.serial_device || '/dev/ttyUSB0';
  Insteon.config.polling_enabled = (Insteon.config.polling_enabled!==false);
  Insteon.config.poll_interval = Insteon.config.poll_interval || 5;
  Insteon.config.poll_wait = Insteon.config.poll_wait || 5;

  Insteon.modem = new Modem(Insteon.config);
  Insteon.modem.on('MESSAGE', Insteon.message_handler);
  Insteon.modem.on('linked', function (message) {
    Device(Insteon, message.result);
    Insteon.linking = false;
    Insteon.last_linked = message.result;
    log.info('Device Linked: %s', message.result.addr);

  });
  Insteon.modem.on('CLOSED', Insteon.disable);
  Insteon.enabled = false;
  Insteon.linking = false;
  Insteon.polling = false;

  abode.events.on('ABODE_STARTED', function () {
    Insteon.load_devices();
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


  return defer.promise;
};

Insteon.devices = [];
Insteon.statusable = [
  0x01,
  0x02,
  0x07
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
    attempt = attempt || 1;

    if (i === Insteon.devices.length) {
      return done();
    }
    var device = Insteon.devices[i]

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
      log.debug('Cannot status device type: %s (devcat: 0x%s)', device.name || device.address, utils.toHex(device.config.device_cat))
      i += 1;
      setTimeout(next, 100);
      return;
    }

    log.debug('Polling device: %s (devcat: 0x%s)', device.name || device.address, utils.toHex(device.config.device_cat));

    Insteon.get_status(device).then(function (result) {
      if (result.on !== device.on || result.level !== device.level) {

        Insteon.message_handler(result);
      }

      i += 1;
      setTimeout(next, Insteon.config.poll_wait * 1000);
    }, function () {
      log.error('Failed to get device status, trying again...');
      setTimeout(function () {
        next(attempt + 1);
      }, Insteon.config.poll_wait * 1000);
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
    new Device(Insteon, device.config, device.name);
  });

  log.info('here');
};

Insteon.message_handler = function (msg) {
  var devices, state = {};

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


  Insteon.get_device(msg.from).then(function (device) {
    if (msg.on !== undefined) device.on = msg.on;
    if (msg.level !== undefined) device.level = msg.level;
    device.last_seen = new Date();

    if (device.skip_command(msg.command[msg.command.length - 1])) {
      log.debug('Skipping cleanup command from %s (%s) to %s: %s', device.name, msg.from, msg.to, msg.command);
      return;
    }

    // Lookup the device
    log.debug('Looking for Abode device: %s', msg.from);
    devices = abode.devices.get_by_provider('insteon');
    devices = devices.filter(function (device) {
      return (device.config && device.config.address === msg.from);
    });

    if (devices.length === 0) {
      log.warn('No device found with address: %s', msg.from);
      return;
    }

    log.info('Message received: %s from %s (%s) for %s', msg.command, device.name, msg.from, msg.to);

    state.last_seen = new Date();

    devices.forEach(function (device) {
      if (device.capabilities.indexOf('motion_sensor') >= 0) {
        device.set_state({'_motion': state._on, 'last_seen': state.last_seen});
      } else {
        device.set_state(state);
      }
    });
  });
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
  };

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

Insteon.get_status = function (device) {
  var defer = Q.defer();

  if (device.capabilities && device.capabilities.indexOf('lock') !== -1) {
    log.debug('Insteon lock controller has no useful status');
    defer.resolve();
    return defer.promise;
  }
  log.info('Insteon.get_status(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'LIGHT_STATUS_REQUEST';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: result.on, _level: result.level};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
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

Insteon.on = Insteon.open = function (device) {
  var defer = Q.defer();

  log.info('Insteon.on(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'LIGHT_ON';

  cmd.send(Insteon.modem).then(function (result) {
    log.info('Successuflly sent ON command to %s', device.name);
    result.response = true;
    result.update = {_on: true, _level: device.config.on_level || 100};
    defer.resolve(result);
  }, function (err) {
    log.info('Failed to sent ON command to %s: %s', device.name, e);
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.on_fast = function (device) {
  var defer = Q.defer();

  log.info('Insteon.on_fast(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'LIGHT_ON_FAST';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: true, _level: device.config.on_level || 100};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.start_brighten = function (device) {
  var defer = Q.defer();

  log.info('Insteon.start_brighten(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'START_BRIGHTEN';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: true, _level: device.config.on_level || 100};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.unlock = function (device) {
  var defer = Q.defer();

  log.info('Insteon.off(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'LIGHT_LEVEL';
  cmd.cmd_2 = 0x00;

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: false, _level: 0};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.lock = function (device) {
  var defer = Q.defer();

  log.info('Insteon.off(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'LIGHT_LEVEL';
  cmd.cmd_2 = 0xff;

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: false, _level: 0};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.off = Insteon.close = function (device) {
  var defer = Q.defer();

  log.info('Insteon.off(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'LIGHT_OFF';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: false, _level: 0};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.off_fast = function (device) {
  var defer = Q.defer();

  log.info('Insteon.off_fast(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'LIGHT_OFF_FAST';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: false, _level: 0};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.start_dim = function (device) {
  var defer = Q.defer();

  log.info('Insteon.start_dim(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'START_DIM';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: true, _level: device.config.on_level || 100};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.stop_change = function (device) {
  var defer = Q.defer();

  log.info('Insteon.stop_change(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'STOP_CHANGE';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: true, _level: device.config.on_level || 100};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.set_level = function (device, level, time) {
  var cmd_2,
    rate,
    brightness,
    defer = Q.defer();

  log.info('Insteon.on(%s)', device.name);

  var cmd = new Message();
  cmd.command = 'LIGHT_LEVEL';
  cmd.to = device.config.address;

  if (time === undefined) {
    cmd.command = 'LIGHT_LEVEL';
    cmd_2 = (level / 100) * 255;
    cmd_2 = (cmd_2 > 255) ? 255 : cmd_2;
    cmd_2 = (cmd_2 < 0) ? 0 : cmd_2;
  } else {
    cmd.command = 'LIGHT_LEVEL_RATE';
    brightness = Math.round((15 * (parseInt(level, 10) / 100)));
    rate = Math.round(15 * (parseInt(time, 10) / 100));
    cmd_2 = (brightness << 4 | rate);
  }

  cmd.cmd_2 = parseInt(cmd_2, 10);

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    result.update = {_on: (level > 0), _level: level};
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
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

  cmd.send(Insteon.modem).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.enter_linking_mode = function (device) {
  var defer = Q.defer();

  log.info('Insteon.enter_linking_mode(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'ENTER_LINKING_MODE';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.enter_unlinking_mode = function (device) {
  var defer = Q.defer();

  log.info('Insteon.enter_unlinking_mode(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'ENTER_UNLINKING_MODE';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.set_button_tap = function (device, taps) {
  var defer = Q.defer();

  log.info('Insteon.set_button_tap(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'SET_BUTTON_TAP';
  cmd.cmd_2 = taps || 1;

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.product_data_request = function (device) {
  var defer = Q.defer();

  log.info('Insteon.product_data_request(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'ID_REQUEST';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.device_text_string_request = function (device) {
  var defer = Q.defer();

  log.info('Insteon.device_text_string_request(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'DEVICE_TEXT_STRING_REQUEST';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.beep = function (device) {
  var defer = Q.defer();

  log.info('Insteon.beep(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'BEEP';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.get_all_link_database_delta = function (device) {
  var defer = Q.defer();

  log.info('Insteon.get_all_link_database_delta(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'GET_ALL_LINK_DATABASE_DELTA';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.ping = function (device) {
  var defer = Q.defer();

  log.info('Insteon.ping(%s)', device.name);

  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'PING';

  cmd.send(Insteon.modem).then(function (result) {
    result.response = true;
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.read_all_link_database = function (device, id) {
  var records = [],
    record_timer,
    defer = Q.defer();

  log.info('Insteon.read_all_link_database(%s, %s)', device.config.address, id);


  var record_handler = function (msg) {
    if (msg.from.toLowerCase() === device.config.address.toLowerCase()
      && msg.command.indexOf('ALL_LINK_DATABASE_RECORD') >= 0) {
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

  var finish = function () {
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

  var set_timer = function () {
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

Insteon.get_extended_data = function (device) {
  var defer = Q.defer();
  var cmd = new Message();

  cmd.to = device.config.address;
  cmd.command = 'GET_SET_EXTENDED_DATA';
  cmd.d1 = 0x01;

  cmd.send(Insteon.modem).then(function (response) {
    defer.resolve(response.data);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.update = function (device) {
  var abode_device = abode.devices.get(device.name);
  abode_device.set_state({'config': device.config, 'last_seen': new Date()});
};

Insteon.post_save = function (record) {
  var defer = Q.defer();

  Insteon.get_device(record.config.address).then(function (device) {
    device.name = record.name;
    defer.resolve();
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

module.exports = Insteon;
