'use strict';

var abode;
var devices;
var routes;
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('abode.rooms');
var mongoose = require('mongoose');

// Define our main Rooms object
var Rooms = function () {
  devices = require('../devices');
  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/rooms', routes);

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
  '_devices': Array,
  'last_seen': Date,
});

Rooms._rooms = [];

// Function that returns another function based on the config passed
// that will then query specific statuses for for the romm defined
// in the initial config
var getStatuses = function (config) {
  return function () {
    var room_status = false,
      room_value = {'high': null, 'low': null, 'average': 0},
      index = -1,
      self = this,
      defer = q.defer();

    //should check to ensure get functino exists
    var devices = self['get_' + config.type]();

    //Once we're done return the data
    var done = function () {
      if (config.value === 'int') {
        room_status.average = (room_status.average / devices.length);
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
      }

      var endpoint = devices[index][config.key];
      console.log(devices[index].name);

      if (endpoint instanceof Function) {
        //Call the config.key method on the device
        endpoint.apply(devices[index]).then(function (value) {
          //Move on to the next device
          if (config.value === 'int') {
            if (room_value.high === null || value > room_value.high) {
              room_value.high = value;
            }
            if (room_value.high === null || value < room_value.low) {
              room_value.high = value;
            }
            room_value += value;
          } else {
            if (value === true) {
              room_status = true;
            }
          }
          next_device();
        }, function (err) {
          //If we encounter an error, call fail()
          fail(err);
        });

      } else {
        if (endpoint === true) {
          room_status = true;
        }
      }

    };

    //If no devices exist, call fail() and stop
    if (devices.length === 0) {
      fail(new Error('No devices to status'));
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

// Wrapper function that returns a promise instead of requiring a callback
RoomSchema.methods._save = function () {
  var defer = q.defer();

  this.save(function (err) {
    if (err) {
      defer.reject(err);
    } else {
      log.debug('Room saved');
      defer.resolve();
    }
  });

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
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Remove room from device if exists
  if (device._rooms.indexOf(self._id) > -1 ) {
    device._rooms.splice(device._rooms.indexOf(self._id), 1);

    device._save().then(function () {
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

// Add the various status methods for the room schema
RoomSchema.methods.get_temperature = getStatuses( {'type': 'temperature_sensors', 'key': 'temperature', 'value': 'int'} );
RoomSchema.methods.get_humidity = getStatuses( {'type': 'humidity_sensor', 'key': 'humidity', 'value': 'int'} );
RoomSchema.methods.get_lumacity = getStatuses( {'type': 'light_sensor', 'key': 'lumens', 'value': 'int'} );
RoomSchema.methods.motion_on =  getStatuses( {'type': 'motion_sensors', 'key': 'is_on', 'filter': true} );
RoomSchema.methods.motion_off = getStatuses( {'type': 'motion_sensors', 'key': 'is_off', 'filter': true} );
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
RoomSchema.methods.appliances_on = getStatuses( {'type': 'appliances', 'key': 'is_on', 'filter': true} );
RoomSchema.methods.appliances_off = getStatuses( {'type': 'appliances', 'key': 'is_off', 'filter': true} );
RoomSchema.methods.scenes_on = getStatuses( {'type': 'scenes', 'key': 'is_on', 'filter': true} );
RoomSchema.methods.scenes_off = getStatuses( {'type': 'scenes', 'key': 'is_off', 'filter': true} );

// Add the various device filtering methods for the room schema
RoomSchema.methods.get_lights = filterDevices('light');
RoomSchema.methods.get_appliances = filterDevices('appliance');
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

    console.log('here1');
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
