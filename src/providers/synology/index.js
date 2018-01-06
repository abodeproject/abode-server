'use strict';
var Q = require('q'),
  fs = require('fs'),
  logger = require('log4js'),
  request = require('request'),
  log = logger.getLogger('synology');

var abode, events, routes, config;

var Synology = function () {
  var defer = Q.defer();
  abode = require('../../abode');
  events = abode.events;
  routes = require('./routes');

  config = abode.config.synology = abode.config.synology || {};
  config.enabled = config.enabled || true;
  config.interval = config.interval || 10;
  config.image_path = config.image_path || 'public/synology/cameras';
  
  abode.web.server.use('/api/synology', routes);
  Synology.enabled = false;
  Synology.cameras = [];

  abode.events.on('ABODE_STARTED', function () {
    if (config.enabled === false) {
      Synology.status = 'Not enabled';
      log.warn('Not starting Synology.  Not enabled');
      return;
    }

    log.info('Starting Synology provider');
    Synology.enable();
  });

  fs.stat(config.image_path, function (err) {
    if (err) {

      log.info('Creating image store:', config.image_path);

      fs.mkdir(config.image_path, function (err) {
        if (err) {
          Synology.can_write = false;
          log.error('Failed to create image store:', config.image_path);
        } else {
          Synology.can_write = true;
        }
      });

    } else {
      Synology.can_write = true;
    }

  });

  log.debug('Synology provider initialized');
  defer.resolve(Synology);
  
  return defer.promise;
};

Synology.poll = function () {
  if (Synology.polling) {
    log.warn('Poller has been running since: %s', Synology.polling);
    return;
  }
  
  Synology.polling = new Date();
  
  log.debug('Polling cameras');
  Synology.load()
  .then(function () {
    //Sync cameras to abode devices
    var devices = abode.devices.get_by_provider('synology');
    
    devices.forEach(function (device) {
      Synology.get(device.config.id)
      .then(function (camera) {
        var state = {
          '_motion': camera.recStatus > 0,
          'last_seen': new Date()
        };
        
        device.set_state(state);
      })
      .fail(function (err) {
        log.error(err.message || err);
      });
    });
    
    Synology.last_polled = new Date();
    Synology.polling = undefined;
  })
  .fail(function () {
    Synology.polling = undefined;
  });
  
};

Synology.get = function (id) {
  var defer = Q.defer();
  
  var match = Synology.cameras.filter(function (camera) {
    return (camera.id === id);
  });
  
  if (match.length !== 1) {
    defer.reject({'message': 'Could not find device: %s', id});
  } else {
    defer.resolve(match[0]);
  }
  
  return defer.promise;
};

Synology.enable = function (user, password) {
  var defer = Q.defer();
  
  Synology.status = 'Enabling';
    
  Synology.login(user, password)
  .then(function (auth) {
    Synology.enabled = true;
    Synology.status = 'connected';
    
    Synology.poller = setInterval(Synology.poll, config.interval * 1000);
    Synology.load();
    
    defer.resolve(auth);
  })
  .fail(function (err) {
    Synology.enabled = false;
    Synology.status = 'Invalid username or password';
    log.error('Failed to enable Synology: ' + err.message);
    defer.reject(err);
  });
  
  return defer.promise;
};

Synology.load = function () {
  var defer = Q.defer();
  
  Synology.req('SYNO.SurveillanceStation.Camera', 'List', {
    'blIncludeDeletedCam': 'false',
    'privCamType': '3',
    'streamInfo': 'true',
    'blPrivilege': 'false',
    'basic': 'true',
    'blFromCamList': 'true',
    'camStm': '1'
  })
  .then(function (cameras) {
    Synology.cameras = cameras.cameras.map(function (camera) {
      return {
        'id': camera.id,
        'name': camera.name,
        'status': camera.status,
        'recStatus': camera.recStatus,
        'model': camera.model,
        'host': camera.ip,
        'port': camera.port,
        'vendor': camera.vendor,
      };
    });
    
    defer.resolve(Synology.cameras);
  })
  .fail(function (err) {
    log.error('Failed to poll cameras: %s', err.message || err);
    defer.reject(err);
  });
  
  return defer.promise;
};

Synology.getLiveUrls = function (ids) {
  var defer = Q.defer();
  
  Synology.req('SYNO.SurveillanceStation.Camera', 'GetLiveViewPath', {
    'idList': ids
  })
  .then(function (urls) {
    defer.resolve(urls);
  })
  .fail(function (err) {
    defer.reject(err);
  });
  
  return defer.promise;
};

Synology.getSnapshot = function (id) {
  var defer = Q.defer();
  
  Synology.req('SYNO.SurveillanceStation.Camera', 'GetSnapshot', {
    'profileType': '0',
    'id': id
  }, true)
  .then(function (data) {

    var path = config.image_path + '/' + id + '.jpg';
    fs.writeFile(path, data, function(err) {
        if(err) {
          log.error('Failed to write snapshot to disk');
          return;
        }
    
        log.debug('Saved snapshot to disk');
    }); 

    defer.resolve(data);
  })
  .fail(function (err) {
    defer.reject(err);
  });
  
  return defer.promise;
};

Synology.login = function (user, password) {
  var defer = Q.defer();
  
  user = user || config.user;
  password = password || config.password;
  
  if (!user || !password) {
    defer.reject({'message': 'No username/password specified'});
    return defer.promise;
  }
  
  Synology.req('SYNO.API.Auth', 'Login', {
    'account': user, 
    'passwd': password, 
    'session': 'SurveillanceStation', 
    'format': 'sid'
  })
  .then(function (auth) {
    Synology.token = auth.sid;
    defer.resolve(auth);
  })
  .fail(function (err) {
    defer.reject(err);
  });
  
  return defer.promise;
};

Synology.req = function (api, method, args, raw) {
  var url,
    defer = Q.defer();
  
  if (!config.server) {
    defer.reject({'message': 'No Synology Server Configured'});
    return defer.promise;
  }
  
  if (!base_args[api]) {
    defer.reject({'message': 'Invalid Synology API: ' + api});
    return defer.promise;
  }
  
  url = config.server + base_args[api].url + '?api=' + api + '&method=' + method + '&version=' + base_args[api].version;
  
  if (Synology.token) {
    url += '&_sid=' + Synology.token;
  }
  
  Object.keys(args).forEach(function(key) {
    url += '&' + key + '='  + args[key];
  });
  
  log.debug('Making request to synology: ' + url);
  
  request.get(url, function (err, response, body) {
    if (!raw) {
      body = JSON.parse(body);
    }
    
    if (err || body.error || body.success === false) {
      return defer.reject(err || {'message': body.error});
    }
    
    defer.resolve(body.data || body);
  });
  
  return defer.promise;
}

var base_args = {
  'SYNO.API.Auth': {
    'json': true,
    'version': 2,
    'url': '/webapi/auth.cgi'
  },
  'SYNO.SurveillanceStation.Camera': {
    'json': true,
    'version': 9,
    'url': '/webapi/entry.cgi'
  }
};

module.exports = Synology;