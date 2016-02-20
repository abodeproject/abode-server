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
  config.allow_uris = config.allow_uris || ['/', '/api/auth', '/scripts/*', '/css/*', '/images/*', '/views/*', '/fonts/*', '/webcam/*', 'favicon.ico', '/font/*'];
  config.database = config.database || {};
  config.database.server = config.database.server || 'localhost';
  config.database.database = config.database.database || 'abode';
  config.providers = config.providers || [];
  config.fail_on_provider = config.fail_on_provider || true;

  Abode.save_needed = false;
  Abode.views = {};
  Abode.clients = [];

  //Create a new event emitter
  Abode.events = new events.EventEmitter();

  //Load the config.ini
  if (fs.existsSync(config.path) && config.read_config === true) {
    var parsed_config = ini.parse(fs.readFileSync(config.path, 'utf-8'));
    Abode.config = merge(config, parsed_config);
  } else {
    Abode.config = config;
  }


  logger.clearAppenders();
  logger.loadAppender('file');
  logger.addAppender(logger.appenders.console(), 'abode');

  //Set our log level
  if (Abode.config.debug) {
    log.setLevel('DEBUG');
  } else {
    log.setLevel('INFO');
  }

  var loadModule = function (mod) {

    var func = Abode[mod];

    if (func instanceof Function ) {
      logger.addAppender(logger.appenders.console(), mod);
      var mod_log = logger.getLogger(mod);

      log.debug('Setting log level: ' + mod);

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
    Abode.sources = require('../sources');
    Abode.rooms = require('../rooms');
    Abode.devices = require('../devices');
    Abode.triggers = require('../triggers');
    Abode.scenes = require('../scenes');
    Abode.web = require('../web');
    Abode.web.init();
    Abode.web.server.use('/api/abode', require('./routes'));

    //Start initializing our modules
    loadModule('providers')(Abode.config.providers)
    .then(loadModule('web'))
    .then(loadModule('auth'))
    .then(loadModule('sources'))
    .then(loadModule('rooms'))
    .then(loadModule('devices'))
    .then(loadModule('triggers'))
    .then(loadModule('scenes'))
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
    process.exit(1);
  });
  Abode.db.once('open', start);

  return defer.promise;
};

Abode.write_config = function () {
  var defer = q.defer();

  fs.writeFile('config.ini', ini.encode(Abode.config, {whitespace: true}), function (err) {
    if (err) {
      defer.reject({'status': 'failed', 'message': err});
      return;
    }

    Abode.save_needed = false;
    defer.resolve({'status': 'success'});
  });

  return defer.promise;
};

Abode.update_config = function (data, section) {
  var defer = q.defer();

  Abode.save_needed = true;

  Object.keys(data).forEach(function (key) {
    if (section) {
      Abode.config[section][key] = data[key];
    } else {
      Abode.config[key] = data[key];
    }
  });

  defer.resolve({'status': 'success'});

  return defer.promise;
};
Abode.read_view = function (file) {
  var defer = q.defer();

  var read_default = function () {

    fs.readFile('views/defaults/' + file, 'utf8', function (err, data) {
      if (err) {
        defer.reject(err);
        return;
      }

      defer.resolve(data);

    });

  };

  var read_custom = function () {

    fs.readFile('views/' + file, function (err, data) {
      if (err) {
        read_default();
        return;
      }

      defer.resolve(data);

    });

  };

  read_custom();

  return defer.promise;
};

Abode.default_views = function () {
  var defer = q.defer();

  fs.readdir('views/defaults', function (err, files) {
    if (err) {
      defer.reject(err);
      return;
    }

    defer.resolve(files);

  });


  return defer.promise;
};

Abode.get_view = function (view) {
  var defer = q.defer();

  Abode.default_views().then(function (views) {

    if (views.indexOf(view) === -1) {
      defer.reject({'status': 'failed', 'message': 'View not found'});
      return;
    }

    Abode.read_view(view).then(function (data) {
      defer.resolve(data);
    }, function (err) {
      defer.reject({'status': 'failed', 'message': err});
    });

  }, function (err) {
    defer.reject({'status': 'failed', 'message': err});
  });


  return defer.promise;
};

Abode.write_view = function (view, data) {
  var defer = q.defer();


  Abode.default_views().then(function (views) {

    if (views.indexOf(view) === -1) {
      defer.reject({'status': 'failed', 'message': 'View not found'});
      return;
    }

    fs.writeFile('views/' + view, data, function (err) {
      if (err) {
        defer.reject({'status': 'failed', 'message': err});
        return;
      }

      defer.resolve({'status': 'success'});

    });

  }, function (err) {
    defer.reject({'status': 'failed', 'message': err});
  });

  return defer.promise;
};

Abode.delete_view = function (view, data) {
  var defer = q.defer();


  Abode.default_views().then(function (views) {

    if (views.indexOf(view) === -1) {
      defer.reject({'status': 'failed', 'message': 'View not found'});
      return;
    }

    fs.unlink('views/' + view, function (err) {
      if (err) {
        defer.reject({'status': 'failed', 'message': err});
        return;
      }

      defer.resolve({'status': 'success'});
    });

  }, function (err) {
    defer.reject({'status': 'failed', 'message': err});
  });

  return defer.promise;
};

module.exports = Abode;

