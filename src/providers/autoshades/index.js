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

Autoshades.cloudy_conditions = ['cloudy', 'mostlycloudy', 'rain', 'tstorms', 'snow', 'sleet', 'fog', 'flurries'];

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
        return device_defer.resolve();
      }


      // If we're tracking weather, determine our weather
      if (device.config.weather && abode.providers.time.is.day) {


        // Lookup the weather device
        var weather_device = abode.devices.get(device.config.weather._id);

        // Check the device was foudn and it was weather
        if (weather_device && weather_device._weather && weather_device._weather.icon) {
          // If the device has a conditions icon and it's in our list, set the level
          if (Autoshades.cloudy_conditions.indexOf(weather_device._weather.icon) >= 0) {
            if (device.config.track && level === undefined && abode.providers.time.sun_azimuth ) {
              if (abode.providers.time.sun_azimuth >= device.config.min_azimuth && abode.providers.time.sun_azimuth <= device.config.max_azimuth ) {
                log.debug('Using cloudy level');
                level = device.config.cloudy_level;
              }
            } else {
              log.debug('Using cloudy level');
              level = device.config.cloudy_level;
            }
          }
        }
      }

      // If we are tracking the sun and no level has been determined, get the level
      if (device.config.track && level === undefined && abode.providers.time.sun_azimuth ) {

        // Make sure we're within our azimuth range
        if (abode.providers.time.sun_azimuth >= device.config.min_azimuth && abode.providers.time.sun_azimuth <= device.config.max_azimuth && abode.providers.time.sun_altitude > 0) {
          ease_function = Autoshades.ease_functions[device.config.mode];
          // If no ease function defined, skip
          if (ease_function === undefined) {
            log.warn('Invalid ease function for device: %s %s', device.name, device.config.mode);
            return device_defer.resolve();
          }
          
          log.debug('Using sun tracking level');
          level = ease_function(abode.providers.time.sun_altitude);
          if (level < 0) {
            level = undefined;
            log.debug('Sun is too low, skipping sun tracking');
          }
        } else {
          log.debug('Not within azimuth range %s - %s (%s)', device.config.min_azimuth, device.config.max_azimuth, abode.providers.time.sun_azimuth);
        }
      }

      // If within 2 times of the interval of sunrise, set our sunrise level
      // Determine our diff. A positive value is after sunrise
      var sunrise_diff = abode.providers.time.time - abode.providers.time.sunrise;

      if (device.config.sunrise && device.config.sunrise_level !== undefined && sunrise_diff >= 0 && sunrise_diff <= (Autoshades.config.interval * 60 * 2)) {
        log.debug('Using sunrise level');
        level = device.config.sunrise_level;
      } else {
        log.debug('Not within sunrise range: %s seconds', sunrise_diff);
      }

      // If within 2 times of the interval of sunset, set our sunset level
      // Determine our diff. A positive value is before sunset
      var sunset_diff = abode.providers.time.sunset - abode.providers.time.time;

      if (device.config.sunset && device.config.sunset_level !== undefined && sunset_diff >= 0 && sunset_diff <= (Autoshades.config.interval * 60 * 2)) {
        log.debug('Using sunset level');
        level = device.config.sunset_level;
      } else {
        log.debug('Not within sunset range: %s seconds', sunset_diff);
      }

      // If we do not have a level to set, move on
      if (level === undefined) {
        log.debug('No level could be determined for device: %s', device.name);
        return device_defer.resolve();
      }

      // Set a timer
      device_defer.timer = setTimeout(function () {
        device_defer.resolve();
        log.error('Timeout waiting for device level to set: %s', device.name);
      }, 1000 * 60 * Autoshades.config.interval);

      // Set the auto shade device level
      Autoshades.set_level(device, level).then(function (data) {
        device_defer.resolve();
        clearTimeout(device_defer.timer);

        // If we have an update key, set the device staet
        if (data.update) {
          device.set_state(data.update, undefined, {'skip_pre': true, 'skip_post': true});
        }
      }, function () {
        log.error('There was error setting the level for: %s', device.name);
        device_defer.reject();
        clearTimeout(device_defer.timer);
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

  log.info('Autoshades.set_level(%s, %s)', device.name, level);

  // Iterate through each device
  device.config.devices.forEach(function (shade) {
    var device_level,
      shade_device = abode.devices.get(shade.name);

    // If the device could not be found, skip
    if (!shade_device) {
      log.error('Shade not found: %s', shade.name);
      return;
    }

    // If requested level is above min level, set to wait_level
    if (device.wait_level !== undefined && level >= device.wait_level) {
      // Set the device and return add the defer to our list
      log.debug('Shade level higher then then min level: %s (%s)', shade_device.name, device.wait_level);
      device_level = device.wait_level;
    } else {
      device_level = level;
    }

    // If the device is already at the requested value, skip
    if (shade_device._level === device_level) {
      log.debug('Shade level already set: %s (%s)', shade_device.name, level);
      return;
    }

    // If the device is below min_level, skip
    if (device_level < device.min_level) {
      log.debug('Shade level requested is below min level: %s (req: %s min: %s )', shade_device.name, level, device.min_level);
    }

    // Set the device and return add the defer to our list
    log.debug('Setting shade level to %s%%: %s', level, shade_device.name);
    device_defers.push(shade_device.set_level(device_level));

  });

  // Once all device defers are resolved, resolve our main defer
  q.allSettled(device_defers).then(function () {
    defer.resolve({'response': true, 'update': {_on: true, _level: level}});
  });

  return defer.promise;
};

module.exports = Autoshades;
