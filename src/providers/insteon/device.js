
var Q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('insteon');

var Device = function (insteon, config, name) {
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
    if (name !== undefined) {
      matches[0].name = name;
    }
    if (config.device_cat !== undefined) {
      matches[0].config.device_cat = config.device_cat;
    }
    if (config.device_subcat !== undefined) {
      matches[0].config.device_subcat = config.device_subcat;
    }
    if (config.firmware !== undefined) {
      matches[0].config.firmware = config.firmware;
    }
    matches[0].update();
  }

  return self;
};

Device.prototype.ping = function (max) {
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

    self.insteon.ping(self).then(function () {
      report.end = new Date();
      report.status = 'success';
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

Device.prototype.beep = function () {
  return this.insteon.beep(this);
};

Device.prototype.product_data_request = function () {
  return this.insteon.product_data_request(this);
};

Device.prototype.load_database = function () {
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

    self.update();
  };

  var fail = function () {
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

  get_delta();

  return defer.promise;
};

Device.prototype.get_delta = Device.prototype.get_all_link_database_delta = function () {
  var self = this,
    defer = Q.defer();

  log.debug('Getting database delta for device: %s', self.config.address);
  this.insteon.get_all_link_database_delta(self).then(function (response) {
    defer.resolve({'database_delta': response.database_delta});
  }, function (err) {
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

module.exports = Device;
