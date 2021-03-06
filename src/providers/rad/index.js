'use strict';

var abode,
  config,
  routes,
  q = require('q'),
  request = require('request');

var logger = require('log4js'),
  log = logger.getLogger('rad');

var Rad = function () {
  var defer = q.defer();
  abode = require('../../abode');

  routes = require('./routes');

  abode.web.server.use('/api/rad', routes);

  config = abode.config.rad || {};
  config.enabled = (config.enabled === false) ? false : true;
  config.interval = config.interval || 30;

  Rad.enabled = config.enabled;

  abode.events.on('ABODE_STARTED', function () {
    if (config.enabled === false) {
      log.warn('Not starting Rad.  Not enabled');
      return;
    }

    log.info('Starting Rad provider');

    Rad.enable();
    Rad.load();
  });

  defer.resolve();

  return defer.promise;
};

Rad.enable = function () {
  var defer = q.defer();

  Rad.enabled = true;
  log.info('Enabling and starting Rad poller interval');
  Rad.poller = setInterval(Rad.load, (1000 * config.interval));

  defer.resolve({'status': 'success'});

  return defer.promise;
};

Rad.disable = function () {
  var defer = q.defer();

  log.info('Disabling and stopping Rad poller interval');
  if (Rad.poller) {
    clearInterval(Rad.poller);
  }
  Rad.enabled = false;

  defer.resolve({'status': 'success'});

  return defer.promise;
};

Rad.motion_on = function (device) {
  var defer = q.defer();

  log.debug('Turning on Rad motion: %s', device.name);

  defer.resolve({'status': 'success', 'update': {'_motion': true}});

  return defer.promise;
};

Rad.motion_off = function (device) {
  var defer = q.defer();

  log.debug('Turning off Rad motion: %s', device.name);

  defer.resolve({'status': 'success', 'update': {'_motion': false}});

  return defer.promise;
};

Rad.has_motion = function (device) {
  var defer = q.defer();

  log.debug('Checking Rad motion status: %s', device.name);

    defer.resolve({'update': {'_motion': device._motion}, 'response': device._motion});

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

  log.debug('Getting Rad status: %s', device.name);

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
        update.last_seen = new Date();

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

        if (device.capabilities.indexOf('temperature_sensor') !== -1 && update._temperature === undefined) {
          //TODO: throw issue if we are a temperature sensor but no _temperature was received
          // device.add_issue({'errno': 'RAD001-TEMP001', 'message': 'Rad has temperature sensor but no data was found', 'level': 'warn'});
        } else {
          // device.delete_issue_by_errno('RAD001-TEMP001')
        }

        if (device.capabilities.indexOf('humidity_sensor') !== -1 && update._humidity === undefined) {
          //TODO: throw issue if we are a humidity_sensor but no _humidity was received
          // device.add_issue({'errno': 'RAD001-HUM001', 'message': 'humidity_sensor configured but no data was found', 'level': 'warn'});
        } else {
          // device.delete_issue_by_errno('RAD001-HUM001')
        }

        if (device.capabilities.indexOf('light_sensor') !== -1 && update._lumens === undefined) {
          //TODO: throw issue if we are a light_sensor but no _lumens was received
          // device.add_issue({'errno': 'RAD001-LIGHT001', 'message': 'light_sensor configured but no data was found', 'level': 'warn'});
        } else {
          // device.delete_issue_by_errno('RAD001-LIGHT001')
        }

        if (device.capabilities.indexOf('motion_sensor') !== -1 && update._motion === undefined) {
          //TODO: throw issue if we are a motion_sensor but no _motion was
          // device.add_issue({'errno': 'RAD001-MOTION001', 'message': 'motion_sensor configured but no data was found', 'level': 'warn'});
        } else {
          // device.delete_issue_by_errno('RAD001-MOTION001')
        }

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

Rad.unlock = function () {
  var defer = q.defer();

  defer.resolve({'update': {'locked': false}});

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
