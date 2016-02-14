'use strict';

var abode;
var sources;
var routes;
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('sources');
var mongoose = require('mongoose');
var request = require('request');

// Define our main Sources object
var Sources = function () {
  var defer = q.defer();
  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/api/sources', routes);

  Sources.load().then(function () {
    defer.resolve();
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Sources._sources = [];
Sources._timers = {};

// Define the source schema for the database
var SourceSchema = mongoose.Schema({
  'name': {
    'type': String,
    'required': true,
    'unique': true,
    'index': true,
  },
  'url': {'type': String, 'required': true},
  'username': {'type': String},
  'password': {'type': String},
  'created': Date,
  'updated': Date
});


// Wrapper function that returns a promise instead of requiring a callback
SourceSchema.methods._save = function () {
  var defer = q.defer();

  this.save(function (err) {
    if (err) {
      log.error('Failed to save source:', err)
      defer.reject(err);
    } else {
      log.info('Source saved successfully');
      defer.resolve();
    }
  });

  return defer.promise;
};

// Wrapper function that cleans up devices before deleting a room
SourceSchema.methods.delete = function () {
  var self = this,
    defer = q.defer();

  self.remove(function (err) {
    if (err) {
      log.error('Error deleting source: ', err);
      return defer.reject(err);
    }

    // Reload the rooms
    Sources.load().then(function () {
      log.debug('Source Deleted: ', self.name);
      defer.resolve();
    }, function (err) {
      log.error('Failed to reload sources');
      defer.reject(err);
    });

  });

  return defer.promise;
};

SourceSchema.methods.proxy = function (method, uri, body) {
  var self = this,
    defer = q.defer();

  var options = {
    'method': method,
    'baseUrl': self.url,
    'uri': uri,
  };

  console.log(options);

  request(options, function (err, response, body) {
    if (err) {
      defer.reject({'status': 'failed', 'message': 'Failed to proxy request to source', 'details': err});
      return;
    }

    defer.resolve({
      'status': response.statusCode,
      'body': JSON.parse(body || {}),
    })
  });

  return defer.promise;
};

Sources.model = mongoose.model('Sources', SourceSchema);


// Return all the source
Sources.list = function () { return Sources._sources; };

// Create a new source
Sources.create = function (config) {
  var self = this,
    defer = q.defer(),
    source = new Sources.model(config);

  // create an empty devices array
  source._devices = [];

  // Create the new source
  source.save( function (err) {
    if (err) {
      log.error('Failed to create source', err);
      log.debug(err.message || err);

      defer.reject({'status': 'failed', 'message': 'Failed to create source', 'error': err});
      return defer.promise;
    }

    log.info('Source created: ', config.name);
    self._sources.push(source);

    defer.resolve(source);
  });

  return defer.promise;
};

// Load all the sources
Sources.load = function () {
  var defer = q.defer();

  Sources.model.find(function (err, sources) {
    if (err) { defer.reject(err); }

    Sources._sources = sources;
    log.debug('Sources loaded successfully');
    defer.resolve(sources);
  });

  return defer.promise;
};

//Given a name, return the source
Sources.get_by_name = function (name) {
  var sources = this.list();
  var source = sources.filter(function (item) { return (item.name === name); });

  if (source.length === 0) {
    return false;
  } else {
    return source[0];
  }
};

//Given an id, return the source
Sources.get_by_id = function (id) {
  var sources = this.list();
  var source = sources.filter(function (item) { return (String(item._id) === String(id)); });

  if (source.length === 0) {
    return false;
  } else {
    return source[0];
  }
};


//Return a hash of sources with the names as the keys
Sources.by_name = function () {
  var sources = this.list(),
    by_name = {};

  sources.forEach(function (r) {
    by_name[r.name] = r;
  });

  return by_name;
};

Sources.get = function (id) {
  return Sources.get_by_id(id) || Sources.get_by_name(id);
};

module.exports = Sources;
