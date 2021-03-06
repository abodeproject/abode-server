'use strict';

var Q = require('q');
var fs = require('fs');
var os = require('os');
var path = require('path');
var yaml = require('node-yaml');
var hat = require('hat');
var merge = require('merge');
var mongoose = require('mongoose');
var events = require('events');
var logger = require('log4js'),
  log = logger.getLogger('abode');
var request = require('request');
var mdns = require('mdns');
var exec = require('child_process').exec;
mongoose.Promise = Q.Promise;

var Abode = function() { };

Abode.get_ip = function () {
  var interfaces = os.networkInterfaces();
  var addresses = [];

  Object.keys(interfaces).forEach(function (iface) {
    interfaces[iface].forEach(function (address) {

      if (address.family === 'IPv4' && address.internal === false) {
          addresses.push(address.address);
      }
    });
  });

  if (addresses.length > 0) {
    return addresses[0];
  } else {
    return 'localhost';
  }

};

Abode.init = function (config) {
  var defer = Q.defer();

  //Set our default config options
  config = config || {};
  config.path = config.path || '../config.yaml';
  config.read_config = config.read_config || true;
  config.allow_networks = config.allow_networks || ['127.0.0.1'];
  config.ip_header = config.ip_header || '';
  config.allow_uris = config.allow_uris || ['/','/api/notifications/action/*', '/api/auth/login', '/scripts/*', '/css/*', '/images/*', '/views/*', '/fonts/*', '/webcam/*', 'favicon.ico', '/font/*', '/api/events/feed/*'];
  config.database = config.database || {};
  config.database.server = config.database.server || 'localhost';
  config.database.port = config.database.port || '27017';
  config.database.database = config.database.database || 'abode';
  config.providers = config.providers || ['rad','browser', 'time'];
  config.fail_on_provider = config.fail_on_provider || true;
  config.hearbeat_interval = config.hearbeat_interval || 10;
  config.event_cache_size = config.event_cache_size || 100;
  config.disable_mdns = (config.disable_mdns === undefined) ? false : config.disable_mdns;
  config.debug = (config.debug === undefined) ? false : config.debug;
  config.mdns_client_timeout = config.mdns_client_timeout || 2;
  config.mode = config.mode || 'device';
  config.name = config.name || 'Local';
  config.url = config.url || 'http://' + Abode.get_ip() + ':8080';
  config.expire_logins = config.expire_logins || 1;

  Abode.config = config;
  Abode.save_needed = false;
  Abode.views = {};

  //Create a new event emitter
  Abode.events = new events.EventEmitter();
  Abode.event_cache = [];
  Abode.keys = [];

  //Load the config.ini
  var yaml_path = path.resolve(config.path);

  if (fs.existsSync(config.path) && config.read_config === true) {
    log.info('Loading configuration file: %s', yaml_path);
    var parsed_config = yaml.readSync(yaml_path);
    Abode.config = merge(config, parsed_config);
    //Abode.config = merge.recursive(true, config, parsed_config);
  } else {
    log.info('No configuration file found: %s', yaml_path);
    Abode.config = config;
  }

  logger.clearAppenders();
  logger.loadAppender('file');
  logger.loadAppender('dateFile');
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
      if (Abode.config[mod] && Abode.config[mod].debug || Abode.config.debug) {
        mod_log.setLevel('DEBUG');

      } else {
        mod_log.setLevel('INFO');
      }

      func.config = Abode.config[mod] || {};
      return func;
    } else {
      var defer = Q.defer();

      log.error('Error loading getting module: ' + mod);
      defer.reject({'status': 'failed', 'message': 'Failed to get module: ' + mod});

      return defer.promise;
    }

  };

  //Define the function to start everything after the db is connected
  var start = function() {
    log.info('Loading providers');

    //Load out modules
    Abode.providers = require('../providers');
    Abode.network = require('../network');
    Abode.auth = require('../auth');
    Abode.sources = require('../sources');
    Abode.rooms = require('../rooms');
    Abode.devices = require('../devices');
    Abode.triggers = require('../triggers');
    Abode.scenes = require('../scenes');
    Abode.interfaces = require('../interfaces');
    Abode.notifications = require('../notifications');
    Abode.eventfeed = require('../eventfeed');
    Abode.history = require('../history');
    Abode.web = require('../web');
    Abode.web.init();

    Abode.web.server.use('/api/abode', require('./routes'));

    //Start initializing our modules
    loadModule('providers')(Abode.config.providers)
    .then(loadModule('web'))
    .then(loadModule('network'))
    .then(loadModule('auth'))
    .then(loadModule('sources'))
    .then(loadModule('rooms'))
    .then(loadModule('devices'))
    .then(loadModule('triggers'))
    .then(loadModule('scenes'))
    .then(loadModule('interfaces'))
    .then(loadModule('notifications'))
    .then(loadModule('eventfeed'))
    .then(loadModule('history'))
    .then(function() {
      Abode.events.emit('ABODE_STARTED');
      if (!config.disable_upnp) {
        Abode.start_mdns();
      }
      defer.resolve();
    }, function (err) {
      log.error(err);
      defer.reject(err);
    });
  };

  if (config.mode === 'server') {
    log.info('Starting Abode in Server mode');

    //Connect to the database
    log.debug('Connecting to DB: mongodb://%s/%s', Abode.config.database.server, Abode.config.database.database);
    mongoose.connect('mongodb://' + Abode.config.database.server + ':' + Abode.config.database.port + '/' + Abode.config.database.database, { useNewUrlParser: true })
      .then(function (db) {
        Abode.db = db;
        start();
      }, function (err) {
        log.error('Connection error: %s', err.message || err);
        process.exit(1);
      })
      .fail(function (err) {
        log.error('Abode crashed: %s', err.message);
        log.error(err.stack);
      });

  } else {
    log.info('Starting Abode in Device mode');
    Abode.providers = require('../providers');
    Abode.network = require('../network');
    Abode.web = require('../web');
    Abode.web.init();
    Abode.web.server.use('/api/abode', require('./routes'));

    loadModule('providers')(['display','video'])
    .then(loadModule('web'))
    .then(loadModule('network'))
    .then(function () {
      Abode.events.emit('ABODE_STARTED');
      if (!config.disable_mdns) {
        Abode.start_mdns();
      }
      defer.resolve();
    }, function (err) {
      log.error(err);
      defer.reject(err);
    });
  }

  return defer.promise;
};

Abode.start_mdns = function () {
  var mdns_advert,
    mdns_config = JSON.stringify({'name': Abode.config.name, 'url': Abode.config.url}),
    mdns_buffer = new Buffer(mdns_config),
    mdns_base64 ={'base64': mdns_buffer.toString('base64')};

  if (Abode.config.mode === 'server') {
    mdns_advert = mdns.createAdvertisement(mdns.tcp('abode-server'), 80, {txtRecord: mdns_base64});
  } else {
    mdns_advert = mdns.createAdvertisement(mdns.tcp('abode-device'), 80, {txtRecord: mdns_base64});
  }

  mdns_advert.start();
  log.info('mDNS Advertisement Started');
};

Abode.detect_mdns = function (type) {
  var browser,
    results = [],
    defer = Q.defer(),
    sequence = [
      mdns.rst.DNSServiceResolve()
    ];

  type = type || 'abode-server';
  browser  = mdns.createBrowser(mdns.tcp(type), {resolverSequence: sequence});

  //Set our response handler
  browser.on('serviceUp', function (service) {

    if (!service.txtRecord || !service.txtRecord.base64) {
      return;
    }

    var config = new Buffer(service.txtRecord.base64, 'base64');
    config = config.toString('ascii');
    config = JSON.parse(config);

    var matches = results.filter(function (service) {
      return (service.url === config.url);
    });

    if (matches.length > 0) {
      return;
    }

    //Add response to our results array
    results.push({
      'name': config.name,
      'url': config.url
    });
  });

  //Search for abode servers
  browser.start();

  //Timeout
  setTimeout(function () {
    defer.resolve(results);
  }, Abode.config.mdns_client_timeout * 1000);

  return defer.promise;
};

Abode.write_config = function () {
  var defer = Q.defer(),
    yaml_path = path.resolve(Abode.config.path);

  yaml.write(yaml_path, Abode.config).then(function () {
    defer.resolve({'status': 'success'});
  }, function (err) {
    defer.reject({'status': 'failed', 'message': err});
  });

  return defer.promise;
};

Abode.update_config = function (data, section) {
  var defer = Q.defer();

  Abode.save_needed = true;
  if (section !== undefined) {
    Abode.config[section] = Abode.config[section] || {};
    if (Abode.config.providers.indexOf(section) === -1) {
      Abode.config.providers.push(section);
    }
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
  var defer = Q.defer();

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
  var defer = Q.defer();

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
  var defer = Q.defer();

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
  var defer = Q.defer();

  Abode.default_views().then(function () {

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
  var defer = Q.defer();


  fs.writeFile('views/' + view, data, function (err) {
    if (err) {
      defer.reject({'status': 'failed', 'message': err});
      return;
    }

    defer.resolve({'status': 'success', 'view': view});

  });

  return defer.promise;
};

Abode.delete_view = function (view) {
  var defer = Q.defer();


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
  var defer = Q.defer();

  if (Abode.keys.indexOf(key) > -1) {
    defer.resolve();
  } else {
    defer.reject({'status': 'failed', 'message': 'Invalid Token', 'http_code': 401});
  }

  return defer.promise;
};

Abode.make_key = function () {
  var defer = Q.defer();
  var key = hat(256, 16);

  Abode.keys.push(key);

  setTimeout(function () {
    Abode.keys[Abode.keys.indexOf(Abode.keys, key)] = null;
  }, 10 * 1000);

  defer.resolve(key);

  return defer.promise;
};

Abode.import_ca = function (url) {
  var defer = Q.defer();

  var process_cb = function (err, stdout, stderr) {
    if (err) {
      log.error('Error importing certificate: %s', err);
      defer.reject({'message': stderr});
      return;
    }

    log.info('Successfully import CA cert');
    defer.resolve({'message': 'Successfully Import CA Certificate'});
  };

  var do_import = function (err) {
    if (err) {
      log.error('Error writing temporary file: %s', err);
      defer.reject({'message': err});
      return;
    }

    if (process.env.HOME) {
      log.info('Importing CA cert into chromium key store');
      exec('/usr/bin/certutil -d sql:' + process.env.HOME + '/.pki/nssdb -A -t "CT,C,C" -n abode -i ' + '/tmp/ca.crt', process_cb);
    } else {
      defer.reject({'message': 'Could not determine nssdb path.  Missing HOME'});
    }
  };

  var get_ca_cb = function (err, result) {
    delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;

    if (err) {
      defer.reject({'message': err});
      return;
    }

    if (result.body.ca_cert) {
      log.info('CA cert specified, starting import');
      fs.writeFile('/tmp/ca.crt', result.body.ca_cert, 'utf8', do_import);
    } else {
      log.info('No CA cert specified');
      defer.resolve({'message': 'No CA Cert to Import'});
    }
  };

  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

  log.info('Looking for CA certificate: %s', url);
  request({
    uri: url + '/api/abode/status',
    rejectUnauthorized: false,
    json: true
  }, get_ca_cb);

  return defer.promise;
};

Abode.check_db = function (config) {
  var db,
      defer = Q.defer();

  log.debug('Checking DB: mongodb://%s/%s', config.server, config.database);
  db = mongoose.connect('mongodb://' + config.server + '/' + config.database).connection;

  db.on('error', function (err) {
    log.error('Connection error: %s', err.message || err);
    defer.reject({'status': 'failed', 'message': err.message || err});
  });

  db.once('open', function () {
    defer.resolve({'status': 'success'});
    db.close();
  });

  return defer.promise;
};

Abode.reload = function () {
  var defer = Q.defer();

  defer.resolve();

  setTimeout(function () {
    process.exit(255);
  }, 1000);

  return defer.promise;
};

module.exports = Abode;

