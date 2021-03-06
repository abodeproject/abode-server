'use strict';
var Q = require('q'),
  fs = require('fs'),
  path = require('path'),
  URL = require('url').URL,
  merge = require('merge'),
  logger = require('log4js'),
  request = require('request'),
  log = logger.getLogger('synology');

var abode, events, routes, config;

var Synology = function () {
  var defer = Q.defer();
  abode = require('../../abode');
  routes = require('./routes');
  events = abode.events;

  config = abode.config.synology = abode.config.synology || {};
  config.enabled = (config.enabled) ? true : false;
  config.interval = config.interval || 10;
  config.image_path = config.image_path || 'public/synology';
  config.snapshot_interval = config.snapshot_interval || 1;

  abode.web.server.use('/api/synology', routes);

  Synology.enabled = false;
  Synology.cameras = [];
  Synology.last_image_poll = false;
  Synology.image_path = path.join(process.cwd(), config.image_path);

  abode.events.on('ABODE_STARTED', function () {
    if (!config.enabled) {
      Synology.status = 'Not enabled';
      log.warn('Not starting Synology.  Not enabled');
      return;
    }

    log.info('Starting Synology provider');
    Synology.enable();
  });

  log.debug('Synology provider initialized');
  defer.resolve(Synology);

  return defer.promise;
};

Synology.create_image_store = function () {
  fs.stat(Synology.image_path, function (err) {
    if (!err) {
      Synology.can_write = true;
      return;
    }

    log.info('Creating image store:', config.image_path);
    fs.mkdir(Synology.image_path, function (err) {
      if (err) {
        Synology.can_write = false;
        log.error('Failed to create image store:', Synology.image_path);
        return;
      }

      Synology.can_write = true;
    });

  });
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

Synology.enable = function (user, password) {
  var defer = Q.defer();

  if (Synology.enabled) {
    defer.reject({'message': 'Synology is already enabled'});
    return defer.promise;
  }

  Synology.status = 'Enabling';

  Synology.create_image_store()

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
    log.error('Failed to enable Synology: %s', err.message);
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

Synology.poll = function () {
  if (Synology.polling) {
    log.warn('Poller has been running since: %s', Synology.polling);
    return;
  }

  Synology.polling = new Date();

  var defers = []
  var no_image = true;
  var devices = abode.devices.get_by_provider('synology');

  if (!Synology.last_image_poll || (new Date - Synology.last_image_poll) > (config.snapshot_interval * 60000)) {
    no_image = false;
    Synology.last_image_poll = new Date();

    log.debug('Polling cameras + snapshots');
  } else {
    log.debug('Polling cameras');
  }

  devices.forEach(function (device) {
    var defer = Q.defer();
    defers.push(defer.promise);
    log.debug('Polling camera: %s', device.name);

    Synology.get_status(device, no_image)
      .then(function (result) {
        log.debug('Successfully polled camera: %s', device.name);
        device.set_state(result.update);
        defer.resolve();
      })
      .fail(function (err) {
        log.error('Error polling camera %s: %s', device.name, err);
        defer.reject();
      });
  });

  Q.allSettled(defers)
    .then(function () {
      log.debug('Finished polling cameras');
      Synology.last_polled = new Date();
      Synology.polling = undefined;
    });

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

  log.debug('Getting camera info: %s', ids);
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
      log.error('Failed to get camera info %s: %s', ids, err);
      defer.reject(err);
    });

  return defer.promise;
};

Synology.getSnapshot = function (id) {
  var defer = Q.defer();

  log.debug('Getting camera snapshot: %s', id);
  Synology.req('SYNO.SurveillanceStation.Camera.GetSnapshot', {
    'profileType': '0',
    'id': id
  }, true)
    .then(function (response) {
      response.on('error', function (err) {
        log.error('Camera pipe failed %s: %s', id, err);
        defer.reject(err);
      });

      response.on('response', function () {
        log.debug('Received camera snapshot: %s', id);
        defer.resolve(response);
      });

      if (Synology.can_write) {
        var image_path = Synology.image_path + '/' + id + '.jpg';
        response.pipe(fs.createWriteStream(image_path));
      }

    })
    .fail(function (err) {
      log.error('Failed to get camera snapshot %s: %s', id, err);
      defer.reject(err);
    });

  return defer.promise;
};

Synology.getLiveUrls = function (ids) {
  var defer = Q.defer();

  Synology.req('SYNO.SurveillanceStation.Camera.GetLiveViewPath', {'idList': ids})
    .then(function (urls) {
      defer.resolve(urls);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
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

  url = new URL(base.url, config.server);
  url.searchParams.set('api', base.api);
  url.searchParams.set('method', base.method);
  url.searchParams.set('version', base.version);

  if (Synology.token) {
    url.searchParams.set('_sid', Synology.token);
  }

  Object.keys(args).forEach(function(key) {
    url.searchParams.set(key, args[key]);
  });

  url = url.toString();
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

Synology.get_video = function (device) {
  return Synology.getLiveStream(device.config.id);
};

Synology.get_status = function (device, no_image) {
  var defers = [],
    defer = Q.defer();

  defers.push(Synology.getLiveUrls(device.config.id));
  defers.push(Synology.getInfo(device.config.id));

  if (!no_image) {
    log.info('Updating local snapshot: %s', device.name);
    defers.push(Synology.getSnapshot(device.config.id));
  }

  Q.allSettled(defers)
    .then(function (results) {
      var urls = (results[0].state === 'fulfilled') ? results[0].value[0] : undefined;
      var info = (results[0].state === 'fulfilled') ? results[1].value[0] : undefined;

      if (!urls || !info) {
        return defer.reject({'message': 'Failed to get status on camera'});
      }

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
    'version': 9,
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
