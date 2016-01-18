'use strict';

var abode,
  config,
  q = require('q'),
  request = require('request');

var logger = require('log4js'),
  log = logger.getLogger('rad');

var Rad = function () {
  var defer = q.defer();
  abode = require('../../abode');

  config = abode.config.rad || {};
  config.enabled = (config.enabled === false) ? false : true;
  config.interval = config.interval || 30;

  abode.events.on('ABODE_STARTED', function () {
    if (config.enabled === false) {
      log.warn('Not starting Rad.  Not enabled');
      return;
    }

    log.info('Starting Rad provider');
    setInterval(Rad.load, (1000 * config.interval));
    Rad.load();
  });

  defer.resolve();

  return defer.promise;
};

Rad.on = function (device) {
  var defer = q.defer();

  log.debug('Turning on Rad display: %s', device.name);

  request.post(device.config.address + '/api/display/on', function (error, response, body) {
    if (!error && response.statusCode === 200) {
      log.debug('Successfully turned on Rad display: %s', device.name);
      defer.resolve({'status': 'success'});
    } else {
      log.error('Failed to turn on Rad display %s: %s', device.name, body);
      defer.reject({'status': 'failed', 'message': body});
    }
  });

  return defer.promise;
};

Rad.off = function (device) {
  var defer = q.defer();

  log.debug('Turning off Rad display: %s', device.name);

  request.post(device.config.address + '/api/display/off', function (error, response, body) {
    if (!error && response.statusCode === 200) {
      log.debug('Successfully turned on Rad display: %s', device.name);
      defer.resolve({'status': 'success'});
    } else {
      log.error('Failed to turn on Rad display %s: %s', device.name, body);
      defer.reject({'status': 'failed', 'message': body});
    }
  });

  return defer.promise;
};

Rad.play = function (device, url, duration) {
  var defer = q.defer();

  log.debug('Starting video on %s for %s seconds: %s', device.name, duration, url);
  request.post({
      uri: device.config.address + '/api/video',
      json: {'url': url, 'duration': duration}
    }, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      log.debug('Successfully start video on Rad: %s', device.name);
      defer.resolve({'status': 'success'});
    } else {
      log.error('Failed to start video on %s: %s', device.name, body);
      defer.reject({'status': 'failed', 'message': body});
    }
  });


  return defer.promise;
};

Rad.set_level = function (device, level) {
  var defer = q.defer();

  log.debug('Setting display brightness for %s: %s', device.name, level);

  request.post(device.config.address + '/api/display/brightness/' + level, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      log.debug('Successfully set Rad display brightness: %s', device.name);
      defer.resolve({'status': 'success'});
    } else {
      log.error('Failed to turn on Rad display %s: %s', device.name, body);
      defer.reject({'status': 'failed', 'message': body});
    }
  });
  return defer.promise;
};

Rad.get_status = function (device) {
  var defer = q.defer();

  log.debug('Getting Rad status: %s', device.name);

  request({uri: device.config.address + '/api/abode/status', json: true}, function (error, response, body) {
    if (!error && response.statusCode === 200) {
      log.debug('Received status for Rad', device.name);
      defer.resolve({'update': body});
    } else {
      log.error('Failed get Rad status for %s: %s', device.name, String(error));
      defer.reject({'status': 'failed', 'message': String(error)});
    }
  });

  return defer.promise;
};

Rad.load = function () {

  var devices = abode.devices.get_by_provider('rad');

  if (devices.length === 0) {
    log.info('No Rad Devices to Query');
  }

  devices.forEach(function (device) {
    Rad.get_status(device).then(function (data) {
      if (data.update) {

        device.set_state(data.update);

      }
    });
  });

};

module.exports = Rad;
