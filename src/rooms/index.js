'use strict';

var abode;
var devices;
var scenes;
var routes;
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('rooms');
var mongoose = require('mongoose');

var RoomLogSchema = mongoose.Schema({
  'room': mongoose.Schema.Types.ObjectId,
  'created': { 'type': Date, 'default': Date.now },
  'extra': Object,
  'command': String,
  'to':  Object,
  'from':  Object,
});

// Define our main Rooms object
var Rooms = function () {
  devices = require('../devices');
  scenes = require('../scenes');
  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/api/rooms', routes);

  return Rooms.load();
};


// Define the room schema for the database
var RoomSchema = mongoose.Schema({
  'name': {
    'type': String,
    'required': true,
    'unique': true,
    'index': true
  },
  'tags': {'type': Array, 'default': []},
  'icon': {'type': String},
  '_devices': Array,
  '_scenes': Array,
  '_temperature': Number,
  '_humidity': Number,
  '_lumacity': Number,
  '_set_point': Number,
  '_motion_on': Boolean,
  '_motion_off': Boolean,
  '_doors_open': Boolean,
  '_doors_closed': Boolean,
  '_windows_open': Boolean,
  '_windows_closed': Boolean,
  '_shades_open': Boolean,
  '_shades_closed': Boolean,
  '_conditioning_on': Boolean,
  '_conditioning_off': Boolean,
  '_lights_on': Boolean,
  '_lights_off': Boolean,
  '_appliances_on': Boolean,
  '_appliances_off': Boolean,
  '_fans_on': Boolean,
  '_fans_off': Boolean,
  '_scenes_on': Boolean,
  '_scenes_off': Boolean,
  '_mode_heat': Boolean,
  '_mode_cool': Boolean,
  'last_seen': Date,
  '_light_on_count': Number,
  '_light_off_count': Number,
  '_appliance_on_count': Number,
  '_appliance_off_count': Number,
  '_fan_on_count': Number,
  '_fan_off_count': Number,
  '_conditioner_on_count': Number,
  '_conditioner_off_count': Number,
  '_motion_sensor_on_count': Number,
  '_motion_sensor_off_count': Number,
  '_window_on_count': Number,
  '_window_off_count': Number,
  '_door_on_count': Number,
  '_door_off_count': Number,
  '_shade_on_count': Number,
  '_shade_off_count': Number,
  '_scene_on_count': Number,
  '_scene_off_count': Number,
  '_mode_off_count': Number,
  '_mode_heat_count': Number,
  '_mode_cool_count': Number,
});

Rooms._rooms = [];
Rooms.logs = mongoose.model('RoomLogs', RoomLogSchema);

// Function that returns another function based on the config passed
// that will then query specific statuses for for the romm defined
// in the initial config
var getStatuses = function (config) {
  return function (cache) {
    var room_status = false,
      room_value = {'high': null, 'low': null, 'average': 0, 'total': 0},
      index = -1,
      self = this,
      defer = q.defer();

    cache = (cache === undefined) ? false : cache;
    config.filter = (config.filter === undefined) ? true : config.filter;

    //should check to ensure get functino exists
    var devices = self['get_' + config.type]();

    //Once we're done return the data
    var done = function () {
      if (config.value === 'int') {
        room_value.average = (room_value.total / devices.length);
        defer.resolve(room_value.average);
      } else {
        defer.resolve(room_status);
      }
    };

    //Handle the failure by reject our defer
    var fail = function (err) {
      defer.reject(err);
    };

    //iterate through each device and call the config.key method on each device
    var next_device = function () {
      index += 1;

      //If our index is beyond the length, call done()
      if (index >= devices.length) {
        done();
        return;
      }

      var endpoint = devices[index][config.key];

      if (endpoint instanceof Function) {
        var dev_timeout;

        dev_timeout = setTimeout(function () {
          log.warn('Timeout reached statusing device %s for %s', devices[index].name, config.key);
          next_device();
        }, 5000);

        //Call the config.key method on the device
        endpoint.apply(devices[index], [cache]).then(function (value) {
          clearTimeout(dev_timeout);
          //Move on to the next device
          if (config.value === 'int') {
            if (room_value.high === null || value > room_value.high) {
              room_value.high = value;
            }
            if (room_value.high === null || value < room_value.low) {
              room_value.high = value;
            }
            room_value.total += value;
          } else {
            if (value === config.filter) {
              room_status = true;
            }
          }
          next_device();
        }, function (err) {
          clearTimeout(dev_timeout);
          //If we encounter an error, call fail()
          fail(err);
        });

      } else {
        if (endpoint === true) {
          room_status = true;
        }
        next_device();
      }

    };

    //If no devices exist, call fail() and stop
    if (devices.length === 0) {
      fail(new Error('No devices to status: ' + config.type));
      return defer.promise;
    }

    //start processing devices serially
    next_device();

    //Return our promise
    return defer.promise;

  };
};

// Given a capability, return all matching devices
var filterDevices = function(type) {
  return function () {
    var self = this;

    return self.get_devices().filter( function (dev) {
      return (dev.capabilities.indexOf(type) >= 0);
    });
  };
};

var getAge = function (config) {
  return function () {
    var last = {},
      self = this,
      ages = {},
      children = [],
      now = new Date(),
      defer = q.defer(),
      filter = 'get_' + config.type + 's';

    if (self[filter] === undefined) {
      defer.reject({'message': 'Invalid member filter'});
      return defer.promise;
    }

    children = self[filter]();
    children.forEach(function (child) {
      var age = Math.round((now - child[config.key]) / 1000);
      ages[child.name] = {'age': age};
      ages[child.name][config.key] = child[config.key];

      if (last.age === undefined || age < last.age) {
        last.age = age;
        last[config.key] = child[config.key];
      }
    });
    defer.resolve(last.age);

    return defer.promise;
  };
};

// Wrapper function that returns a promise instead of requiring a callback
RoomSchema.methods._save = function () {
  var self = this,
    defer = q.defer();

  if (self.isModified()) {

    this.save(function (err) {
      if (err) {
        defer.reject(err);
      } else {
        log.debug('Room saved successfully: ' + self.name);
        abode.events.emit('UPDATED', {'type': 'room', 'name': self.name, 'object': self});
        defer.resolve();
      }
    });

  } else {
    defer.resolve();
  }

  return defer.promise;
};

// Wrapper function that cleans up devices before deleting a room
RoomSchema.methods.delete = function () {
  var self = this,
    defer = q.defer();

    //Once all devices are cleaned, remove the room
    var complete = function () {
      self.remove(function (err) {
        if (err) {
          log.error('Error deleting room: ', err);
          return defer.reject(err);
        }

        // Reload the rooms
        Rooms.load().then(function () {
          log.debug('Room Deleted: ', self.name);
          defer.resolve();
        }, function (err) {
          log.error('Failed to reload rooms');
          defer.reject(err);
        });

      });
    };

    // Clean up the room being delete from its devices
    var clean_device = function () {
      //Look for devices remaining.
      if (self._devices.length > 0) {
        var device = devices.get_by_id(self._devices[0]);
        log.debug('Cleaning room: ', self._devices[0]);

        device.remove_room(self).then(function () {
          clean_device();
        }, function (err) {
          log.error('Error cleaning device: ', err);
          defer.reject(err);
        });
      } else {
        complete();
      }
    };

    // Start cleaning devices
    clean_device();

    return defer.promise;
};

// Add a device to a room
RoomSchema.methods.add_device = function (device) {
  var msg,
    self = this,
    defer = q.defer();

  var save = function () {
    //Add device to room
    self._devices.push(device._id);

    //Save the room
    self._save().then(function () {
      log.debug('Successfully added device to room');
      defer.resolve();
    }, function (err) {
      log.error('Error adding device to room: ', err);
      defer.reject(err);
    });
  };

  //Check if we have a proper room object
  if ( !(device instanceof devices.model) ) {
    msg = 'Device is not an instance of the Device Model';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Check if room is already added
  if (self._devices.indexOf(device._id) > -1 ) {
    msg = 'Device already added to room';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Add device to room if not already added
  if (device._rooms.indexOf(self._id) === -1 ) {
    device._rooms.push(self._id);

    device._save().then(function () {
      save();
    }, function (err) {
      log.error('Error adding room to device: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  return defer.promise;
};

// Remove a device from a room
RoomSchema.methods.remove_device = function (device) {
  var msg,
    self = this,
    defer = q.defer();

  var save = function () {
    //Remove device from room
    self._devices.splice(self._devices.indexOf(device._id), 1);

    //Save the room
    self._save().then(function () {
      defer.resolve();
    }, function (err) {
      log.error(err.message || err);
      defer.reject(err);
    });
  };

  // Check if the device is an instance of the device model
  if ( !(device instanceof devices.model) ) {
    msg = 'Device is not an instance of the Device Model';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Check if the device is a member of the room
  if (self._devices.indexOf(device._id) === -1 ) {
    msg = 'Device not found in room';
    log.debug(msg);
    defer.resolve({'status': 'success', 'message': msg});
    return defer.promise;
  }

  //Remove room from device if exists
  if (device._rooms.indexOf(self._id) > -1 ) {
    device._rooms.splice(device._rooms.indexOf(self._id), 1);

    device._save(undefined, {'skip_pre': true}).then(function () {
      save();
    }, function (err) {
      log.error('Error removing room from device: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  return defer.promise;
};

// Add a scene to a room
RoomSchema.methods.add_scene = function (scene) {
  var msg,
    self = this,
    defer = q.defer();

  var save = function () {
    //Add scene to room
    self._scenes.push(scene._id);

    //Save the room
    self._save().then(function () {
      log.debug('Successfully added scene to room');
      defer.resolve();
    }, function (err) {
      log.error('Error adding scene to room: ', err);
      defer.reject(err);
    });
  };

  //Check if we have a proper room object
  if ( !(scene instanceof scenes.model) ) {
    msg = 'Scene is not an instance of the Scene Model';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Check if room is already added
  if (self._scenes.indexOf(scene._id) > -1 ) {
    msg = 'Scene already added to room';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Add scene to room if not already added
  if (scene._rooms.indexOf(self._id) === -1 ) {
    scene._rooms.push(self._id);

    scene._save().then(function () {
      save();
    }, function (err) {
      log.error('Error adding room to scene: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  return defer.promise;
};

// Remove a scene from a room
RoomSchema.methods.remove_scene = function (scene) {
  var msg,
    self = this,
    defer = q.defer();

  var save = function () {
    //Remove scene from room
    self._scenes.splice(self._scenes.indexOf(scene._id), 1);

    //Save the room
    self._save().then(function () {
      defer.resolve();
    }, function (err) {
      log.error(err.message || err);
      defer.reject(err);
    });
  };

  // Check if the scene is an instance of the scene model
  if ( !(scene instanceof scenes.model) ) {
    msg = 'Scene is not an instance of the Scene Model';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Check if the scene is a member of the room
  if (self._scenes.indexOf(scene._id) === -1 ) {
    msg = 'Scene not found in room';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Remove room from scene if exists
  if (scene._rooms.indexOf(self._id) > -1 ) {
    scene._rooms.splice(scene._rooms.indexOf(self._id), 1);

    scene._save().then(function () {
      save();
    }, function (err) {
      log.error('Error removing room from scene: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  return defer.promise;
};


// Add the various status methods for the room schema
RoomSchema.methods.get_temperature = getStatuses( {'type': 'temperature_sensors', 'key': 'temperature', 'value': 'int'} );
RoomSchema.methods.get_humidity = getStatuses( {'type': 'humidity_sensors', 'key': 'humidity', 'value': 'int'} );
RoomSchema.methods.get_lumacity = getStatuses( {'type': 'light_sensors', 'key': 'lumens', 'value': 'int'} );
RoomSchema.methods.get_set_point = getStatuses( {'type': 'conditioners', 'key': 'set_point', 'value': 'int'} );
RoomSchema.methods.motion_on =  getStatuses( {'type': 'motion_sensors', 'key': 'has_motion', 'filter': true} );
RoomSchema.methods.motion_off = getStatuses( {'type': 'motion_sensors', 'key': 'has_motion', 'filter': false} );
RoomSchema.methods.doors_open = getStatuses( {'type': 'doors', 'key': 'is_open', 'filter': true} );
RoomSchema.methods.doors_closed = getStatuses( {'type': 'doors', 'key': 'is_closed', 'filter': true} );
RoomSchema.methods.windows_open = getStatuses( {'type': 'windows', 'key': 'is_open', 'filter': true} );
RoomSchema.methods.windows_closed = getStatuses( {'type': 'windows', 'key': 'is_closed', 'filter': true} );
RoomSchema.methods.shades_open = getStatuses( {'type': 'shades', 'key': 'is_open', 'filter': true} );
RoomSchema.methods.shades_closed = getStatuses( {'type': 'shades', 'key': 'is_closed', 'filter': true} );
RoomSchema.methods.conditioning_on = getStatuses( {'type': 'conditioners', 'key': 'is_on', 'filter': true} );
RoomSchema.methods.conditioning_off = getStatuses( {'type': 'conditioners', 'key': 'is_off', 'filter': true} );
RoomSchema.methods.lights_on = getStatuses( {'type': 'lights', 'key': 'is_on', 'filter': true} );
RoomSchema.methods.lights_off = getStatuses( {'type': 'lights', 'key': 'is_off', 'filter': true} );
RoomSchema.methods.fans_on = getStatuses( {'type': 'fans', 'key': 'is_on', 'filter': true} );
RoomSchema.methods.fans_off = getStatuses( {'type': 'fans', 'key': 'is_off', 'filter': true} );
RoomSchema.methods.appliances_on = getStatuses( {'type': 'appliances', 'key': 'is_on', 'filter': true} );
RoomSchema.methods.appliances_off = getStatuses( {'type': 'appliances', 'key': 'is_off', 'filter': true} );
RoomSchema.methods.scenes_on = getStatuses( {'type': 'scenes', 'key': 'is_on', 'filter': true} );
RoomSchema.methods.scenes_off = getStatuses( {'type': 'scenes', 'key': 'is_off', 'filter': true} );
RoomSchema.methods.mode_heat = getStatuses( {'type': 'conditioners', 'key': 'mode', 'filter': 'HEAT'} );
RoomSchema.methods.mode_cool = getStatuses( {'type': 'conditioners', 'key': 'mode', 'filter': 'COOL'} );

// Add the various device filtering methods for the room schema
RoomSchema.methods.get_lights = filterDevices('light');
RoomSchema.methods.get_appliances = filterDevices('appliance');
RoomSchema.methods.get_fans = filterDevices('fan');
RoomSchema.methods.get_conditioners = filterDevices('conditioner');
RoomSchema.methods.get_motion_sensors = filterDevices('motion_sensor');
RoomSchema.methods.get_temperature_sensors = filterDevices('temperature_sensor');
RoomSchema.methods.get_humidity_sensors = filterDevices('humidity_sensor');
RoomSchema.methods.get_moisture_sensors = filterDevices('moisture_sensor');
RoomSchema.methods.get_light_sensors = filterDevices('light_sensor');
RoomSchema.methods.get_windows = filterDevices('window');
RoomSchema.methods.get_doors = filterDevices('door');
RoomSchema.methods.get_shades = filterDevices('shade');
RoomSchema.methods.get_scenes = filterDevices('scene');

// Get Ages
RoomSchema.methods.light_on_age = getAge( {'type': 'light', 'key': 'last_on'} );
RoomSchema.methods.light_off_age = getAge( {'type': 'light', 'key': 'last_off'} );
RoomSchema.methods.motion_on_age = getAge( {'type': 'motion_sensor', 'key': 'last_on'} );
RoomSchema.methods.motion_off_age = getAge( {'type': 'motion_sensor', 'key': 'last_off'} );
RoomSchema.methods.window_open_age = getAge( {'type': 'window', 'key': 'last_on'} );
RoomSchema.methods.window_close_age = getAge( {'type': 'window', 'key': 'last_off'} );
RoomSchema.methods.door_open_age = getAge( {'type': 'door', 'key': 'last_on'} );
RoomSchema.methods.door_close_age = getAge( {'type': 'door', 'key': 'last_off'} );
RoomSchema.methods.fan_on_age = getAge( {'type': 'fan', 'key': 'last_on'} );
RoomSchema.methods.fan_off_age = getAge( {'type': 'fan', 'key': 'last_off'} );
RoomSchema.methods.conditioner_on_age = getAge( {'type': 'conditioner', 'key': 'last_on'} );
RoomSchema.methods.conditioner_off_age = getAge( {'type': 'conditioner', 'key': 'last_off'} );

// Define the function that resolves all rooms to room objects
RoomSchema.methods.set_state = function (config, log_msg) {
  var self = this;

  log.debug('Setting room state for %s: ', self.name, config);

  var onoff_events = {
    '_lights_on': 'LIGHTS',
    '_motion_on': 'MOTION',
    '_fans_on': 'FANS',
    '_mode_heat': 'HEAT',
    '_mode_cool': 'COOL',
    '_conditioning_on': 'CONDITIONING',
    '_appliances_on': 'APPLIANCES',
  };

  var openclose_events = {
    '_doors_open': 'DOORS',
    '_windows_open': 'WINDOWS',
    '_shades_open': 'SHADES',
  };

  var int_events = {
    '_temperature': 'TEMPERATURE',
    '_humidity': 'HUMIDITY',
    '_lumacity': 'LUMACITY',
    '_set_point': 'SET_POINT',
  };

  Object.keys(config).forEach(function (key) {

    if (onoff_events[key]) {
      if (config[key] === true && self[key] !== config[key]) {
        abode.events.emit(onoff_events[key] + '_ON', {'name': self.name, 'type': 'room', 'object': self});
        log.debug('Emitting ' + onoff_events[key] + '_ON for', {'name': self.name, 'type': 'room'});
      }
      if (config[key] === false && self[key] !== config[key]) {
        abode.events.emit(onoff_events[key] + '_OFF', {'name': self.name, 'type': 'room', 'object': self});
        log.debug('Emitting ' + onoff_events[key] + '_OFF for', {'name': self.name, 'type': 'room'});
      }
    }

    if (openclose_events[key]) {
      if (config[key] === true && self[key] !== config[key]) {
        abode.events.emit(openclose_events[key] + '_OPEN', {'name': self.name, 'type': 'room', 'object': self});
        log.debug('Emitting ' + openclose_events[key] + '_OPEN for', {'name': self.name, 'type': 'room'});
      }
      if (config[key] === false && self[key] !== config[key]) {
        abode.events.emit(openclose_events[key] + '_CLOSED', {'name': self.name, 'type': 'room', 'object': self});
        log.debug('Emitting ' + openclose_events[key] + '_CLOSED for', {'name': self.name, 'type': 'room'});
      }
    }

    if (int_events[key]) {
      if (Math.floor(self[key]) !== Math.floor(config[key])) {
        abode.events.emit(int_events[key] + '_CHANGE', {'name': self.name, 'type': 'room', 'object': self});
        log.debug('Emitting ' + int_events[key] + '_CHANGE for', {'name': self.name, 'type': 'room'});
      }
      if (Math.floor(self[key]) !== Math.floor(config[key]) && Math.floor(self[key]) < Math.floor(config[key])) {
        abode.events.emit(int_events[key] + '_UP', {'name': self.name, 'type': 'room', 'object': self});
        log.debug('Emitting ' + int_events[key] + '_UP for', {'name': self.name, 'type': 'room'});
      }
      if (Math.floor(self[key]) !== Math.floor(config[key]) && Math.floor(self[key]) > Math.floor(config[key])) {
        abode.events.emit(int_events[key] + '_DOWN', {'name': self.name, 'type': 'room', 'object': self});
        log.debug('Emitting ' + int_events[key] + '_DOWN for', {'name': self.name, 'type': 'room'});
      }
    }

    // Update the key on the object
    self[key] = config[key];
  });

  if (log_msg) {
    self.log_entry(log_msg);
  }

  return self._save();
};

var statuses = {
  'get_temperature': '_temperature',
  'get_humidity': '_humidity',
  'get_lumacity': '_lumacity',
  'get_set_point': '_set_point',
  'motion_on': '_motion_on',
  'motion_off': '_motion_off',
  'doors_open': '_doors_open',
  'doors_closed': '_doors_closed',
  'windows_open': '_windows_open',
  'windows_closed': '_windows_closed',
  'shades_open': '_shades_open',
  'shades_closed': '_shades_closed',
  'conditioning_on': '_conditioning_on',
  'conditioning_off': '_conditioning_off',
  'lights_on': '_lights_on',
  'lights_off': '_lights_off',
  'appliances_on': '_appliances_on',
  'appliances_off': '_appliances_off',
  'fans_on': '_fans_on',
  'fans_off': '_fans_off',
  'scenes_on': '_scenes_on',
  'scenes_off': '_scenes_off',
  'mode_heat': '_mode_heat',
  'mode_cool': '_mode_cool',
};

RoomSchema.methods.get_lights = filterDevices('light');
RoomSchema.methods.get_appliances = filterDevices('appliance');
RoomSchema.methods.get_fans = filterDevices('fan');
RoomSchema.methods.get_conditioners = filterDevices('conditioner');
RoomSchema.methods.get_motion_sensors = filterDevices('motion_sensor');
RoomSchema.methods.get_temperature_sensors = filterDevices('temperature_sensor');
RoomSchema.methods.get_humidity_sensors = filterDevices('humidity_sensor');
RoomSchema.methods.get_moisture_sensors = filterDevices('moisture_sensor');
RoomSchema.methods.get_light_sensors = filterDevices('light_sensor');
RoomSchema.methods.get_windows = filterDevices('window');
RoomSchema.methods.get_doors = filterDevices('door');
RoomSchema.methods.get_shades = filterDevices('shade');
RoomSchema.methods.get_scenes = filterDevices('scene');

var counts = [
  {'filter': 'light', 'key': '_on'},
  {'filter': 'appliance', 'key': '_on'},
  {'filter': 'fan', 'key': '_on'},
  {'filter': 'conditioner', 'key': '_on'},
  {'filter': 'window', 'key': '_on'},
  {'filter': 'door', 'key': '_on'},
  {'filter': 'shade', 'key': '_on'},
];

RoomSchema.methods.status = function (cache) {
  var update = {},
    self = this,
    defer = q.defer(),
    status_defers = [],
    motions = self.get_motion_sensors(),
    conditioners = self.get_conditioners();

  cache = (cache === undefined) ? false : cache;

  Object.keys(statuses).forEach(function (status) {
    var roomTimeout,
      status_defer = q.defer();

    status_defers.push(status_defer.promise);

    roomTimeout = setTimeout(function () {
      log.warn('Timeout reached statusing room %s for %s', self.name, status);
      status_defer.reject();
    }, 5000);

    log.debug('Checking status of room %s: %s', self.name, status);
    self[status](cache).then(function (response) {
      clearTimeout(roomTimeout);
      update[statuses[status]] = response;
      status_defer.resolve(response);
    }, function (err) {
      clearTimeout(roomTimeout);
      status_defer.reject(err);
    });

  });

  counts.forEach(function (type) {
    var children = self['get_' + type.filter + 's'](),
      on_count = children.filter( function (child) { return (child[type.key] === true); } ),
      off_count = children.filter( function (child) { return (child[type.key] === false); } );

    update['_' + type.key + '_on_count'] = on_count.length;
    update['_' + type.key + '_off_count'] = off_count.length;
  });

  update._motion_sensor_off_count = motions.filter( function (child) { return (child._motion === false); }).length;
  update._motion_sensor_on_count = motions.filter( function (child) { return (child._motion === true); }).length;
  console.log(update);

  update._mode_off_count = conditioners.filter( function (child) { return (child._mode === 'OFF'); }).length;
  update._mode_heat_count = conditioners.filter( function (child) { return (child._mode === 'HEAT'); }).length;
  update._mode_cool_count = conditioners.filter( function (child) { return (child._mode === 'COOL'); }).length;

  q.allSettled(status_defers).then(function () {
    self.set_state(update).then(function (response) {
      defer.resolve(response);
    }, function (err) {
      defer.resolve(err);
    });
  });

  return defer.promise;
};

// Expand each device into it's object and return a list of objects
RoomSchema.methods.get_devices = function () {
  var self = this,
    items = [];

  self._devices.forEach(function (item) {
    var device = devices.get_by_id(item);
    if (device !== false) {
      items.push(device);
    }
  });

  return items;
};

// Expand each device into it's object and return a list of objects
RoomSchema.methods.get_scenes = function () {
  var self = this,
    items = [];

  self._scenes.forEach(function (item) {
    var scene = scenes.get_by_id(item);
    if (scene !== false) {
      items.push(scene);
    }
  });

  return items;
};

// Expand each device into it's object and return a list of objects
RoomSchema.methods.on = function () {
  var devices,
    scenes,
    cmd_defers = [],
    defer = q.defer();

  devices = this.get_devices();
  scenes = this.get_scenes();

  devices.forEach(function (d) {
    cmd_defers.push(d.on());
  });

  scenes.forEach(function (s) {
    cmd_defers.push(s.on());
  });

  q.allSettled(cmd_defers).then(function () {
    defer.resolve();
  });

  return defer.promise;
};

// Expand each device into it's object and return a list of objects
RoomSchema.methods.off = function () {
  var devices,
    scenes,
    cmd_defers = [],
    defer = q.defer();

  devices = this.get_devices();
  scenes = this.get_scenes();

  devices.forEach(function (d) {
    cmd_defers.push(d.off());
  });

  scenes.forEach(function (s) {
    cmd_defers.push(s.on());
  });

  q.allSettled(cmd_defers).then(function () {
    defer.resolve();
  });

  return defer.promise;
};

// Expand each device into it's object and return a list of objects
RoomSchema.methods.set_level = function (level) {
  var devices,
    scenes,
    cmd_defers = [],
    defer = q.defer();

  devices = this.get_devices();
  scenes = this.get_scenes();

  devices.forEach(function (d) {
    cmd_defers.push(d.set_level(level));
  });

  scenes.forEach(function (s) {
    cmd_defers.push(s.on());
  });

  q.allSettled(cmd_defers).then(function () {
    defer.resolve();
  });

  return defer.promise;
};

Rooms.model = mongoose.model('Rooms', RoomSchema);

// Return all the rooms
Rooms.list = function () { return Rooms._rooms; };

// Create a new room
Rooms.create = function (config) {
  var self = this,
    defer = q.defer(),
    room = new Rooms.model(config);

  // create an empty devices array
  room._devices = [];

  // Create the new room
  room.save( function (err) {
    if (err) {
      log.error('Failed to create room');
      log.debug(err.message || err);

      defer.reject({'status': 'failed', 'message': 'Failed to create room', 'error': err});
      return defer.promise;
    }

    log.info('Room created: ', config.name);
    self._rooms.push(room);

    defer.resolve(room);
  });

  return defer.promise;
};

// Load all the rooms
Rooms.load = function () {
  var defer = q.defer();

  Rooms.model.find(function (err, rooms) {
    if (err) { defer.reject(err); }

    Rooms._rooms = rooms;
    log.debug('Rooms loaded successfully');
    defer.resolve(rooms);
  });

  return defer.promise;
};

//Given a name, return the room
Rooms.get_by_name = function (name) {
  var rooms = this.list();
  var room = rooms.filter(function (item) { return (item.name === name); });

  if (room.length === 0) {
    return false;
  } else {
    return room[0];
  }
};

//Given an id, return the room
Rooms.get_by_id = function (id) {
  var rooms = this.list();
  var room = rooms.filter(function (item) { return (String(item._id) === String(id)); });

  if (room.length === 0) {
    return false;
  } else {
    return room[0];
  }
};


//Return a hash of rooms with the names as the keys
Rooms.by_name = function () {
  var rooms = this.list(),
    by_name = {};

  rooms.forEach(function (r) {
    by_name[r.name] = r;
  });

  return by_name;
};

Rooms.get = function (id) {
  return Rooms.get_by_id(id) || Rooms.get_by_name(id);
};

module.exports = Rooms;
