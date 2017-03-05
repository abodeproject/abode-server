'use strict';

var abode,
  routes,
  q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('autoshades');

var Autoshades = function () {
  var defer = q.defer();

  // Get abode
  abode = require('../../abode');

  // Set our routes
  routes = require('./routes');
  abode.web.server.use('/api/autoshades', routes);

  // Build our config
  abode.config.autoshades = abode.config.autoshades || {};
  Autoshades.config = abode.config.autoshades;
  Autoshades.config.enabled = (Autoshades.config.enabled === false) ? false : true;
  Autoshades.config.interval = Autoshades.config.interval || 1;

  Autoshades.working = false;

  var msg = 'Provider started';
  log.info(msg);
  defer.resolve({'status': 'success', 'message': msg});

  if (Autoshades.config.enabled) {
    Autoshades.enable();
  }

  defer.resolve();

  return defer.promise;
};

Autoshades.enable = function () {
  var defer = q.defer();

  if (!Autoshades.enabled) {
    Autoshades.timer = setInterval(Autoshades.processor, Autoshades.config.interval * 60 * 1000);
    Autoshades.enabled = true;
    defer.resolve({'status': 'success', 'message': 'Autoshades Enabled'});
  } else {
    defer.reject({'status': 'failed', 'message': 'Already enabled'});
  }

  return defer.promise;
};

Autoshades.disable = function () {
  var defer = q.defer();

  if (Autoshades.enabled) {
    if (Autoshades.timer) {
      clearInterval(Autoshades.timer);
    }

    Autoshades.enabled = false;
    defer.resolve({'status': 'success', 'message': 'Autoshades Disabled'});
  } else {
    defer.reject({'status': 'failed', 'message': 'Already disabled'});
  }

  return defer.promise;
};

Autoshades.ease_functions = {
  'linear': function (altitude) {
    // (altitude / 90) * 100
    return Math.round((altitude / 90) * 100);
  },
  'easeout': function (altitude) {
    // =SIN(A2*0.018 )*100
    return Math.round(Math.sin(altitude * 0.018) * 100);
  },
  'easein': function (altitude) {
    // =SIN(4.86+A2*0.01)*200+200
    return Math.round(Math.sin(4.86 + altitude * 0.01) * 200 + 200);
  }
};

Autoshades.processor = function () {
  if (Autoshades.working !== false) {
    return;
  }

  Autoshades.working = new Date();

  // Get all lutron devices
  var devices = abode.devices.get_by_provider('autoshades');
  //abode.devices.get_by_providerAsync('autoshades').then(function (devices) {

    var device_defers = [];

    // If the time provider is not setup, stop processing
    if (abode.providers.time === undefined || abode.providers.time.sun_altitude === undefined) {
      log.warn('No sun altitude information, is the time provider running?');
      Autoshades.working = false;
      return;
    }

    // If the altitude is less then zero, the sun isn't up so do nothing
    if (abode.providers.time.sun_altitude <= 0) {
      log.warn('Sun is set, doing nothing');
      Autoshades.working = false;
      return;
    }

    // If the altitude is less then zero, the sun isn't up so do nothing
    if (abode.providers.time.is_night) {
      log.warn('It is night, doing nothing');
      Autoshades.working = false;
      return;
    }

    // If no devices found, return
    if (devices.length === 0) {
      log.debug('No Autoshade Devices to Process');
      Autoshades.working = false;
      return;
    }    

    log.debug('Starting to process autoshade devices');
    devices.forEach(function (device) {
      // Set our device defer and add it to our list
      var level,
        device_defer = q.defer(),
        ease_function = Autoshades.ease_functions[device.config.mode];

      device_defers.push(device_defer.promise);

      // If autoshade device is not on, skip
      if (device._on === false) {
        log.debug('Skipping autoshades device because it is off: %s', device.name);
        device_defer.resolve();
        return;
      }

      // If no ease function defined, skip
      if (ease_function === undefined) {
        log.warn('Invalid ease function for device: %s %s', device.name, device.config.mode);
        device_defer.resolve();
        return;
      }

      // Determine the shade level based on the sun altitude
      level = ease_function(abode.providers.time.sun_altitude);

      // Set the auto shade device level
      Autoshades.set_level(device, level).then(function (data) {
        device_defer.resolve();

        // If we have an update key, set the device staet
        if (data.update) {

          device.set_state(data.update, undefined, {'skip_pre': true, 'skip_post': true});

        }
      });
    });

    // Once all devices polled, set polling flag to false
    q.allSettled(device_defers).then(function () {
      Autoshades.working = false;
    });


  //});
};

// 
Autoshades.get_status = function (device) {
  var defer = q.defer();

  log.debug('Autoshades.get_status(%s)', device);
  defer.resolve({'response': true}); 

  return defer.promise;
};

Autoshades.on = Autoshades.open = function (device) {
  var defer = q.defer();

  log.debug('Autoshades.on(%s)', device.name);
  defer.resolve({'response': true, 'update': {_on: true, _level: 100}});

  return defer.promise;
};

Autoshades.off = Autoshades.close = function (device) {
  var defer = q.defer();

  log.debug('Autoshades.off(%s)', device.name);
  defer.resolve({'response': true, 'update': {_on: false, _level: 0}});

  return defer.promise;
};

Autoshades.set_level = function (device, level) {
  var defer = q.defer();
  var device_defers = [];


  // If we have no devices, stop processing
  if (!device.config.devices) {
    defer.reject({'response': false, 'message': 'No devices to set'});
    return defer.promise;
  }

  // If no azimuth information is available, stop processing
  if (abode.providers.time === undefined || abode.providers.time.sun_azimuth === undefined) {
    log.warn('No sun azimuth information, is the time provider running?');
    defer.reject({'response': false, 'message': 'No sun azimuth information, is the time provider running?'});
    return defer.promise;
  }

  // Make sure we're within our azimuth range
  if (abode.providers.time.sun_azimuth < device.config.min_azimuth  && abode.providers.time.sun_azimuth > device.config.max_azimuth ) {
    log.debug('Not within azimuth range %s - %s (%s)', device.config.min_azimuth, device.config.max_azimuth, abode.providers.time.sun_azimuth);
    defer.reject({'response': false, 'message': 'Outside of azimuth range'});
    return defer.promise;
  }

  log.info('Autoshades.set_level(%s, %s)', device.name, level);

  // Iterate through each device
  device.config.devices.forEach(function (shade) {
    var shade_device = abode.devices.get(shade.name);

    // If the device could not be found, skip
    if (!shade_device) {
      log.error('Shade not found: %s', shade.name);
      return;
    }

    // If the device is already at the requested value, skip
    if (shade_device._level === level) {
      log.debug('Shade level already set: %s (%s)', shade_device.name, level);
      return;
    }

    // If requested level is abode max level, do nothing
    if (device.min_level !== undefined && level >= device.min_level) {
      log.debug('Shade level higher then then max level: %s (%s)', shade_device.name, device.min_level);
      return;
    }

    // Set the device and return add the defer to our list
    log.debug('Setting shade level to %s%%: %s', level, shade_device.name);
    device_defers.push(shade_device.set_level(level));
  });

  // Once all device defers are resolved, resolve our main defer
  q.allSettled(device_defers).then(function () {
    defer.resolve({'response': true, 'update': {_on: true, _level: level}});
  });

  return defer.promise;
};

module.exports = Autoshades;
