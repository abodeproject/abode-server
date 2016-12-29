'use strict';

var abode;
var rooms;
var routes;
var providers;

var mongoose = require('mongoose');
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('devices');

var DeviceLogSchema = mongoose.Schema({
  'device': mongoose.Schema.Types.ObjectId,
  'created': { 'type': Date, 'default': Date.now },
  'extra': Object,
  'command': String,
  'to':  Object,
  'from':  Object,
});

// Build the devices object
var Devices = function () {
  rooms = require('../rooms');
  providers = require('../providers');
  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/api/devices', routes);

  return Devices.load();
};

//Build an array of capabilities we'll support
Devices.capabilities = [
  'light',
  'dimmer',
  'appliance',
  'conditioner',
  'fan',
  'motion',
  'motion_sensor',
  'temperature_sensor',
  'humidity_sensor',
  'moisture_sensor',
  'light_sensor',
  'window',
  'door',
  'shade',
  'scene',
  'openclose',
  'io',
  'weather',
  'video',
  'onoff',
  'display',
  'camera',
  'client',
  'browser',
  'sensor',
  'siren',
  'lock'
];
Devices._devices = [];
Devices.logs = mongoose.model('DeviceLogs', DeviceLogSchema);

//Define the device schema
var DeviceSchema = mongoose.Schema({
  'name': {
    'type': String,
    'required': true,
    'unique': true,
    'index': true
  },
  'description': {'type': String},
  'tags': {'type': Array, 'default': []},
  'capabilities': {'required': true, 'type': [{
    'type': String,
    'require': true,
    'validate': {
      validator: function(v) {
        return (Devices.capabilities.indexOf(v) !== -1);
      },
      message: '{VALUE} is not a valid capability'
    }
  }]},
  'provider': String,
  '_image': String,
  '_video': String,
  'last_on': Date,
  'last_off': Date,
  'active': {'type': Boolean, 'default': true},
  'low_battery': {'type': Boolean, 'default': false},
  '_rooms': Array,
  '_on': {'type': Boolean, 'default': false},
  '_level': {'type': Number, 'default': 0},
  '_temperature': {'type': Number, 'default': 0},
  '_humidity': {'type': Number, 'default': 0},
  '_lumens': {'type': Number, 'default': 0},
  '_mode': {'type': String},
  '_set_point': {'type': Number},
  '_moon': Object,
  '_weather': Object,
  '_forecast': Array,
  '_hourly': Array,
  '_alerts': Array,
  'config': Object,
  'last_seen': Date,
});

// Add a method to send commands to the devices provider
DeviceSchema.methods.send_command = function (cmd, args, cache, key, value) {
  var msg,
    self = this,
    defer = q.defer();

  if (cache === undefined) {
    cache = false;
  }

  args = (args instanceof Array) ? args : [args];
  args.unshift(self);

  if ((this.active === false || cache === true) && key !== undefined) {
    if (value !== undefined) {
      defer.resolve((this[key] === value));
    } else {
      defer.resolve(this[key]);
    }
    return defer.promise;
  }

  //Check for the command within the providers object
  if (!providers[self.provider]) {
    msg = 'Provider not loaded for device ' + self.name + ': ' + self.provider;
    log.error(msg);
    defer.reject({'status': 'failed', 'msg': msg});
    return defer.promise;
  }
  if (providers[self.provider][cmd] === undefined) {
    msg = 'Command not available for device ' + self.name + ': ' + cmd;
    log.error(msg);
    defer.reject({'status': 'failed', 'msg': msg});
    return defer.promise;
  }

  //Call the function and expect a promise back
  providers[self.provider][cmd].apply(self, args).then(function (status) {
    var changes = false;
    status.update = status.update || {};

    // If our status contained an "update" flag, update the device
    Object.keys(status.update).forEach(function (key) {
      log.debug('Setting device attribute: ' + key + ' = ' + status.update[key]);
      if (JSON.stringify(self[key]) !== JSON.stringify(status.update[key])) {
        changes = true;
        self[key] = status.update[key];
      }
    });

    // Update the last_seen field
    self.last_seen = new Date();

    // Save the device
    self._save(changes).then(function () {
      defer.resolve(status.response);
    }, function (err) {
      defer.reject(err);
    });
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

DeviceSchema.methods.get_age = function (key, status, date_field) {
  var self = this,
    defer = q.defer();

  if (self[key] !== status || self[date_field] === undefined) {
    defer.resolve(0);
  } else {
    var now = new Date(),
      age = (now - self[date_field]) / 1000;

    defer.resolve(parseInt(age, 10));
  }
  return defer.promise;
};

// Define the standard methods for a device
DeviceSchema.methods.on = function () { return this.send_command('on', undefined, false); };
DeviceSchema.methods.off = function () { return this.send_command('off', undefined, false); };
DeviceSchema.methods.open = function () { return this.send_command('open', undefined, false); };
DeviceSchema.methods.close = function () { return this.send_command('close', undefined, false); };
DeviceSchema.methods.lock = function () { return this.send_command('lock', undefined, false); };
DeviceSchema.methods.unlock = function () { return this.send_command('unlock', undefined, false); };
DeviceSchema.methods.set_level = function (level, rate) { return this.send_command('set_level', [level, rate], false); };
DeviceSchema.methods.set_point = function (level, cache) { return this.send_command('set_point', level, cache); };
DeviceSchema.methods.set_mode = function (mode) { return this.send_command('set_mode', mode, false); };
DeviceSchema.methods.set_humidity = function (level) { return this.send_command('set_humidity', level, false); };
DeviceSchema.methods.status = function () { return this.send_command('get_status', undefined, false); };
DeviceSchema.methods.play = function (url, duration) { return this.send_command('play', [url, duration], false); };

DeviceSchema.methods.is_on = DeviceSchema.methods.is_open = function (cache) { return this.send_command('is_on', undefined, cache, '_on', true); };
DeviceSchema.methods.is_off = DeviceSchema.methods.is_closed = function (cache) { return this.send_command('is_off', undefined, cache, '_on', false); };

DeviceSchema.methods.on_time = DeviceSchema.methods.open_time = function () { return this.get_age('_on', true, 'last_on'); };
DeviceSchema.methods.off_time = DeviceSchema.methods.closed_time = function () { return this.get_age('_on', false, 'last_off'); };

DeviceSchema.methods.level = function (cache) { return this.send_command('level', undefined, cache, '_level'); };
DeviceSchema.methods.temperature = function (cache) { return this.send_command('temperature', undefined, cache, '_temperature'); };
DeviceSchema.methods.mode = function (cache) { return this.send_command('mode', undefined, cache, '_mode'); };
DeviceSchema.methods.humidity = function (cache) { return this.send_command('humidity', undefined, cache, '_humidity'); };
DeviceSchema.methods.lumens = function (cache) { return this.send_command('lumens', undefined, cache, '_lumens'); };
DeviceSchema.methods.motion = function (cache) { return this.send_command('is_on', undefined, cache, '_on', true); };
DeviceSchema.methods.weather = function (cache) { return this.send_command('weather', undefined, cache, '_weather'); };
DeviceSchema.methods.forecast = function (cache) { return this.send_command('forecast', undefined, cache, '_forecast'); };
DeviceSchema.methods.moon = function (cache) { return this.send_command('moon', undefined, cache, '_moon'); };
DeviceSchema.methods.alerts = function (cache) { return this.send_command('alerts', undefined, cache, '_alerts'); };

// Define the function that resolves all rooms to room objects
DeviceSchema.methods.set_state = function (config, log_msg, options) {
  var self = this,
    changes = false,
    made_event = false;

  options = options || {};
  log.debug('Setting device state for %s: ', self.name, config);

  var int_events = {
    '_temperature': 'TEMPERATURE',
    '_humidity': 'HUMIDITY',
    '_lumens': 'LUMACITY',
    '_set_point': 'SET_POINT',
    '_level': 'LEVEL',
  };

  Object.keys(config).forEach(function (key) {

    if (int_events[key]) {
      if (Math.floor(self[key]) !== Math.floor(config[key])) {
        changes = true;
        self[key] = config[key];

        abode.events.emit(int_events[key] + '_CHANGE', {'name': self.name, 'type': 'device', 'object': self});
        log.debug('Emitting ' + int_events[key] + '_CHANGE for', {'name': self.name, 'type': 'device'});
      }
      if (Math.floor(self[key]) !== Math.floor(config[key]) && Math.floor(self[key]) < Math.floor(config[key])) {
        abode.events.emit(int_events[key] + '_UP', {'name': self.name, 'type': 'device', 'object': self});
        log.debug('Emitting ' + int_events[key] + '_UP for', {'name': self.name, 'type': 'device'});
      }
      if (Math.floor(self[key]) !== Math.floor(config[key]) && Math.floor(self[key]) > Math.floor(config[key])) {
        abode.events.emit(int_events[key] + '_DOWN', {'name': self.name, 'type': 'device', 'object': self});
        log.debug('Emitting ' + int_events[key] + '_DOWN for', {'name': self.name, 'type': 'device'});
      }
    }

    // Check for event triggers
    switch (key) {
      case '_on':
        if (config[key] === true && self[key] !== true) {
          changes = true;
          self[key] = config[key];

          self.last_on = new Date();
          if (self.capabilities.indexOf('motion_sensor') !== -1) {
            abode.events.emit('MOTION_ON', {'type': 'device', 'name': self.name, 'object': self});
            log.debug('Emitting MOTION_ON for', {'type': 'device', 'name': self.name});
          } else if (self.capabilities.indexOf('openclose') !== -1) {
            abode.events.emit('OPEN', {'type': 'device', 'name': self.name, 'object': self});
            log.debug('Emitting OPEN for', {'type': 'device', 'name': self.name});
          } else {
            abode.events.emit('ON', {'type': 'device', 'name': self.name, 'object': self});
            log.debug('Emitting ON for', {'type': 'device', 'name': self.name});
          }
        }
        if (config[key] === false && self[key] !== false) {
          changes = true;
          self[key] = config[key];

          self.last_off = new Date();
          if (self.capabilities.indexOf('motion_sensor') !== -1) {
            abode.events.emit('MOTION_OFF', {'type': 'device', 'name': self.name, 'object': self});
            log.debug('Emitting MOTION_OFF for', {'type': 'device', 'name': self.name});
          } else if (self.capabilities.indexOf('openclose') !== -1) {
            abode.events.emit('CLOSE', {'type': 'device', 'name': self.name, 'object': self});
            log.debug('Emitting CLOSE for', {'type': 'device', 'name': self.name});
          } else {
            abode.events.emit('OFF', {'type': 'device', 'name': self.name, 'object': self});
            log.debug('Emitting OFF for', {'type': 'device', 'name': self.name});
          }
        }
        made_event = true;
        break;
      case 'low_battery':
        if (config[key] === true && self[key] !== true) {
          changes = true;
          self[key] = config[key];

          self.last_off = new Date();
          abode.events.emit('LOW_BATTERY', self);
          log.info('Emit LOW_BATTERY for ', {'type': 'device', 'name': self.name, 'object': self});
        }
        made_event = true;
        break;
    }

    // Update the key on the object if different
    if (JSON.stringify(self[key]) !== JSON.stringify(config[key])) {
      changes = true;
      self[key] = config[key];
    }
  });

  if (log_msg) {
    self.log_entry(log_msg);
  }

  if (made_event) {
    self.get_rooms().forEach(function (room) {
      room.status(true);
    });
  }

  return self._save(log_msg, options);

  /*
  //Save if changes have been made, otherwise return a resolve defer
  if (changes) {
    return self._save();
  } else {
    //abode.events.emit('UPDATED', {'type': 'device', 'name': self.name, 'object': self});
    var defer = q.defer();
    defer.resolve();
    return defer.promise;
  }
  */
};

DeviceSchema.methods.log_entry = function () {
  var self = this,
    defer = q.defer();
  //var entry = new Devices.logs();

  log.debug('Adding log entry for device: ', self.name);

  /*
  entry.device = this._id;
  entry.created = new Date();

  Object.keys(msg).forEach(function (key) {
    entry[key] = msg[key];
  });

  entry.save(function (err) {
    if (err) {
      log.error('Device failed to save log:', self.name);
      log.debug(err.message || err);
      defer.reject(err);
    } else {
      log.info('Device log saved successfully: ' + self.name);
      defer.resolve();
    }
  });
  */
  defer.resolve();

  return defer.promise;
};

DeviceSchema.methods.logs = function (config) {
  var self = this,
    defer = q.defer();

  config = config || {};
  config.limit = config.limit || 10;
  config.sort = config.sort || '-created';

  var query = Devices.logs.find({'device': self._id})
  .sort(config.sort)
  .limit(config.limit);

  query.exec(function (err, logs) {
    if (err) {
      defer.reject(err);
      return defer.promise;
    }

    defer.resolve(logs);
  });

  return defer.promise;
};

// Define the function that resolves all rooms to room objects
DeviceSchema.methods.get_rooms = function () {
  var self = this,
    items = [];

  self._rooms.forEach(function (item) {
    var room = rooms.get_by_id(item);
    if (room !== false) {
      items.push(room);
    }
  });

  return items;
};

// Define a save function that returns an promise instead of using a callback
DeviceSchema.methods._save = function (log_save, options) {
  var self = this,
    //changed = self.modifiedPaths(),
    defer = q.defer();

  options = options || {};
  log_save = (log_save === undefined) ? true : log_save;

  var doSave = function () {
    if (self.isModified()) {
      self.save(function (err) {
        if (err) {
          log.error('Device failed to save:', self.name);
          log.error(err);

          defer.reject(err);
          return;
        }

        log.debug('Device saved successfully: ' + self.name);
        abode.events.emit('UPDATED', {'type': 'device', 'name': self.name, 'object': self});

        if (abode.providers[self.provider] && abode.providers[self.provider].post_save && options.skip_post !== true) {
          abode.providers[self.provider].post_save(self).then(function () {
            log.debug('Provider post-save completed for %s: %s', self.provider, self.name);
            defer.resolve();
          }, function () {
            log.error('Provider post-save failed for %s: %s', self.provider, self.name);
            log.debug(err.message || err);
            defer.reject(err);
          });
        } else {
          defer.resolve();
        }
      });

    } else {
      log.debug('Device not modified: ' + self.name);
      defer.resolve();
    }
  };

  if (abode.providers[self.provider] && abode.providers[self.provider].pre_save && options.skip_pre !== true) {
    abode.providers[self.provider].pre_save(self).then(function () {
      log.debug('Provider pre-save completed: ' + self.name);
      doSave();
    }, function (err) {
      log.error('Provider pre-save failed for %s: %s', self.provider, self.name);
      log.debug(err.message || err);
      defer.reject(err);
    });
  } else {
    doSave();
  }

  return defer.promise;
};

// Define a delete function that cleans up rooms
DeviceSchema.methods.delete = function () {
  var self = this,
    defer = q.defer();

    // Once all rooms are cleaned, remove the device
    var complete = function () {
      self.remove(function (err) {
        if (err) {
          log.error('Error deleting device: ', err);
          return defer.reject(err);
        }

        // Reload the devices
        Devices.load().then(function () {
          log.info('Device Deleted: ', self.name);
          defer.resolve();
        }, function (err) {
          log.error('Failed to reload devices');
          defer.reject(err);
        });

      });
    };

    // Clean remove the device from the next room
    var clean_room = function () {
      //Look for rooms remaining.
      if (self._rooms.length > 0) {
        var room = rooms.get_by_id(self._rooms[0]);
        log.debug('Cleaning room: ', self._rooms[0]);

        room.remove_device(self).then(function () {
          clean_room();
        }, function (err) {
          log.error('Error cleaning room: ', err);
          defer.reject(err);
        });
      } else {
        complete();
      }
    };

    clean_room();

    return defer.promise;
};

// Define a function to add a room to the device
DeviceSchema.methods.add_room = function (room) {
  var msg,
    self = this,
    defer = q.defer();

  var save = function () {
    //Add room to device
    self._rooms.push(room._id);

    self._save().then(function () {
      defer.resolve();
    }, function (err) {
      log.error('Error adding room to device: ', err);
      defer.reject(err);
    });
  };

  //Check if we have a proper room object
  if ( !(room instanceof rooms.model) ) {
    msg = 'Room is not an instance of Room';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Check if room is already added
  if (self._rooms.indexOf(room._id) > -1 ) {
    msg = 'Room already added to device';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Add device to room if not already added
  if (room._devices.indexOf(self._id) === -1 ) {
    room._devices.push(self._id);
    room._save().then(function () {
      save();
    }, function (err) {
      log.error('Error adding device to room: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  return defer.promise;
};

// Define a function that removes a room from a device
DeviceSchema.methods.remove_room = function (room) {
  var msg,
    self = this,
    defer = q.defer();

  var save = function () {
    //Add room to device
    self._rooms.splice(self._rooms.indexOf(room._id), 1);

    self._save().then(function () {
      defer.resolve();
    }, function (err) {
      log.error('Error removing room from device: ', err);
      defer.reject(err);
    });
  };

  //Check if we have a proper room object
  if ( !(room instanceof rooms.model) ) {
    msg = 'Room is not an instance of Room';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Check if room is exists
  if (self._rooms.indexOf(room._id) === -1 ) {
    msg = 'Room not found in device';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Remove device from room if exists
  if (room._devices.indexOf(self._id) > -1 ) {
    room._devices.splice(room._devices.indexOf(self._id), 1);
    room._save().then(function () {
      save();
    }, function (err) {
      log.error('Error removing device from room: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  return defer.promise;
};


Devices.model = mongoose.model('Devices', DeviceSchema);

// Return all devices
Devices.list = function () { return Devices._devices; };

// Create a new device
Devices.create = function (config) {
  var msg,
    self = this,
    defer = q.defer(),
    device = new Devices.model(config);

  //
  device._rooms = [];
  device.capabilities = device.capabilities || [];

  // Check if the provided provider is valid
  if (providers.list().indexOf(device.provider) === -1) {
    msg = 'Unsupported provider specified: ' + device.provider;
    log.error(msg);
    defer.reject({'status': 'failed', 'msg': msg});
    return defer.promise;
  }

  // After filtering, if we have no capabilities, error out
  if (device.capabilities.length === 0) {
    msg = 'No supported capabilities specified for the device';
    log.error(msg);
    defer.reject({'status': 'failed', 'msg': msg});
    return defer.promise;
  }

  // Save the device
  device.save( function (err) {
    if (err) {
      log.error(err.message || err);
      defer.reject(err);
      return defer.promise;
    }

    log.info('Device created: ', config.name);
    self._devices.push(device);
    defer.resolve(device);
  });

  return defer.promise;
};

//Load all devices from the database
Devices.load = function () {
  var defer = q.defer();

  Devices.model.find(function (err, devices) {
    if (err) { defer.reject(err); }

    //Add each device to the _Devices array
    Devices._devices = devices;
    log.debug('Devices loaded successfully');
    defer.resolve(Devices._devices);
  });

  return defer.promise;
};

//Given a name, return the device
Devices.get_by_name = function (name) {
  var devices = this.list();
  var device = devices.filter(function (item) { return (item.name === name); });

  if (device.length === 0) {
    return false;
  } else {
    return device[0];
  }
  return;
};

//Given an id, return the device
Devices.get_by_id = function (id) {
  var devices = this.list();
  var device = devices.filter(function (item) { return (String(item._id) === String(id)); });

  if (device.length === 0) {
    return false;
  } else {
    return device[0];
  }
  return;
};

//Given a provider, return all devices
Devices.get_by_provider = function (provider) {
  var devices = this.list();
  return devices.filter(function (item) { return item.provider === provider; });
};

//Return a hash of devices with the names as the keys
Devices.by_name = function () {
  var devices = this.list(),
    by_name = {};

  devices.forEach(function (d) {
    by_name[d.name] = d;
  });

  return by_name;
};

//Return a hash of devices with the names as the keys
Devices.by_capability = function (capability) {
  var devices = this.list(),
    by_capability = [];

  by_capability = devices.filter(function (d) {
    return (d.capabilities.indexOf(capability) !== -1);
  });

  return by_capability;
};

Devices.get = function (id) {
  return Devices.get_by_id(id) || Devices.get_by_name(id);
};

module.exports = Devices;
