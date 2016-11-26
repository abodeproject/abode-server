'use strict';

var abode;
var devices;
var rooms;
var scenes;
var routes;
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('scenes');
var mongoose = require('mongoose');

var SceneLogSchema = mongoose.Schema({
  'scene': mongoose.Schema.Types.ObjectId,
  'created': { 'type': Date, 'default': Date.now },
  'extra': Object,
  'command': String,
  'to':  Object,
  'from':  Object,
});

// Define our main Scenes object
var Scenes = function () {
  var defer = q.defer();
  abode = require('../abode');
  devices = abode.devices;
  scenes = abode.scenes;
  rooms = abode.rooms;
  routes = require('./routes');

  abode.web.server.use('/api/scenes', routes);

  Scenes.load().then(function () {
    Scenes._scenes.forEach(function (scene) {
      if (scene._on) {
        log.info('Scene was previously on, restarting:', scene.name);
        scene.start();
      }
    });
    defer.resolve();
  }, function (err) {
    console.log(err);
    defer.reject(err);
  });

  return defer.promise;
};

Scenes._scenes = [];
Scenes._timers = {};
Scenes.states = [
  'pending',
  'active',
  'stopped',
];
Scenes.logs = mongoose.model('SceneLogs', SceneLogSchema);

// Define the scene schema for the database
var SceneSchema = mongoose.Schema({
  'name': {
    'type': String,
    'required': true,
    'unique': true,
    'index': true,
  },
  'tags': {'type': Array, 'default': []},
  'repeat': {'type': Boolean, 'default': false},
  'repeat_delay': {'type': Number},
  'onoff': {'type': Boolean, 'default': false},
  '_on': {'type': Boolean, 'default': false},
  '_state': {
    'type': String,
    'default': 'stopped',
    'validate': {
      validator: function(v) {
        return (Scenes.states.indexOf(v) !== -1);
      },
      message: '{VALUE} is not a valid state'
    }
  },
  '_rooms': {'type': Array, 'default': []},
  '_steps': [
    {
      'actions': [
        {
          'name': {'type': String, 'required': true},
          'object_type': {'type': String},
          'object_id': {'type': mongoose.Schema.Types.ObjectId, 'required': true},
          'stages': {'type': Number, 'default': 0},
          'duration': {'type': Number, 'default': 0},
          '_on': {'type': Boolean, 'default': false},
          '_level': {'type': Number},
          '_temperature': {'type': Number},
          '_humidity': {'type': Number},
          '_lumens': {'type': Number},
          '_mode': {'type': String},
          '_set_point': {'type': Number},
        }
      ],
      'delay': {'type': Number, 'default': 0},
      'wait': {'type': Boolean, 'default': true},
    },
  ],
  'last_on': Date,
  'last_off': Date,
  'created': Date,
  'updated': Date
});

SceneSchema.methods.is_on = function () {
  var self = this,
    defer = q.defer();

  defer.resolve((self._on === true));

  return defer.promise;;
};

SceneSchema.methods.is_off = function () {
  var self = this,
    defer = q.defer();

  defer.resolve((self._on !== true));

  return defer.promise;
};

// Wrapper function that returns a promise instead of requiring a callback
SceneSchema.methods._save = function () {
  var self = this,
    defer = q.defer();

  this.save(function (err) {
    if (err) {
      log.error('Failed to save room:', err)
      defer.reject(err);
    } else {
      log.info('Scene saved successfully');
      abode.events.emit('UPDATED', {'type': 'scene', 'name': self.name, 'object': self});
      defer.resolve();
    }
  });

  return defer.promise;
};

// Wrapper function that cleans up devices before deleting a room
SceneSchema.methods.delete = function () {
  var self = this,
    defer = q.defer();

    //Once all devices are cleaned, remove the room
    var complete = function () {
      self.remove(function (err) {
        if (err) {
          log.error('Error deleting scene: ', err);
          return defer.reject(err);
        }

        // Reload the rooms
        Scenes.load().then(function () {
          log.debug('Scene Deleted: ', self.name);
          defer.resolve();
        }, function (err) {
          log.error('Failed to reload scenes');
          defer.reject(err);
        });

      });
    };

    // Clean up the scene being delete from its rooms
    var clean_room = function () {
      //Look for devices remaining.
      if (self._rooms.length > 0) {
        var room = rooms.get_by_id(self._rooms[0]);
        log.debug('Cleaning room: ', self._rooms[0]);

        room.remove_scene(self).then(function () {
          clean_room();
        }, function (err) {
          log.error('Error cleaning room: ', err);
          defer.reject(err);
        });
      } else {
        complete();
      }
    };

    // Start cleaning rooms
    clean_room();

    return defer.promise;
};

// Define the function that resolves all rooms to room objects
SceneSchema.methods.get_rooms = function () {
  var self = this,
    items = [];

  self._rooms = self._rooms || [];

  self._rooms.forEach(function (item) {
    var room = rooms.get_by_id(item);
    if (room !== false) {
      items.push(room);
    }
  });

  return items;
};

// Define a function to add a room to the device
SceneSchema.methods.add_room = function (room) {
  var msg,
    self = this,
    defer = q.defer();

  var save = function () {
    //Add room to device
    self._rooms.push(room._id);

    self._save().then(function () {
      defer.resolve();
    }, function (err) {
      log.error('Error adding room to scene: ', err);
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
    msg = 'Room already added to scene';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Add device to room if not already added
  if (room._scenes.indexOf(self._id) === -1 ) {
    room._scenes.push(self._id);
    room._save().then(function () {
      save();
    }, function (err) {
      log.error('Error adding scene to room: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  return defer.promise;
};

// Define a function that removes a room from a device
SceneSchema.methods.remove_room = function (room) {
  var msg,
    self = this,
    defer = q.defer();

  var save = function () {
    //Add room to scene
    self._rooms.splice(self._rooms.indexOf(room._id), 1);

    self._save().then(function () {
      defer.resolve();
    }, function (err) {
      log.error('Error removing room from scene: ', err);
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

  //Remove scene from room if exists
  if (room._scenes.indexOf(self._id) > -1 ) {
    room._scenes.splice(room._scenes.indexOf(self._id), 1);
    room._save().then(function () {
      save();
    }, function (err) {
      log.error('Error removing scene from room: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  return defer.promise;
};

// Define a function that turns the scene on
SceneSchema.methods.start = function () {
  var index = -1,
    self = this,
    step_defers = [],
    defer = q.defer(),
    timers;

  /*
  if (self._on) {
    defer.reject({'status': 'failed', 'message': 'Scene is already on', 'state': self._state});
    return defer.promise;
  }
  */
  Scenes._timers[self.name] = Scenes._timers[self.name] || [];
  timers = Scenes._timers[self.name];

  self._state = 'pending';
  self._on = true;

  log.info('Emitting ON for', {'name': self.name, 'type': 'scene'});
  abode.events.emit('ON', {'type': 'scene', 'name': self.name, 'object': self});

  // When we are done, update the scene state and resolve our defer
  var done = function () {
    q.allSettled(step_defers).then(function () {
      log.debug('All steps run, updating scene state');

      self.last_on = new Date();

      if (!self.onoff) {
        self._state = 'stopped';
        self._on = false;

        self._save().then(function () {
          log.info('Scene completed, updating:', self.name);
          defer.resolve({'status': 'success'});
        }, function (err) {
          log.error('Failed to update scene after completing: ', err);
        });

      } else {

        self._state = 'active';

        self._save().then(function () {
          log.info('Scene started, updating');
          defer.resolve({'status': 'success'});
        }, function (err) {
          log.error('Failed to update scene after turning on: ', err);
        });

        if (self.repeat) {
          log.debug('Repeating scene in %s seconds', self.repeat_delay * 1000);
          var repeatTimer = setTimeout(function () {
            step_defers = [];
            index = -1;

            next();
          }, self.repeat_delay * 1000);

          timers.push(repeatTimer);
        }
      }
    });
  };

  // Run an action, returing a promise
  var doAction = function (action) {
    var defer = q.defer(),
      object ;

    switch (action.object_type) {
      case 'devices':
        object = devices.get(action.object_id);
        break;
      case 'scenes':
        object = scenes.get(action.object_id);
        break;
      case 'rooms':
        object = rooms.get(action.object_id);
        break;
    }

    log.debug('Processing action: %s', action.name);

    if (!object) {
      log.error('Could not find object: ', action.name);
      defer.reject('Could not find object: ' + action.object_type + '.' + action.object);
      return defer.promise;
    }

    if (action._on === true && action._level === undefined) {
      log.debug('Sending ON to object:', object.name);
      return (action.object_type === 'scenes') ? object.start() : object.on();
    }
    if (action._on === false && action._level === undefined) {
      log.debug('Sending OFF to object:', object.name);
      return (action.object_type === 'scenes') ? object.stop() : object.off();
    }
    if (action._on !== undefined && action._level !== undefined) {
      log.debug('Sending set level to object:', object.name, action._level);
      return object.set_level(action._level);
    }
    if (action._mode !== undefined) {
      log.debug('Setting mode for object: ', action.name, action._mode);
      object.set_mode(action._mode).then(function () {
        setTimeout(function () {
          log.debug('Setting set_point for object: ', action.nameaction._set_point);
          object.set_point(action._set_point).then(defer.resolve, defer.reject);
        });
      }, function (err) {
        defer.reject(err);
      });
    }

    defer.resolve();

    return defer.promise;
  };

  // Function to process the next step
  var next = function () {
    //Increment our step index
    index += 1;

    //If we've reached the end, call don
    if (index >= self._steps.length) {
      done();
      return;
    }

    log.debug('Processing step %s for scene %s', index, self.name);
    var step = self._steps[index];
    var step_defer = q.defer();
    step_defers.push(step_defer);

    //Function to call our actions after a delay
    var startStep = function () {
      var action_defers = [];

      step.actions.forEach(function (action) {
        action_defers.push(doAction(action));
      });

      if (step.wait) {
        //If step is seto to wait, call next after action defers
        log.debug('Waiting for step to complete');

        q.allSettled(action_defers).then(function () {
          step_defer.resolve();
          next();
        });
      } else {
        //If we are not waiting, still wait for action defers to resolve step defer
        log.debug('Step is not blocking, moving to next step');

        q.allSettled(action_defers).then(function () {
          log.debug('Step completed');
          step_defer.resolve();
        });

        //Start the next step
        next();
      }
    };

    //Process our delay;
    var stepTimer = setTimeout(startStep, step.delay * 1000);
    timers.push(stepTimer);
  };

  // Start processing the steps
  next();

  defer.resolve({'status': 'pending'});

  return defer.promise;
};

// Define a function that turns the scene on
SceneSchema.methods.stop = function () {
  var self = this,
    defer = q.defer(),
    timers;

  Scenes._timers[self.name] = Scenes._timers[self.name] || [];
  timers = Scenes._timers[self.name];

  self._on = false;
  self._state = 'stopped';
  self.last_off = new Date();

  timers.forEach(function (timer) {
    log.debug('Clearing Timer');
    clearTimeout(timer);
  });


  log.info('Emitting OFF for', {'name': self.name, 'type': 'scene'});
  abode.events.emit('OFF', {'type': 'scene', 'name': self.name, 'object': self});

  timers = [];

  self._save().then(function () {
    log.info('Scene stopped, updating');
    defer.resolve({'status': 'success'});
  }, function (err) {
    log.error('Failed to update scene after turning on: ', err);
    defer.reject({'status': 'failed', 'message': 'Failed to update scene after turning off', 'error': err});
  });

  return defer.promise;
};

Scenes.model = mongoose.model('Scenes', SceneSchema);


// Return all the scene
Scenes.list = function () { return Scenes._scenes; };

// Create a new scene
Scenes.create = function (config) {
  var self = this,
    defer = q.defer(),
    scene = new Scenes.model(config);

  // create an empty devices array
  scene._devices = [];

  // Create the new scene
  scene.save( function (err) {
    if (err) {
      log.error('Failed to create scene', err);
      log.debug(err.message || err);

      defer.reject({'status': 'failed', 'message': 'Failed to create scene', 'error': err});
      return defer.promise;
    }

    log.info('Scene created: ', config.name);
    self._scenes.push(scene);

    defer.resolve(scene);
  });

  return defer.promise;
};

// Load all the scenes
Scenes.load = function () {
  var defer = q.defer();

  Scenes.model.find(function (err, scenes) {
    if (err) { defer.reject(err); }

    Scenes._scenes = scenes;
    log.debug('Scenes loaded successfully');
    defer.resolve(scenes);
  });

  return defer.promise;
};

//Given a name, return the scene
Scenes.get_by_name = function (name) {
  var scenes = this.list();
  var scene = scenes.filter(function (item) { return (item.name === name); });

  if (scene.length === 0) {
    return false;
  } else {
    return scene[0];
  }
};

//Given an id, return the scene
Scenes.get_by_id = function (id) {
  var scenes = this.list();
  var scene = scenes.filter(function (item) { return (String(item._id) === String(id)); });

  if (scene.length === 0) {
    return false;
  } else {
    return scene[0];
  }
};


//Return a hash of scenes with the names as the keys
Scenes.by_name = function () {
  var scenes = this.list(),
    by_name = {};

  scenes.forEach(function (r) {
    by_name[r.name] = r;
  });

  return by_name;
};

Scenes.get = function (id) {
  return Scenes.get_by_id(id) || Scenes.get_by_name(id);
};

module.exports = Scenes;
