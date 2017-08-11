
var Q = require('q'),
  Message = require('./message'),
  logger = require('log4js'),
  log = logger.getLogger('insteon.device');

var Device = function (insteon, config, name) {
  'use strict';

  var self = this;

  self.name = name;
  self.config = Object.assign({}, config);
  self.insteon = insteon;
  self.config.database = self.config.database || {};

  var matches = self.insteon.devices.filter(function (device) {
    return (device.config.address === config.address);
  });

  if (matches.length === 0) {
    self.insteon.devices.push(self);
  } else {
    matches[0].update();
  }

  self.is_scene = (self.config.address.split('.')[0] === '00');

  return self;
};

Device.prototype.ping = function (max) {
  'use strict';

  var self = this,
    results = [],
    defer = Q.defer();
  max = max || 5;

  var next = function (count) {
    setTimeout(function () {
      ping(count);
    }, 200);
  };

  var ping = function (count) {

    if (count > max) {
      defer.resolve(results);
      return;
    }

    log.info('Pinging device %s: %s', self.config.address, count);

    var report = {
      'count': count,
      'start': new Date()
    };

    var cmd = new Message();

    cmd.to = self.config.address;
    cmd.command = 'PING';
    cmd.retries = 1;

    cmd.send(self.insteon.modem).then(function (result) {
      report.end = new Date();
      report.status = 'success';
      report.attempts = result.attempt;
      report.time = (report.end - report.start) / 1000;

      results.push(report);

      next(count + 1);
    }, function (err) {
      log.debug('Timeout waiting for ping');
      report.end = new Date();
      report.status = 'failed';
      report.time = (report.end - report.start) / 1000;
      report.error = err;

      results.push(report);

      next(count + 1);
    });

  };

  ping(1);

  return defer.promise;
};

Device.prototype.load_database = function () {
  'use strict';

  var delta,
    db = {},
    self = this,
    offset = 0x0fff,
    defer = Q.defer();

  var pad = function (o) {
    if (o.length < 2) {
      return '0' + o;
    }
    return o;
  };

  var finish = function () {
    log.info('Finished loading database');
    self.config.database_delta = delta;
    self.config.database = Object.keys(db).map(function (key) { return db[key]; });

    defer.resolve(self.config.database);
    self.status = 'idle';

    self.update();
  };

  var fail = function () {
    self.status = 'idle';
    log.error('Could not load device database: %s', self.name)
    defer.reject({'message': 'Gave up trying to get records'});
  };

  var get_record = function (attempt) {
    var offset_hi = pad((offset >> 8).toString(16)),
      offset_lo = pad((offset & 0xff).toString(16)),
      offset_str = offset_hi + '.' + offset_lo;

    // Check our attempt
    attempt = attempt || 1;
    if (attempt > 3) {
      fail();
      return;
    }

    // Get record at offset
    self.read_all_link_database(offset_str).then(function (result) {
      if (result.address === '00.00.00' || result.flags.used_before === 0) {
        db[offset_str] = result;
        finish();
        return;
      }

      var matches = self.insteon.devices.filter(function (device) {
        return (device.config.address === result.address);
      });

      if (matches.length > 0) {
        result.name = matches[0].name;
      }
      result.delta = delta;
      db[offset_str] = result;
      offset -= 8;
      setTimeout(get_record, 200);
    }, function () {
    // If failed, try again
      setTimeout(function () {
        get_record(attempt + 1);
      }, 500);
    });
  };

  // Get our database delta
  var get_delta = function () {
    self.get_all_link_database_delta().then(function (result) {
      delta = result.database_delta;
      get_record();
    }, function (err) {
      defer.reject(err);
    });
  };

  if (self.status === 'loading_database') {
    log.error('Attmpted to load database when process already in progress');
    defer.reject({'status': 'failed', 'message': 'Device database load in process'});
    return defer.promise;
  }

  self.status = 'loading_database';

  get_delta();

  return defer.promise;
};

Device.prototype.get_delta = Device.prototype.get_all_link_database_delta = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.get_all_link_database_delta(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'GET_ALL_LINK_DATABASE_DELTA';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent GET_ALL_LINK_DATABASE_DELTA command to %s', self.name || self.config.address);
      defer.resolve({'database_delta': result.database_delta});
    })
    .fail(function (err) {
      log.info('Failed to send GET_ALL_LINK_DATABASE_DELTA command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.validate_record = function (config, create) {
  var errors = [];
  create = create || false;

  if ((create && config.group === undefined)
    && (Number.isInteger(config.group) || config.group < 0 || config.group > 255)) {
    errors.push({'message': 'Invalid group value', 'field': 'group'});
  }

  if ((create && config.on_level === undefined)
    && (!Number.isInteger(config.on_level) || config.on_level < 0 || config.on_level > 255)) {
    errors.push({'message': 'Invalid on_level value', 'field': 'on_level'});
  }

  if ((create && config.ramp_rate === undefined)
    && (!Number.isInteger(config.ramp_rate) || config.ramp_rate < 0 || config.ramp_rate > 31)) {
    errors.push({'message': 'Invalid ramp_rate value', 'field': 'ramp_rate'});
  }

  if ((create && config.button === undefined)
    && (!Number.isInteger(config.button) || config.button < 0 || config.button > 255)) {
    errors.push({'message': 'Invalid button value', 'field': 'button'});
  }
  if ((create && config.controller === undefined)
    && (typeof config.controller !== 'boolean')) {
    errors.push({'message': 'Invalid controller value', 'field': 'controller'});
  }

  if ((create && config.address === undefined)
    && (typeof config.address !== 'string' || config.address.split('.').length !== 3)) {
    errors.push({'message': 'Invalid address value', 'field': 'address'});
  }

  return errors;
};

Device.prototype.create_record = function (config) {
  var errors,
    self = this,
    defer = Q.defer();


  self.get_delta().then(function (result) {
    if (result.database_delta !== self.config.database_delta) {
      defer.reject({'message': 'Database out of sync. Perform a load first'});
      return;
    }

    var db_match = self.config.database.filter(function (record) {
      return (config.group === record.group && config.address === record.address && config.controller === record.controller);
    });

    if (db_match.length > 0) {
      defer.reject({'message': 'Record of this type, device and scene already exists'});
      return;
    }

    self.next_free_id().then(function (response) {
      var record = {
        'controller': config.controller,
        'address': config.address,
        'group': config.group,
        'on_level': config.on_level,
        'ramp_rate': config.ramp_rate,
        'button': config.button
      };

      errors = Device.validate_record(record, true);

      if (errors.length > 0) {
        return defer.reject({'message': 'Record validation error', 'errors': errors});
      }

      self.insteon.write_all_link_database(self, response.id, record).then(function (response) {
        defer.resolve(response);
      }, function (err) {
        defer.reject(err);
      });

    }, function (err) {
      defer.reject(err);
    });

  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Device.prototype.get_record = function (offset) {
  var self = this,
    defer = Q.defer();

  var matches = self.config.database.filter(function (record) {
    return (record.id === offset);
  });

  if (matches.length > 0) {
    defer.resolve(matches[0]);
  } else {
    defer.reject({'message': 'Record not found, try doing a database load'});
  }

  return defer.promise;
};

Device.prototype.update_record = function (id, config) {
  var errors,
    self = this,
    defer = Q.defer();

  var record = {
    'controller': config.controller,
    'address': config.address,
    'group': config.group,
    'on_level': config.on_level,
    'ramp_rate': config.ramp_rate,
    'button': config.button
  };

  errors = Device.validate_record(record);

  if (errors.length > 0) {
    defer.reject({'message': 'Record validation error', 'errors': errors});
    return defer.promise;
  }

  self.get_delta().then(function (result) {
    if (result.database_delta !== self.config.database_delta) {
      defer.reject({'message': 'Database out of sync. Perform a load first'});
      return;
    }

    self.insteon.write_all_link_database(self, id, record).then(function (response) {
      defer.resolve(response);
    }, function (err) {
      defer.reject(err);
    });

  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Device.prototype.delete_record = function (offset) {
  var self = this,
    defer = Q.defer();

  self.get_delta().then(function (result) {
    if (result.database_delta !== self.config.database_delta) {
      defer.reject({'message': 'Database out of sync. Perform a load first'});
      return;
    }

    self.insteon.delete_all_link_database(self, offset).then(function (result) {
      self.config.database_delta =+ 1;
      self.config.database.forEach(function (record) {
        if (record.id === offset) {
          record.flags.used = 0;
          record.flags.used_before = true;
          record.flags.type = 0;
          record.controller = false;
          record.responder = true;
          record.used = false;
        }
      });
      defer.resolve(result);

      self.update();
    }, function (err) {
      defer.reject(err);
    });

  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Device.prototype.read_all_link_database = function (offset) {
  var self = this,
    defer = Q.defer();

  self.insteon.read_all_link_database(self, offset).then(function (result) {
    defer.resolve(result);
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Device.prototype.next_free_id = function () {
  var i,
    found,
    total,
    self = this,
    defer = Q.defer();

  var find_next = function () {
    total = self.config.database.length;

    for (i=0; i<total; i+=1) {
      if (self.config.database[i].used === false) {
        found = self.config.database[i].id;
        break;
      }
    }

    if (found !== undefined) {
      defer.resolve({'id': found, 'database_delta': self.config.database_delta, 'record': self.config.database[i]});
    } else {
      defer.reject({'message': 'Could not find next free id'});
    }
  };

  this.get_delta().then(function (response) {
    if (response.database_delta !== self.config.database_delta) {
      self.load_database().then(find_next, function err() {
        defer.reject(err);
      });
    } else {
      find_next();
    }
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Device.prototype.update = function () {
  return this.insteon.update(this);
};

Device.prototype.skip_command = function (command) {
  var self = this;

  // If our last command is the same, ignore it
  if (self.last_command === command) {

    // If we have a timer, clear it
    if (self.cleanup_timer) {
      clearTimeout(self.cleanup_timer);
    }

    // Setup our timer
    self.cleanup_timer = setTimeout(function () {
      self.last_command = undefined;
      self.cleanup_timer = undefined;
    }, 5000);

    return true;
  }

  // Set our last command
  self.last_command = command;

  return false;
};

Device.prototype.set_button_tap = function (taps) {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.set_button_tap(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'SET_BUTTON_TAP';
  cmd.cmd_2 = taps || 1;

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent SET_BUTTON_TAP command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send SET_BUTTON_TAP command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.id_request = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.id_request(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'ID_REQUEST';

  cmd.send(self.insteon.modem)
    .then(function (result) {

      self.config.device_cat = result.devcat;
      self.config.device_subcat = result.subcat;
      self.config.firmware = result.firmware;

      self.update();

      log.info('Successuflly sent ID_REQUEST command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send ID_REQUEST command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.product_data_request = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.product_data_request(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'PRODUCT_DATA_REQUEST';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent PRODUCT_DATA_REQUEST command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send ID_REQUEST command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.device_text_string_request = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.device_text_string_request(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'DEVICE_TEXT_STRING_REQUEST';

  cmd.send(self.insteon.modem)
    .then(function (result) {

      log.info('Successuflly sent DEVICE_TEXT_STRING_REQUEST command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send DEVICE_TEXT_STRING_REQUEST command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.read_operating_flags = function (flag) {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.read_operating_flags(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'READ_OPERATING_FLAGS';
  cmd.cmd_2 = flag || 0x00;

  cmd.send(self.insteon.modem)
    .then(function (result) {

      log.info('Successuflly sent READ_OPERATING_FLAGS command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send READ_OPERATING_FLAGS command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.get_extended_data = function (group) {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.get_extended_data(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'GET_SET_EXTENDED_DATA';
  cmd.d1 = group || 0x00;

  cmd.send(self.insteon.modem)
    .then(function (result) {

      log.info('Successuflly sent GET_SET_EXTENDED_DATA command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send GET_SET_EXTENDED_DATA command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.set_extended_data = function (data) {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.set_extended_data(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'GET_SET_EXTENDED_DATA';
  cmd.cmd_1 = 0x2e;
  cmd.d1 = data.d1 || 0;
  cmd.d2 = data.d2 || 0;
  cmd.d3 = data.d3 || 0;
  cmd.d4 = data.d4 || 0;
  cmd.d5 = data.d5 || 0;
  cmd.d6 = data.d6 || 0;
  cmd.d7 = data.d7 || 0;
  cmd.d8 = data.d8 || 0;
  cmd.d9 = data.d9 || 0;
  cmd.d10 = data.d10 || 0;
  cmd.d11 = data.d11 || 0;
  cmd.d12 = data.d12 || 0;
  cmd.d13 = data.d13 || 0;
  cmd.make_crc();

  cmd.send(self.insteon.modem)
    .then(function (result) {

      log.info('Successuflly sent GET_SET_EXTENDED_DATA command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send GET_SET_EXTENDED_DATA command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.set_heartbeat_interval = function (interval) {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.set_heartbeat_interval(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'GET_SET_EXTENDED_DATA';
  cmd.cmd_1 = 0x2e;
  cmd.d1 = 0x00;
  cmd.d2 = 0x02;
  cmd.d3 = interval;
  cmd.make_crc();

  cmd.send(self.insteon.modem)
    .then(function (result) {

      log.info('Successuflly sent GET_SET_EXTENDED_DATA command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send GET_SET_EXTENDED_DATA command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.set_low_battery_level = function (level) {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.set_low_battery_level(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'GET_SET_EXTENDED_DATA';
  cmd.cmd_1 = 0x2e;
  cmd.d1 = 0x00;
  cmd.d2 = 0x03;
  cmd.d3 = level;
  cmd.make_crc();

  cmd.send(self.insteon.modem)
    .then(function (result) {

      log.info('Successuflly sent GET_SET_EXTENDED_DATA command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send GET_SET_EXTENDED_DATA command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.beep = function (count) {
  'use strict';

  var i = 0,
    self = this,
    response = {},
    success = [],
    errors = [],
    defer = Q.defer();

  count = count || 1;

  var do_beep = function () {

    log.info('Insteon.beep(%s)', self.name);
    i += 1;

    if (i > count) {
      response.errors = errors;
      response.successes = success;
      if (response.errors.length === count) {
        response.response = false;
        return defer.reject(response);
      } else {
        response.response = true;
        return defer.resolve(response);
      }
    }

    var cmd = new Message();

    cmd.to = self.config.address;
    cmd.command = 'BEEP';

    cmd.send(self.insteon.modem).then(function (result) {
      success.count = i;
      success.push(result);
      setTimeout(do_beep, 500);
    }, function (err) {
      err.count = i;
      errors.push(err);
      setTimeout(do_beep, 500);
    });
  };

  do_beep();

  return defer.promise;
};

Device.prototype.enter_linking_mode = function (group) {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.enter_linking_mode(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'ENTER_LINKING_MODE';
  cmd.group = group;

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent ENTER_LINKING_MODE command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send ENTER_LINKING_MODE command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.enter_unlinking_mode = function (group) {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.enter_unlinking_mode(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'ENTER_UNLINKING_MODE';
  cmd.group = group;

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent ENTER_UNLINKING_MODE command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send ENTER_UNLINKING_MODE command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.exit_linking_mode = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.exit_linking_mode(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'EXIT_LINKING_MODE';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent EXIT_LINKING_MODE command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send EXIT_LINKING_MODE command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.set_button_tap = function (taps) {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.set_button_tap(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'SET_BUTTON_TAP';
  cmd.cmd_2 = taps || 1;

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent SET_BUTTON_TAP command to %s', self.name || self.config.address);
      result.response = true;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send SET_BUTTON_TAP command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.get_status = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.get_status(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'LIGHT_STATUS_REQUEST';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent LIGHT_STATUS_REQUEST command to %s', self.name || self.config.address);
      result.response = {_on: result.on, _level: result.level};
      result.update = {_on: result.on, _level: result.level};
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send LIGHT_STATUS_REQUEST command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.light_on = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.on(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'LIGHT_ON';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent ON command to %s', self.name || self.config.address);
      result.response = true;
      result.update = {_on: true, _level: self.config.on_level || 100};
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send ON command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.on_fast = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.on_fast(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'LIGHT_ON_FAST';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent ON_FAST command to %s', self.name || self.config.address);
      result.response = true;
      result.update = {_on: true, _level: self.config.on_level || 100};
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send ON_FAST command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.start_brighten = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.start_brighten(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'START_BRIGHTEN';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent START_BRIGHTEN command to %s', self.name || self.config.address);
      result.response = true;
      result.update = {_on: true, _level: self.config.on_level || 100};
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send START_BRIGHTEN command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.light_off = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.on(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'LIGHT_OFF';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent OFF command to %s', self.name || self.config.address);
      result.response = true;
      result.update = {_on: false, _level: 0};
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send OFF command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.off_fast = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.off_fast(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'LIGHT_OFF_FAST';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent OFF_FAST command to %s', self.name || self.config.address);
      result.response = true;
      result.update = {_on: false, _level: 0};;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send OFF_FAST command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.start_dim = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.start_dim(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'START_DIM';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent START_DIM command to %s', self.name || self.config.address);
      result.response = true;
      result.update = {_on: true, _level: self.config.on_level || 100};
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send START_DIM command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.stop_change = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.stop_change(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'STOP_CHANGE';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent STOP_CHANGE command to %s', self.name || self.config.address);
      result.response = true;
      result.update = {_on: true, _level: self.config.on_level || 100};
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send STOP_CHANGE command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.set_level = function (level, time) {
  'use strict';

  var rate,
    cmd_2,
    brightness,
    self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.set_level(%s)', self.name);

  cmd.to = self.config.address;

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

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent %s command to %s', cmd.command, self.name || self.config.address);
      result.response = true;
      result.update = {_on: (level > 0), _level: level};;
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send %s command to %s: %s', cmd.command, self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.unlock = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.unlock(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'LIGHT_LEVEL';

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent UNLOCK command to %s', self.name || self.config.address);
      result.response = true;
      result.update = {_on: false, _level: 0};
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send UNLOCK command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

Device.prototype.lock = function () {
  'use strict';

  var self = this,
    defer = Q.defer(),
    cmd = new Message();

  log.info('Insteon.lock(%s)', self.name);

  cmd.to = self.config.address;
  cmd.command = 'LIGHT_LEVEL';
  cmd.cmd_2 = 0xff;

  cmd.send(self.insteon.modem)
    .then(function (result) {
      log.info('Successuflly sent LOCK command to %s', self.name || self.config.address);
      result.response = true;
      result.update = {_on: false, _level: 0};
      defer.resolve(result);
    })
    .fail(function (err) {
      log.info('Failed to send LOCK command to %s: %s', self.name, err);
      defer.reject(err);
    });

  return defer.promise;
};

module.exports = Device;
