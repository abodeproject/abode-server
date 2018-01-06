'use strict';
var Q = require('q'),
  fs = require('fs'),
  path = require('path'),
  merge = require('merge'),
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
  config.image_path = config.image_path || 'public/synology';

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

  Synology.image_path = path.join(process.cwd(), config.image_path);

  fs.stat(Synology.image_path, function (err) {
    if (err) {

      log.info('Creating image store:', config.image_path);

      fs.mkdir(Synology.image_path, function (err) {
        if (err) {
          Synology.can_write = false;
          log.error('Failed to create image store:', Synology.image_path);
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

  var defers = []
  var devices = abode.devices.get_by_provider('synology');

  log.debug('Polling cameras');
  devices.forEach(function (device) {
    defers.push(device.status());
  });

  Q.allSettled(defers).then(function () {
    Synology.last_polled = new Date();
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

  if (Synology.enabled) {
    defer.reject({'message': 'Synology is already enabled'});
    return defer.promise;
  }

  Synology.status = 'Enabling';

  Synology.login(user, password)
  .then(function (auth) {
    Synology.enabled = true;
    Synology.status = 'connected';

    Synology.poller = setInterval(Synology.poll, config.interval * 1000);
    Synology.load();

    log.info('Synology enabled');
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

Synology.disable = function () {
  var defer = Q.defer();

  if (!Synology.enabled) {
    defer.reject({'message': 'Synology is already disabled'});
    return defer.promise;
  }

  if (Synology.poller) {
    clearInterval(Synology.poller);
  }

  Synology.enabled = false;
  Synology.status = 'disabled';

  defer.resolve();

  return defer.promise;
};

Synology.load = function () {
  var defer = Q.defer();

  if (!Synology.enabled) {
    defer.reject({'message': 'Synology not enabled'});
    return defer.promise;
  }

  Synology.req('SYNO.SurveillanceStation.Camera.List', {
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
        'name': camera.newName || camera.name,
        'status': camera.status,
        'recStatus': camera.recStatus,
        'model': camera.model,
        'host': camera.ip,
        'port': camera.port,
        'vendor': camera.vendor,
        'image_url': '/api/synology/snapshot/' + camera.id,
        'video_url': '/api/synology/live/' + camera.id
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

Synology.getInfo = function (ids) {
  var defer = Q.defer();

  if (!Synology.enabled) {
    defer.reject({'message': 'Synology not enabled'});
    return defer.promise;
  }

  Synology.req('SYNO.SurveillanceStation.Camera.GetInfo', {
    'cameraIds': ids,
    'blIncludeDeletedCam': 'false',
    'privCamType': '3',
    'basic': 'true',
    'streamInfo': 'true',
    'optimize': 'false',
    'ptz': 'false',
    'eventDetection': 'true',
    'deviceOutCap': 'false',
    'fisheye': 'false',
    'camAppInfo': 'true',
  })
    .then(function (info) {
      info.cameras = info.cameras.map(function (camera) {
        return {
          'id': camera.id,
          'name': camera.newName || camera.name,
          'status': camera.status,
          'recStatus': camera.recStatus,
          'model': camera.model,
          'host': camera.host,
          'port': camera.port,
          'vendor': camera.vendor,
          'image_url': '/api/synology/snapshot/' + camera.id,
          'video_url': '/api/synology/live/' + camera.id
        };
      });
      defer.resolve(info.cameras);
    })
    .fail(function (err) {
      defer.reject(info);
    });

  return defer.promise;
};

Synology.getLiveUrls = function (ids) {
  var defer = Q.defer();

  Synology.req('SYNO.SurveillanceStation.Camera.GetLiveViewPath', {
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

  Synology.req('SYNO.SurveillanceStation.Camera.GetSnapshot', {
    'profileType': '0',
    'id': id
  }, true)
  .then(function (response) {

    console.log(response.pipe);
    var image_path = Synology.image_path + '/' + id + '.jpg';
    response.pipe(fs.createWriteStream(image_path));

    defer.resolve(response);
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

  Synology.req('SYNO.API.Auth.Login', {
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

Synology.req = function (api_method, args, raw) {
  var url,
    base,
    defer = Q.defer();

  if (!config.server) {
    defer.reject({'message': 'No Synology Server Configured'});
    return defer.promise;
  }

  if (!base_args[api_method]) {
    defer.reject({'message': 'Invalid Synology API: ' + api_method});
    return defer.promise;
  }

  base = base_args[api_method];

  url = config.server + base.url + '?api=' + base.api + '&method=' + base.method + '&version=' + base.version;

  if (Synology.token) {
    url += '&_sid=' + Synology.token;
  }

  Object.keys(args).forEach(function(key) {
    url += '&' + key + '='  + args[key];
  });

  log.debug('Making request to synology: ' + url);

  var req = request.get(url, function (err, response, body) {
    if (raw) {
      return;
    }

    try {
      body = JSON.parse(body);
    } catch (e) {
      return defer.reject({'message': e.message});
    }

    if (err || body.error || body.success === false) {
      return defer.reject(err || {'message': body.error});
    }

    defer.resolve(body.data || body);
  });

  if (raw) {
    defer.resolve(req);
  }

  return defer.promise;
}

Synology.get_image = function (device) {
  return Synology.getSnapshot(device.config.id);
};

Synology.getLiveStream = function (id) {
  var defer = Q.defer();

  Synology.getLiveUrls(id)
  .then(function (response) {
    var path = response[0].mjpegHttpPath;
    var stream = request.get(path)
    stream.on('error', function () {
      log.error('Error with synology stream');
    });
    defer.resolve(stream);
  })
  .fail(function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Synology.get_video = function (device) {

  return Synology.getLiveStream(device.config.id);
};

Synology.get_status = function (device) {
  var defer = Q.defer();
  var defers = [];

  defers.push(Synology.getLiveUrls(device.config.id));
  defers.push(Synology.getInfo(device.config.id));

  Q.allSettled(defers)
    .then(function (results) {
      var urls = (results[0].state === 'fulfilled') ? results[0].value[0] : {};
      var info = (results[0].state === 'fulfilled') ? results[1].value[0] : {};

      var status = {
        '_motion': info.recStatus > 0,
        '_image': config.image_path + '/' + info.id + '.jpg',
        'last_seen': new Date(),
        'config': {}
      };

      merge(status.config, urls);
      merge(status.config, info);

      defer.resolve({'update': status});
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

var base_args = {
  'SYNO.API.Auth.Login': {
    'api': 'SYNO.API.Auth',
    'method': 'Login',
    'json': true,
    'version': 2,
    'url': '/webapi/auth.cgi'
  },
  'SYNO.SurveillanceStation.Camera.List': {
    'api': 'SYNO.SurveillanceStation.Camera',
    'method': 'List',
    'json': true,
    'version': 9,
    'url': '/webapi/entry.cgi'
  },
  'SYNO.SurveillanceStation.Camera.GetLiveViewPath': {
    'api': 'SYNO.SurveillanceStation.Camera',
    'method': 'GetLiveViewPath',
    'json': true,
    'version': 9,
    'url': '/webapi/entry.cgi'
  },
  'SYNO.SurveillanceStation.Camera.GetSnapshot': {
    'api': 'SYNO.SurveillanceStation.Camera',
    'method': 'GetSnapshot',
    'json': true,
    'version': 8,
    'url': '/webapi/entry.cgi'
  },
  'SYNO.SurveillanceStation.Camera.GetInfo': {
    'api': 'SYNO.SurveillanceStation.Camera',
    'method': 'GetInfo',
    'json': true,
    'version': 8,
    'url': '/webapi/entry.cgi'
  }
};

module.exports = Synology;
