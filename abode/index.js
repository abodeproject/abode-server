'use strict';

var q = require('q');
var fs = require('fs');
var os = require('os');
var ini = require('ini');
var hat = require('hat');
var merge = require('merge');
var mongoose = require('mongoose');
var events = require('events');
var logger = require('log4js'),
  log = logger.getLogger('abode');
var ssdp = require('node-ssdp').Server;
var ssdp_client = require('node-ssdp').Client;

var Abode = function() { };

Abode.get_ip = function () {
  var interfaces = os.networkInterfaces();
  var addresses = [];
  for (var k in interfaces) {
      for (var k2 in interfaces[k]) {
          var address = interfaces[k][k2];
          if (address.family === 'IPv4' && !address.internal) {
              addresses.push(address.address);
          }
      }
  }

  if (addresses.length > 0) {
    return addresses[0];
  } else {
    return 'localhost';
  }

};

Abode.init = function (config) {
  var defer = q.defer();

  //Set our default config options
  config = config || {};
  config.path = config.path || './config.ini';
  config.read_config = config.read_config || true;
  config.allow_networks = config.allow_networks || ['127.0.0.1'];
  config.ip_header = config.ip_header;
  config.allow_uris = config.allow_uris || ['/','/api/notifications/action/*', '/api/auth', '/api/auth/login', '/scripts/*', '/css/*', '/images/*', '/views/*', '/fonts/*', '/webcam/*', 'favicon.ico', '/font/*', '/api/events/*'];
  config.database = config.database || {};
  config.database.server = config.database.server || 'localhost';
  config.database.database = config.database.database || 'abode';
  config.providers = config.providers || ['display','video'];
  config.fail_on_provider = config.fail_on_provider || true;
  config.hearbeat_interval = config.hearbeat_interval || 10;
  config.event_cache_size = 100;
  config.disable_upnp = (config.disable_upnp === undefined) ? false : config.disable_upnp;
  config.upnp_client_timeout = config.upnp_client_timeout || 2;
  config.mode = config.mode || 'device';
  config.name = config.name || 'Local';
  config.url = config.url || 'http://' + Abode.get_ip() + ':8080';

  Abode.save_needed = false;
  Abode.views = {};

  //Create a new event emitter
  Abode.events = new events.EventEmitter();
  Abode.event_cache = [];
  Abode.keys = [];

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
    Abode.interfaces = require('../interfaces');
    Abode.notifications = require('../notifications');
    Abode.eventfeed = require('../eventfeed');
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
    .then(loadModule('interfaces'))
    .then(loadModule('notifications'))
    .then(loadModule('eventfeed'))
    .then(function() {
      Abode.events.emit('ABODE_STARTED');
      if (!config.disable_upnp) {
        Abode.start_upnp();
      }
      defer.resolve();
    }, function (err) {
      log.error(err);
      defer.reject(err);
    });
  };

  if (config.mode === 'server') {

    //Connect to the database
    Abode.db = mongoose.connect('mongodb://' + Abode.config.database.server + '/' + Abode.config.database.database).connection;

    //Register our event handlers for the database
    Abode.db.on('error', function (err) {
      log.error('Connection error: %s', err.message || err);
      process.exit(1);
    });
    Abode.db.once('open', start);

  } else {
    Abode.providers = require('../providers');
    Abode.web = require('../web');
    Abode.web.init();
    Abode.web.server.use('/api/abode', require('./routes'));

    loadModule('providers')(['display','video'])
    .then(loadModule('web'))
    .then(function () {
      Abode.events.emit('ABODE_STARTED');
      if (!config.disable_upnp) {
        Abode.start_upnp();
      }
      defer.resolve();
    }, function (err) {
      log.error(err);
      defer.reject(err);
    });
  }

  return defer.promise;
};

Abode.start_upnp = function () {
  Abode.upnp = new ssdp({'udn': Abode.config.name, 'location': Abode.config.url});
  if (Abode.config.mode === 'server') {
    Abode.upnp.addUSN('abode:server');
  } else {
    Abode.upnp.addUSN('abode:device');
  }
  Abode.upnp.start();
  log.info('UPNP Server Started');
};

Abode.detect_upnp = function (type) {
  var results = [],
    defer = q.defer(),
    client = new ssdp_client();

  type = type || 'abode:server';
  
  //Set our response handler
  client.on('response', function (headers, statusCode, rinfo) {
    var name = headers.USN.split('::')[0];
    var matches = results.filter(function (item) { return (item.url === headers.LOCATION); })

    //If we have an existing entry, skip it
    if (matches.length > 0) {
      return;
    }

    //Do not return our self
    if (headers.LOCATION === Abode.config.url) {
      return;
    }

    //If a client returns localhost we won't be able to connect so ignore it
    if (headers.LOCATION.indexOf('localhost') !== -1) {
      return;
    }


    //Add response to our results array
    results.push({
      'name': name,
      'url': headers.LOCATION
    });
  });

  //Search for abode servers
  client.search(type);

  //Timeout 
  setTimeout(function () {
    defer.resolve(results);
  }, Abode.config.upnp_client_timeout * 1000);

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
  Abode.config[section] = Abode.config[section] || {};
  if (Abode.config.providers.indexOf(section) === -1) {
    Abode.config.providers.push(section);
  }

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
Abode.list_views = function () {
  var defer = q.defer();

  fs.readdir('views/', function (err, files) {
    if (err) {
      defer.reject(err);
      return;
    }

    files = files.filter(function (file) {
      return (file.indexOf('.html') > 0);
    });

    defer.resolve(files);
  });


  return defer.promise;
};
Abode.read_view = function (file) {
  var defer = q.defer();

  var read_default = function () {

    fs.readFile('views/defaults/home.html', 'utf8', function (err, data) {
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

  if (!file) {
    read_default();
  } else {
    read_custom();
  }

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

    //if (views.indexOf(view) === -1) {
    //  defer.reject({'status': 'failed', 'message': 'View not found'});
    //  return;
    //}

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


  fs.writeFile('views/' + view, data, function (err) {
    if (err) {
      defer.reject({'status': 'failed', 'message': err});
      return;
    }

    defer.resolve({'status': 'success', 'view': view});

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

Abode.check_key = function (key) {
  var defer = q.defer();

  if (Abode.keys.indexOf(key) > -1) {
    defer.resolve();  
  } else {
    defer.reject({'status': 'failed', 'message': 'Invalid Token', 'http_code': 401});
  }

  return defer.promise;
};

Abode.make_key = function () {
  var defer = q.defer();
  var key = hat(256, 16);

  Abode.keys.push(key);

  setTimeout(function () {
    Abode.keys[Abode.keys.indexOf(Abode.keys, key)] = null;
  }, 10 * 1000);

  defer.resolve(key);

  return defer.promise;
};

module.exports = Abode;

