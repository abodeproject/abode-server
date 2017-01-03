'use strict';

var abode;
var routes;
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('interfaces');
var mongoose = require('mongoose');

// Define our main Rooms object
var Interfaces = function () {
  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/api/interfaces', routes);

  return Interfaces.load();
};


// Define the room schema for the database
var InterfacesSchema = mongoose.Schema({
  'name': {
    'type': String,
    'required': true,
    'unique': true,
    'index': true
  },
  'icon': {'type': String, 'required': true,},
  'template': {'type': String, 'required': true,},
});

// Wrapper function that returns a promise instead of requiring a callback
InterfacesSchema.methods._save = function () {
  var self = this,
    defer = q.defer();

  this.save(function (err) {
    if (err) {
      defer.reject(err);
    } else {
      log.info('Interface saved successfully: ' + self.name);
      abode.events.emit('UPDATED', {'type': 'interface', 'name': self.name, 'object': self});
      defer.resolve();
    }
  });

  return defer.promise;
};

// Wrapper function that cleans up devices before deleting a room
InterfacesSchema.methods.delete = function () {
  var self = this,
    defer = q.defer();

  self.remove(function (err) {
    if (err) {
      log.error('Error deleting room: ', err);
      return defer.reject(err);
    }

    // Reload the interfaces
    Interfaces.load().then(function () {
      log.debug('Interface Deleted: ', self.name);
      defer.resolve();
    }, function (err) {
      log.error('Failed to reload interfaces');
      defer.reject(err);
    });

  });

  return defer.promise;
};

Interfaces.model = mongoose.model('Interfaces', InterfacesSchema);

Interfaces.list = function () { return Interfaces._interfaces; };

Interfaces.load = function () {
  var defer = q.defer();

  Interfaces.model.find(function (err, interfaces) {
    if (err) { defer.reject(err); }

    Interfaces._interfaces = interfaces;
    log.debug('Interfaces loaded successfully');
    defer.resolve(interfaces);
  });

  return defer.promise;
};

// Create a new room
Interfaces.create = function (config) {
  var self = this,
    defer = q.defer(),
    iface = new Interfaces.model(config);

  // Create the new room
  iface.save( function (err) {
    if (err) {
      log.error('Failed to create interface');
      log.debug(err.message || err);

      defer.reject({'status': 'failed', 'message': 'Failed to create interface', 'error': err});
      return defer.promise;
    }

    log.info('Interface created: ', config.name);
    self._interfaces.push(iface);

    defer.resolve(iface);
  });

  return defer.promise;
};

//Given a name, return the interface
Interfaces.get_by_name = function (name) {
  var interfaces = this.list();
  var iface = interfaces.filter(function (item) { return (item.name === name); });

  if (iface.length === 0) {
    return false;
  } else {
    return iface[0];
  }
};

//Given an id, return the interface
Interfaces.get_by_id = function (id) {
  var interfaces = this.list();
  var iface = interfaces.filter(function (item) { return (String(item._id) === String(id)); });

  if (iface.length === 0) {
    return false;
  } else {
    return iface[0];
  }
};


//Return a hash of interfaces with the names as the keys
Interfaces.by_name = function () {
  var interfaces = this.list(),
    by_name = {};

  interfaces.forEach(function (r) {
    by_name[r.name] = r;
  });

  return by_name;
};

Interfaces.get = function (id) {
  return Interfaces.get_by_id(id) || Interfaces.get_by_name(id);
};

module.exports = Interfaces;
