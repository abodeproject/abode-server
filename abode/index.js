'use strict';

var q = require('q');
var fs = require('fs');
var ini = require('ini');
var merge = require('merge');
var mongoose = require('mongoose');
var events = require('events');
var logger = require('log4js'),
  log = logger.getLogger('abode');

var Abode = function() { };

Abode.init = function (config) {
  var defer = q.defer();

  //Set our default config options
  config = config || {};
  config.path = config.path || './config.ini';
  config.read_config = config.read_config || true;
  config.allow_networks = config.allow_networks || ['127.0.0.1'];
  config.ip_header = config.ip_header;
  config.allow_uris = config.allow_uris || ['/', '/auth', '/scripts/*', '/css/*', '/images/*', '/views/*'];
  config.database = config.database || {};
  config.database.server = config.database.server || 'localhost';
  config.database.database = config.database.database || 'abode';
  config.providers = config.providers || [];
  config.fail_on_provider = config.fail_on_provider || true;

  //Create a new event emitter
  Abode.events = new events.EventEmitter();

  //Load the config.ini
  if (fs.existsSync(config.path) && config.read_config === true) {
    var parsed_config = ini.parse(fs.readFileSync(config.path, 'utf-8'));
    Abode.config = merge(config, parsed_config);
  } else {
    Abode.config = config;
  }

  //Set our log level
  if (Abode.config.debug) {
    log.setLevel('DEBUG');
  } else {
    log.setLevel('INFO');
  }

  var loadModule = function (mod) {

    var func = Abode[mod];

    if (func instanceof Function ) {
      var mod_log = logger.getLogger('abode.' + mod);

      log.debug('Setting log level: abode.' + mod);

      //Set our log level
      if (Abode.config[mod] && Abode.config[mod].debug) {
        mod_log.setLevel('DEBUG');

      } else {
        mod_log.setLevel('INFO');
      }

      func.config = Abode.config[mod] || {};
      return func;
    } else {
      var defer = q.defer();

      log.error('Error loading getting module: ' + mod);
      defer.reject({'status': 'failed', 'message': 'Failed to get module: ' + mod});

      return defer.promise;
    }

  };

  //Define the function to start everything after the db is connected
  var start = function() {
    //Load out modules
    Abode.providers = require('../providers');
    Abode.auth = require('../auth');
    Abode.rooms = require('../rooms');
    Abode.devices = require('../devices');
    Abode.triggers = require('../triggers');
    Abode.web = require('../web');
    Abode.web.init();


    //Start initializing our modules
    loadModule('providers')(Abode.config.providers)
    .then(loadModule('web'))
    .then(loadModule('auth'))
    .then(loadModule('rooms'))
    .then(loadModule('devices'))
    .then(loadModule('triggers'))
    .then(function() {
      Abode.events.emit('ABODE_STARTED');
      defer.resolve();
    }, function (err) {
      log.error(err);
      defer.reject(err);
    });
  };

  //Connect to the database
  Abode.db = mongoose.connect('mongodb://' + Abode.config.database.server + '/' + Abode.config.database.database).connection;

  //Register our event handlers for the database
  Abode.db.on('error', function (err) {
    log.error('Connection error: %s', err);
  });
  Abode.db.once('open', start);

  return defer.promise;
};

module.exports = Abode;

