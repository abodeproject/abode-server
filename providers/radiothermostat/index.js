'use strict';

var abode,
  events,
  routes,
  config,
  Radiothermostat,
  q = require('q'),
  http = require('http'),
  logger = require('log4js'),
  log = logger.getLogger('radiothermostat');

Radiothermostat = function () {
  var defer = q.defer();
  abode = require('../../abode');
  events = abode.events;
  routes = require('./routes');

  config = abode.config.radiothermostat || {};
  config.enabled = config.enabled || true;
  config.interval = config.interval || 1;

  abode.web.server.use('/radiothermostat', routes);

  abode.events.on('ABODE_STARTED', function () {
    if (config.enabled === false) {
      log.warn('Not starting Radiothermostat.  Not enabled');
      return;
    }

    log.info('Starting Radiothermostat provider');
    setInterval(Radiothermostat.load, (1000 * 60 * config.interval));
    Radiothermostat.load();
  });


  log.debug('Radiothermostat provider initialized');
  defer.resolve(Radiothermostat);

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
        log.info('Parsed thermostat: ', address);

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
  var modes = [
    'OFF',
    'HEAT',
    'COOL',
    'AUTO'
  ];

  if (devices.length === 0) {
    log.info('No Radiothermostat Devices to Query');
  }

  devices.forEach(function (device) {
    Radiothermostat.get(device.config.address).then(function (data) {
      device.config.raw = data;

      device.set_state({
        _temperature: data.temp,
        _mode: modes[data.tmode],
        _set_point: data.t_heat || data.t_cool || 0
      });

    });
  });

};



module.exports = Radiothermostat;
