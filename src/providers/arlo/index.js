'use strict';
var Q = require('q'),
  fs = require('fs'),
  path = require('path'),
  URL = require('url').URL,
  merge = require('merge'),
  logger = require('log4js'),
  request = require('request'),
  log = logger.getLogger('arlo');

var abode, events, routes, config;

var Arlo = function () {
  var defer = Q.defer();
  abode = require('../../abode');
  routes = require('./routes');
  events = abode.events;

  config = abode.config.arlo = abode.config.arlo || {};
  config.enabled = (config.enabled) ? true : false;
  config.interval = config.interval || 10;
  config.image_path = config.image_path || 'public/arlo';
  config.server = config.server || 'https://arlo.netgear.com';

  abode.web.server.use('/api/arlo', routes);

  Arlo.enabled = false;
  Arlo.cameras = [];
  Arlo.image_path = path.join(process.cwd(), config.image_path);

  abode.events.on('ABODE_STARTED', function () {
    if (!config.enabled) {
      Arlo.status = 'Not enabled';
      log.warn('Not starting Arlo.  Not enabled');
      return;
    }

    log.info('Starting Arlo provider');
    Arlo.enable();
  });

  log.debug('Arlo provider initialized');
  defer.resolve(Arlo);

  return defer.promise;
};

Arlo.enable = function (user, password) {
  var defer = Q.defer();

  if (Arlo.enabled) {
    defer.reject({'message': 'Already enabled'});
    return defer.promise;
  }

  Arlo.login(user, password)
    .then(function (response) {
      Arlo.enabled = true;
      Arlo.status = 'Connected';

      Arlo.load();
      Arlo.subscribe();

      defer.resolve(response);
    })
    .fail(function (err) {
      Arlo.enabled = false;
      Arlo.status = err.message;
      defer.reject(err);
    });

  return defer.promise;
};

Arlo.disable = function () {

};

Arlo.login = function (user, password) {
  var defer = Q.defer();

  user = user || config.user;
  password = password || config.password;

  if (!user || !password) {
    defer.reject({'message': 'No username/password provided'});
    return defer.promise;
  }

  Arlo.req('login', {'email': user, 'password': password})
    .then(function (response) {
      Arlo.token = response.token;
      defer.resolve(response);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

Arlo.load = function () {
  var defer = Q.defer();

  if (!Arlo.enabled) {
    defer.reject({'message': 'Not enabled'});
    return defer.promise;
  }

  Arlo.req('devices')
    .then(function (devices) {
      Arlo.cameras = devices.filter(function (device) {
        return (device.deviceType === 'camera');
      });

      Arlo.basestations = devices.filter(function (device) {
        return (device.deviceType === 'basestation');
      });

      defer.resolve(devices);
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
};

Arlo.req = function (api, data, query, raw) {
  var url,
    base,
    options,
    defer = Q.defer();

  if (!arlo_api[api]) {
    defer.reject({'message': 'Invalid API call'});
    return defer.promise;
  }

  base = arlo_api[api];
  url = new URL(base.uri, config.server);

  if (query) {
    Object.keys(query).forEach(function (key) {
      url.searchParams.set(key, query[key]);
    });
  }

  options = {
    'uri': url.toString(),
    'method': base.method || 'GET',
    'headers': {
      'User-Agent': 'Abode'
    },
  };

  if (base.headers) {
    merge(options.headers, base.headers);
  }

  if (Arlo.token) {
    options.headers['Authorization'] = Arlo.token;
  }

  if (data) {
    options.headers['Content-Type'] = 'application/json'
    options.body = data;
  }

  if (!raw) {
    options.json = true;
  }

  log.debug('Making request to arlo: ' + options.uri);

  var req = request(options, function (err, response, body) {
    if (raw) {
      return;
    }

    if (err) {
      return defer.reject({'message': err.message || err});
    }

    if (!body.success) {
      return defer.reject(body.data);
    }

    defer.resolve(body.data);
  });

  if (raw) {
    defer.resolve(req);
  }

  return defer.promise
};

Arlo.subscribe = function () {
  var defer = Q.defer();

  if (!Arlo.enabled) {
    defer.reject({'message': 'Arlo not enabled'});
    return defer.promise;
  }

  if (Arlo.subscribed) {
    defer.reject({'message': 'Already subscribed to event feed'});
    return defer.promise;
  }

  Arlo.subscribed = true;

  Arlo.req('subscribe', undefined, {'token': Arlo.token}, true)
    .then(function (request) {
      request.on('data', function (data) {
        var body = data.toString();

        try {
          body = JSON.parse(body);
        } catch (e) {
          Arlo.subscribed = false;
          request.end();
          return;
        }

        console.log(body);
      });
      request.on('error', function (err) {
        Arlo.subscribed = false;
      });
    })
    .fail(function (err) {
      defer.reject(err);
    });

  return defer.promise;
}

var arlo_api = {
  'login': {
    'uri': '/hmsweb/login',
    'method': 'POST'
  },
  'devices': {
    'uri': '/hmsweb/users/devices',
    'method': 'GET'
  },
  'stream': {
    'uri': '/hmsweb/users/devices/startStream',
    'method': 'POST'
  },
  'subscribe': {
    'uri': '/hmsweb/client/subscribe',
    'method': 'GET',
    'headers': {
      'Accept': 'text/event-stream'
    }
  }
};

module.exports = Arlo;
