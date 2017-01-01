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

  request.post({
      'url': device.config.address + '/api/display/on',
      'headers': {'server-token': device.config.token}
    }, function (error, response, body) {
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

  request.post({
      'url': device.config.address + '/api/display/off',
      'headers': {'server-token': device.config.token}
    }, function (error, response, body) {
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
      json: {'url': url, 'duration': duration},
      'headers': {'server-token': device.config.token}
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

  request.post({
      'url':device.config.address + '/api/display/brightness/' + level,
      'headers': {'server-token': device.config.token}
    }, function (error, response, body) {
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
  var update = {};

  log.info('Getting Rad status: %s', device.name);

  var getConfig = function () {

    request({
      'url': device.config.address + '/api/abode/config', 
      'json': true, 
      'headers': {'server-token': device.config.token}
    }, function (error, response, config) {
      if (!error && response.statusCode === 200) {
        update.config = device.config || {};

        log.debug('Received display config for Rad', device.name);
        update.config.display = config.display;
        defer.resolve({'update': update});
      } else {
        log.error('Failed get Rad config for %s: %s', device.name, String(error));
        defer.reject({'status': 'failed', 'message': String(error)});
      }
    });

  };

  var getStatus = function () {

    request({
      'uri': device.config.address + '/api/abode/status', 
      'json': true,
      'headers': {'server-token': device.config.token}
    }, function (error, response, body) {
      if (!error && response.statusCode === 200) {

        log.debug('Received status for Rad', device.name);

        update = body;
        delete update.name;

        getConfig();
      } else {
        log.error('Failed get Rad status for %s: %s', device.name, String(error));
        defer.reject({'status': 'failed', 'message': String(error)});
      }
    });

  };

  getStatus();

  return defer.promise;
};

Rad.lock = function () {
  var defer = q.defer();

  defer.resolve({'update': {'locked': true}});

  return defer.promise;
};

Rad.unlock = function (device, pin) {
  var defer = q.defer();

  abode.auth.check_pin(pin, device).then(function () {
    defer.resolve({'update': {'locked': false}});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Rad.load = function () {

  var devices = abode.devices.get_by_provider('rad');

  if (devices.length === 0) {
    log.info('No Rad Devices to Query');
  }

  log.debug('Starting to poll devices');
  devices.forEach(function (device) {
    if (device.active !== true) {
      return;
    }
    Rad.get_status(device).then(function (data) {
      if (data.update) {

        device.set_state(data.update, undefined, {'skip_pre': true, 'skip_post': true});

      }
    });
  });

};

Rad.save_config = function (url, data, section, token) {
  var defer = q.defer();

  section = (section === '' || section === undefined) ? '' : '/' + section;

  var save_config = function () {

    request.post({
      'url': url + '/api/abode/save', 
      'headers': {'server-token': token}
    }, function (error, response) {
      if (!error && response.statusCode === 200) {

        log.debug('Saved Rad config:', url);
        defer.resolve();

      } else {
        log.error('Failed to save Rad config %s: %s', url, String(error));
        defer.reject({'status': 'failed', 'message': String(error)});
      }
    });

  };

  var update_config = function () {

    request.put({
      'url': url + '/api/abode/config' + section,
      'json': data,
      'headers': {'server-token': token}
    }, function (error, response, body) {
      if (!error && response.statusCode === 200) {

        save_config();

      } else {
        log.error('Failed to update Rad config for %s: %s', url, String(error || body.message || body));
        defer.reject({'status': 'failed', 'message': String(error || body.message || body)});
      }
    });

  };

  update_config();

  return defer.promise;
};

Rad.pre_save = function (device) {
  var defer = q.defer();

  var data = {'name': device.name};
  if (device.config && device.config.display) {
    data.display = device.config.display;
  }
  
  Rad.save_config(device.config.address, data, undefined, device.config.token).then(function () {
    defer.resolve();
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

module.exports = Rad;
