'use strict';

var abode,
  routes,
  config,
  q = require('q'),
  triggers = require('../../triggers');

var mongoose = require('mongoose');
var logger = require('log4js'),
  log = logger.getLogger('ifttt');

var IFTTTSchema = mongoose.Schema({
  'key': {
    'type': String,
    'required': true,
    'unique': true,
    'index': true
  },
  'triggers': Array,
  'created': { 'type': Date, 'default': Date.now },
  'updated': { 'type': Date, 'default': Date.now },
});

var IFTTT = function () {
  abode = require('../../abode');
  routes = require('./routes');

  abode.web.server.use('/api/ifttt', routes);

  if (abode.config.allow_uris.indexOf('/api/ifttt/trigger/*/*') === -1) {
    abode.config.allow_uris.push('/api/ifttt/trigger/*/*');
  }

  abode.config.ifttt.enabled = (abode.config.ifttt.enabled !== false);

  if (abode.config.ifttt.enabled) {
    IFTTT.enable();
  } else {
    log.warn('Computer provider not enabled: %s', abode.config.ifttt.enabled);
    IFTTT.enabled = false;
  }
  config = abode.config.ifttt || {};

  return IFTTT.load();
};

IFTTT.enable = function () {
  var defer = q.defer();

  log.info('Enabling IFTTT provider');
  IFTTT.enabled = true;
  defer.resolve({'status': 'success'});

  return defer.promise;
};

IFTTT.disable = function () {
  var defer = q.defer();

  log.info('Disabling IFTTT provider');
  IFTTT.enabled = false;
  defer.resolve({'status': 'success'});

  return defer.promise;
};

// Define a save function that returns an promise instead of using a callback
IFTTTSchema.methods._save = function (config) {
  var self = this,
    defer = q.defer();

  self.updated = new Date();

  if (config && Object.keys(config).length > 0) {
    Object.keys(config).forEach(function (k) {
      self[k] = config[k];
    });
  }

  self.save(function (err) {
    if (err) {

      // Reload the keys if we failed
      IFTTT.load().then(function () {
        log.error('Key failed to save:', self.name);
        log.debug(err.message || err);
        defer.reject(err);
      }, function (err) {
        log.warn('Failed to reload keys after failed save');
        defer.reject(err);
      });

    } else {
      log.info('Key saved successfully: ' + self.name);
      defer.resolve();
    }
  });

  return defer.promise;
};

// Define a delete function that cleans up rooms
IFTTTSchema.methods.delete = function () {
  var self = this,
    defer = q.defer();

  self.remove(function (err) {
    if (err) {
      log.error('Error deleting key: ', err);
      return defer.reject(err);
    }

    // Reload the devices
    IFTTT.load().then(function () {
      log.info('Key Deleted: ', self.name);
      defer.resolve();
    }, function (err) {
      log.info('Failed to reload keys');
      defer.reject(err);
    });

  });

  return defer.promise;
};

// Define the function that resolves all rooms to room objects
IFTTTSchema.methods.get_triggers = function () {
  var self = this,
    items = [];

  self.triggers.forEach(function (item) {
    var trigger = triggers.get_by_id(item);
    if (trigger !== false) {
      items.push(trigger);
    }
  });

  return items;
};

// Define a delete function that cleans up rooms
IFTTTSchema.methods.add_trigger = function (trigger) {
  var msg,
    self = this,
    defer = q.defer();

  //Check if we have a proper room object
  if ( !(trigger instanceof triggers.model) ) {
    msg = 'Trigger is not an instance of Triggers';
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Check if trigger is already added
  if (self.triggers.indexOf(trigger._id) > -1 ) {
    msg = 'Trigger already added to key';
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Add the trigger
  self.triggers.push(trigger._id);

  //Save the key
  self._save().then(function () {
    defer.resolve({'status': 'success'});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

// Define a function that removes a room from a device
IFTTTSchema.methods.remove_trigger = function (trigger) {
  var msg,
    self = this,
    defer = q.defer();

  //Check if we have a proper room object
  if ( !(trigger instanceof triggers.model) ) {
    msg = 'Trigger is not an instance of Trigger';
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Check if room is exists
  if (self.triggers.indexOf(trigger._id) === -1 ) {
    msg = 'Trigger not found in Key';
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  self.triggers.splice(self.triggers.indexOf(trigger._id), 1);

  self._save().then(function () {
    defer.resolve({'status': 'success', 'message': 'Removed Trigger'});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

IFTTT.model = mongoose.model('IFTTT', IFTTTSchema);

// Create a new key
IFTTT.create = function (config) {
  var self = this,
    defer = q.defer(),
    key = new IFTTT.model(config);

  // Save the device
  key.save( function (err) {
    if (err) {
      log.error(err.message || err);
      defer.reject(err);
      return defer.promise;
    }

    log.info('Key created: ', config.key);
    self._keys.push(key);
    defer.resolve(key);
  });

  return defer.promise;
};

// Return all keys
IFTTT.list = function () { return IFTTT._keys; };

//Load all keys from the database
IFTTT.load = function () {
  var defer = q.defer();

  IFTTT.model.find(function (err, keys) {
    if (err) { defer.reject(err); }

    //Add each device to the _Devices array
    IFTTT._keys = keys;
    log.debug('IFTTT loaded successfully');
    defer.resolve(IFTTT._keys);
  });

  return defer.promise;
};

//Return a hash of keys with the key as the keys
IFTTT.get_by_key = function (id) {
  var keys = this.list();
  var key = keys.filter(function (item) { return (item.key === id); });

  if (key.length === 0) {
    return false;
  } else {
    return key[0];
  }
  return;
};

//Return a hash of keys with the id as the keys
IFTTT.get_by_id = function (id) {
  var keys = this.list();
  var key = keys.filter(function (item) { return (String(item._id) === String(id)); });

  if (key.length === 0) {
    return false;
  } else {
    return key[0];
  }
};

IFTTT.get = function (id) {
  return IFTTT.get_by_id(id) || IFTTT.get_by_key(id);
};

module.exports = IFTTT;
