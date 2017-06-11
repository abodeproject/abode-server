'use strict';

var abode,
  events,
  routes,
  config,
  Radiothermostat,
  q = require('q'),
  http = require('http'),
  logger = require('log4js'),
  request = require('request'),
  log = logger.getLogger('radiothermostat');

var modes = [
  'OFF',
  'HEAT',
  'COOL',
  'AUTO'
];

Radiothermostat = function () {
  var defer = q.defer();
  abode = require('../../abode');
  events = abode.events;
  routes = require('./routes');

  config = abode.config.radiothermostat || {};
  config.enabled = config.enabled || true;
  config.interval = config.interval || 1;

  abode.web.server.use('/api/radiothermostat', routes);

  abode.events.on('ABODE_STARTED', function () {
    if (config.enabled === false) {
      Radiothermostat.enabled = false;
      log.warn('Not starting Radiothermostat.  Not enabled');
      return;
    }

    log.info('Starting Radiothermostat provider');
    Radiothermostat.enable()
    Radiothermostat.load();
  });


  log.debug('Radiothermostat provider initialized');
  defer.resolve(Radiothermostat);

  return defer.promise;
};

Radiothermostat.enable = function () {
  var defer = q.defer();

  Radiothermostat.poller = setInterval(Radiothermostat.load, (1000 * 60 * config.interval));
  Radiothermostat.enabled = true;

  defer.resolve({'status': 'success'});

  return defer.promise;
};

Radiothermostat.disable = function () {
  var defer = q.defer();

  if (Radiothermostat.poller) {
    clearInterval(Radiothermostat.poller);
  }
  Radiothermostat.enabled = false;

  defer.resolve({'status': 'success'});

  return defer.promise;
};

Radiothermostat.on = function (device) {

  if (device.config.last_mode !== 'HEAT' && device.config.last_mode !== 'COOL') {
    device.config.last_mode = 'COOL';
  }

  return Radiothermostat.set_mode(device, device.config.last_mode);
};

Radiothermostat.off = function (device) {

  if (device._on) {
    device.config.last_mode = device._mode;
  }

  return Radiothermostat.set_mode(device, 'OFF');
};

Radiothermostat.is_on = function (device) {
  var defer = q.defer();

  defer.resolve({'response': (device._on === true)});

  return defer.promise;
};

Radiothermostat.is_off = function (device) {
  var defer = q.defer();

  defer.resolve({'response': (device._on === false)});

  return defer.promise;
};

Radiothermostat.temperature = function (device) {
  var defer = q.defer();

  defer.resolve({'response': device._temperature});

  return defer.promise;
};

Radiothermostat.humidity = function (device) {
  var defer = q.defer();

  defer.resolve({'response': device._humidity});

  return defer.promise;
};

Radiothermostat.set_mode = function (device, mode) {
  var defer = q.defer();

  if (modes.indexOf(mode) === -1) {
    defer.reject({'status': 'failed', 'message': 'Invalid mode specified'});
    return defer.promise;
  }

  request.post({
    uri: 'http://' + device.config.address + '/tstat',
    json: {
      'tmode': modes.indexOf(mode),
    }
  }, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      log.debug('Successfully set thermostat mode: %s', mode);
      Radiothermostat.get_status(device).then(function (data) {
        defer.resolve({'status': 'success', 'update': {'_mode': mode, '_set_point': data.update._set_point, '_on': data.update._on}});
      }, function (err) {
        defer.reject(err);
      });
    } else {
      log.error('Failed to turn on Rad display %s: %s', device.name, body);
      defer.reject({'status': 'failed', 'message': body});
    }
  });

  return defer.promise;
};

Radiothermostat.set_point = function (device, temp) {
  var defer = q.defer();

  var data = {};

  if (typeof(temp) !== 'number') {
    defer.resolve({'response': device._set_point});
    return defer.promise;
  }

  if (device._mode === 'HEAT') {
    data.t_heat = temp;
  } else if (device._mode === 'COOL') {
    data.t_cool = temp;
  } else {
    defer.rejecet({'status': 'failed', 'message': 'Conditioner is off'});
    return defer.promise;
  }

  request.post({
    uri: 'http://' + device.config.address + '/tstat',
    json: data
  }, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      log.debug('Successfully set thermostat set point: %s', temp);
      defer.resolve({'status': 'success', 'update': {'_set_point': temp}});
    } else {
      log.error('Failed to set thermostat set point %s: %s', device.name, body);
      defer.reject({'status': 'failed', 'message': body});
    }
  });

  return defer.promise;
};

Radiothermostat.get_status = function (device) {
  var defer = q.defer();

  Radiothermostat.get(device.config.address).then(function (data) {
    device.config.raw = data;

    defer.resolve({'update': {
        _on: (data.tstat > 0),
        _temperature: data.temp,
        _mode: modes[data.tmode],
        _set_point: data.t_heat || data.t_cool || 0
      }});

  }, function (err) {
    defer.resolve({'status': 'failed', 'message': err});
  });

  return defer.promise;
};

Radiothermostat.get = function (address) {
  var data = '',
    defer = q.defer();

  var uri = '/tstat';
  var options = {
    host: address,
    path: uri,
  };

  var handleError = function (err) {
    log.error('Error getting thermostat: %s\n%s', address, err);
    defer.reject(err);
  };

  var parseResponse = function (res) {

    res.on('data', function (chunk) {
      data += chunk;
    });

    res.on('end', function() {

      try {

        data = JSON.parse(data || {});
        defer.resolve(data);
        log.debug('Parsed thermostat data: %s\n%s', address, data);

      } catch (e) {

        log.error('Failed to parse %s: \n%s', address, [e]);
        defer.reject('Failed to parse response');

      }

    });
  };

  http.request(options, parseResponse)
  .on('error', handleError)
  .end();

  return defer.promise;
};

Radiothermostat.load = function () {

  var devices = abode.devices.get_by_provider('radiothermostat');

  if (devices.length === 0) {
    log.info('No Radiothermostat Devices to Query');
  }

  devices.forEach(function (device) {
    if (device.active !== true) {
      return;
    }
    Radiothermostat.get_status(device).then(function (data) {

      device.set_state(data.update);

    });
  });

};



module.exports = Radiothermostat;
