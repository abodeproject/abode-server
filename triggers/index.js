'use strict';

var abode;
var rooms;
var routes;
var devices;

var conditions = require('./conditions');
var mongoose = require('mongoose');
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('triggers');

// Build the Triggers object
var Triggers = function () {
  rooms = require('../rooms');
  devices = require('../devices');
  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/api/triggers', routes);

  if (Triggers.config.debug_conditions) {
    logger.getLogger('triggers.conditions').setLevel('DEBUG');
  } else {
    logger.getLogger('triggers.conditions').setLevel('INFO');
  }

  return Triggers.load();
};

//Define the device schema
var TriggersSchema = mongoose.Schema({
  'trigger': {'type': String, 'required': true},
  'name': {
    'type': String,
    'required': true,
    'unique': true,
    'index': true
  },
  'enabled': {'type': Boolean, 'default': true},
  'match': String,
  'match_type': {'type': String, 'default': ''},
  'actions': [
    {
      'name': {'type': String, 'required': true},
      'args': {'type': Array, 'default': []}
    }
  ],
  'conditions': [
    {
      'and': Array,
      'or': Array,
      'name': String,
      'condition': {'type': String},
      'lookup': {'type': String},
      'key': {'type': String}
    }
  ],
  'duration': Object,
  'delay': Object,
  'created': { 'type': Date, 'default': Date.now },
  'updated': { 'type': Date, 'default': Date.now },
});

Triggers._Triggers = [];
Triggers.types = [
  {'name': 'ON'},
  {'name': 'OFF'},
  {'name': 'OPEN'},
  {'name': 'CLOSE'},
  {'name': 'LIGHTS_ON'},
  {'name': 'LIGHTS_OFF'},
  {'name': 'FANS_ON'},
  {'name': 'FANS_OFF'},
  {'name': 'APPLIANCES_ON'},
  {'name': 'APPLIANCES_OFF'},
  {'name': 'CONDITIONING_ON'},
  {'name': 'CONDITIONING_OFF'},
  {'name': 'WINDOWS_OPEN'},
  {'name': 'WINDOWS_CLOSED'},
  {'name': 'DOORS_OPEN'},
  {'name': 'DOORS_CLOSED'},
  {'name': 'SHADES_OPEN'},
  {'name': 'SHADES_CLOSED'},
  {'name': 'MOTION_ON'},
  {'name': 'MOTION_OFF'},
  {'name': 'TEMPERATURE_CHANGE'},
  {'name': 'TEMPERATURE_UP'},
  {'name': 'TEMPERATURE_DOWN'},
  {'name': 'HUMIDITY_CHANGE'},
  {'name': 'HUMIDITY_UP'},
  {'name': 'HUMIDITY_DOWN'},
  {'name': 'LUMACITY_CHANGE'},
  {'name': 'LUMACITY_UP'},
  {'name': 'LUMACITY_DOWN'},
];

Triggers.lookupAction = function (key) {
  /*
  Given a dot separated string, lookup the method/property across providers
  */

  var keys,
    self,
    lookupObj = abode.providers;


  if (typeof(key) !== 'string') {
    return;
  }

  //Split the key by a dot
  keys = key.split('.');
  switch (keys[0]) {
    case 'providers':
      lookupObj = abode.providers;
      break;
    case 'devices':
      lookupObj = abode.devices.by_name();
      break;
    case 'rooms':
      lookupObj = abode.rooms.by_name();
      break;
    default:
      return;
  }

  //Shift the first item from the array of keys
  keys.shift();

  //Loop through each key and lookup against the providers (lookupObj)
  keys.forEach(function (key) {
    if (lookupObj === undefined) { return; }

    if (lookupObj[key] !== undefined) {
      //Save the previous lookupObj as the self object
      self = lookupObj;

      //If the key was found, set the lookupObj to that key
      lookupObj = lookupObj[key];
    } else {
      //Otherwise set lookupObj to undef
      lookupObj = undefined;
    }
  });

  //If lookupObj is undefined, return undefined
  if (lookupObj === undefined) {
    return undefined;
  }

  //If the lookupObj has a handler property which is a function return it
  if (lookupObj instanceof Function) {
    return {'handler': lookupObj, 'self': self};
  } else {
  //Otherwise return false
    return undefined;
  }
};

Triggers.fire_actions = function(actions) {
  /*
  Given an array of actions, fire each acti
  */

  actions.forEach(function (a) {
    log.info('Firing action %s: %s', a.name, a.args);

    //Lookup the action
    var action = Triggers.lookupAction(a.name);

    //If a valid action was found, call it with the args provided
    if (action) {
      var promise = action.handler.apply(action.self, a.args);

      //If we received a promise, handle it here
      if (promise.then) {
        promise.then(function () {
          log.info('Action fired successfully "%s": ', a.name, a.args);
        }, function (err) {
          log.error('Failed to fire action "%s": ', a.name, err.message || err);
        });
      }
    } else {
      log.error('Unable to lookup action: ', a.name);
    }
  });
};

Triggers.trigger_duration = function (duration) {
  /*
  Given a duration configuration, trigger it after the spcified time
  */

  //Define the timeout handler
  var duration_handler = function () {

    //Handle any actions
    if (duration.actions) {
      Triggers.fire_actions(duration.actions);
    }

    //Handle any triggers
    if (duration.triggers) {
      duration.triggers.forEach(function (t) {
        log.debug('Firing trigger for %s after duration of %s has passed:', t, duration);
        Triggers.fire_trigger(Triggers.get_by_id(t));
      });
    }
  };

  //If no duration spcified, return false
  if (duration === undefined) {
    return false;
  }

  //Set the timeout
  log.debug('Trigger duration configured for %s seconds', duration.time);
  setTimeout(duration_handler, duration.time * 1000);
};

Triggers.fire_trigger = function (config) {
  /*
  Given a trigger configuration, process it taking into account delays and durations
  */

  //Specify the delay handler
  var delay_handler = function () {
    log.debug('Firing delayed action after %s seconds:', config.delay.time, config.name);

    // Check conditions again
    if (config.delay.force !== true && config.conditions.length > 0) {
      log.debug('Forcing check of conditions after delay');

      conditions.check(config.conditions).then(function (condition) {
        if (!condition) {
          log.debug('Conditions not met, skipping:', config.name);

          return false;
        }

        //Handle Actions (Move this to a function so it can be called easier depending on delay)
        Triggers.fire_actions(config.actions);

        //Handle durations
        Triggers.trigger_duration(config.duration);
      });

    } else {
      //Handle Actions (Move this to a function so it can be called easier depending on delay)
      Triggers.fire_actions(config.actions);

      //Handle durations
      Triggers.trigger_duration(config.duration);
    }

  };

  //Check if the conditions have been met
  log.debug('Checking trigger conditions:', config.name);

  //Process conditions
  conditions.check(config.conditions).then(function (condition) {

    if (!condition) {
      log.debug('Conditions not met, skipping:', config.name);

      return false;
    }

    //If the trigger is disable, skip
    if (config.enabled === false) {
      log.info('Conditions met but disabled, skipping:', config.name);

      return false;
    }

    //If a delay was specified, trigger it here
    if (config.delay && config.delay.time) {
      setTimeout(delay_handler, config.delay.time * 1000);

    //Otherwise fire the actions
    } else {
      log.info('Firing trigger actions:', config.name);

      //Handle Actions (Move this to a function so it can be called easier depending on delay)
      Triggers.fire_actions(config.actions);

      //Handle durations
      Triggers.trigger_duration(config.duration);
    }
  });
};

Triggers.type_handler = function (trigger) {
  /*
  Given a trigger type, return a function to fire the triggers
  associated with that type
  */

  return function(matcher) {
    matcher = matcher || '';
    log.debug('Received "%s" event: ', trigger, matcher.name || matcher || '');

    //Loop through each trigger for the given type
    Triggers.get_by_type(trigger).forEach(function (t) {

      //If a matcher was provided, check it matches here
      if (t.match !== undefined && t.match !== '') {
        if (matcher.type && t.match_type === matcher.type && t.match === String(matcher.name)) {
          log.debug('Type based match found');
        } else if (t.match !== String(matcher)) {
          log.debug('Simple matche found');
        } else {
          log.debug('Trigger not matched: %s (%s != %s)', t.name, t.match, matcher.name || matcher || '');
          return false;
        }
        /*
        if (t.match !== matcher.name && (t.match !== String(matcher)) ) {
          log.debug('Trigger not matched: %s (%s != %s)', t.name, t.match, matcher.name || matcher || '');
          return false;
        } else {
          log.debug('Trigger matched: %s (%s == %s)', t.name, t.match, matcher.name || matcher || '');
        }
        */
      }

      //Fire the trigger
      Triggers.fire_trigger(t);
    });
  };
};

Triggers.add_listeners = function () {
  var self = this;
  /*
  Setup event triggers for eah configured trigger
  */

  //Loop through each trigger and add the even handler
  self.types.forEach(function (trigger) {
    log.debug('Registering event handler for trigger: %s', trigger.name);
    abode.events.on(trigger.name, Triggers.type_handler(trigger.name));
  });
};

TriggersSchema.methods.enable = function () {
  var self = this;

  self.enabled = true;

  return self._save();
};

TriggersSchema.methods.disable = function () {
  var self = this;

  self.enabled = false;

  return self._save();
};

// Define a save function that returns an promise instead of using a callback
TriggersSchema.methods._save = function () {
  var self = this,
    defer = q.defer();

  this.updated = new Date();
  this.save(function (err) {
    if (err) {
      defer.reject(err);
    } else {
      log.debug('Saved Trigger: ' + self.name);
      defer.resolve({'status': 'success', 'message': 'Saved Trigger'});
    }
  });

  return defer.promise;
};

// Define a delete function that cleans up rooms
TriggersSchema.methods.delete = function () {
  var self = this,
    defer = q.defer();

    self.remove(function (err) {
      if (err) {
        log.error('Error deleting trigger: ', err);
        return defer.reject(err);
      }

      // Reload the devices
      Triggers.load().then(function () {
        log.info('Trigger Deleted: ', self.name);
        defer.resolve({'status': 'success', 'message': 'Trigger Deleted'});
      }, function (err) {
        log.error('Failed to reload Triggers');
        defer.reject(err);
      });

    });

    return defer.promise;
};

Triggers.model = mongoose.model('Triggers', TriggersSchema);

// Return all devices
Triggers.list = function () { return Triggers._Triggers; };

// Create a new trigger
Triggers.create = function (config) {
  var self = this,
    defer = q.defer(),
    trigger = new Triggers.model(config);

  // Save the trigger
  trigger.save( function (err) {
    if (err) {
      log.error('Failed to create trigger');
      log.debug(err.message || err);
      defer.reject({'status': 'failed', 'message': 'Failed to create trigger', 'error': err});
      return defer.promise;
    }

    log.debug('Trigger created: ', config.name);
    self._Triggers.push(trigger);
    defer.resolve({'status': 'success', 'message': 'Trigger Created', 'trigger': trigger});
  });

  return defer.promise;
};

//Load all Triggers from the database
Triggers.load = function () {
  var defer = q.defer();

  Triggers.model.find(function (err, triggers) {
    if (err) {
      defer.reject(err);
      return defer.promise;
    }

    //Add each trigger to the _Devices array
    Triggers._Triggers = triggers;
    log.debug('Triggers loaded successfully');
    Triggers.add_listeners();
    defer.resolve(Triggers);
  });

  return defer.promise;
};


//Given a name, return the room
Triggers.get_by_name = function (name) {
  var triggers = this.list();
  var trigger = triggers.filter(function (item) { return (item.name === name); });

  if (trigger.length === 0) {
    return false;
  } else {
    return trigger[0];
  }
};

//Given an id, return the room
Triggers.get_by_id = function (id) {
  var triggers = Triggers.list();
  var trigger = triggers.filter(function (item) { return (String(item._id) === String(id)); });

  if (trigger.length === 0) {
    return false;
  } else {
    return trigger[0];
  }
};

//Given an id, return the room
Triggers.get_by_type = function (type) {
  var triggers = this.list();
  var trigger = triggers.filter(function (item) { return (String(item.trigger) === String(type)); });

  return trigger;
};

Triggers.get = function (id) {
  return Triggers.get_by_id(id) || Triggers.get_by_name(id);
};

module.exports = Triggers;
