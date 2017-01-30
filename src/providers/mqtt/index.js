'use strict';

var abode,
  q = require('q'),
  mqtt = require('mqtt'),
  logger = require('log4js'),
  log = logger.getLogger('mqtt');

var Mqtt = function () {
  var defer = q.defer();

  abode = require('../../abode');


  abode.config.mqtt = abode.config.mqtt || {};
  Mqtt.config = abode.config.mqtt;
  Mqtt.config.enabled = (Mqtt.config.enabled === true) ? true : false;
  Mqtt.config.server = Mqtt.config.server || 'mqtt://localhost';
  Mqtt.config.save_wait = Mqtt.config.save_wait || 500;
  Mqtt.config.min_save_age = Mqtt.config.min_save_age || 1000 * 10;

  if (Mqtt.config.enabled) {
    Mqtt.connect().then(function () {
      log.info('Mqtt provider initialized');
      defer.resolve();
    }, function (err) {
      defer.reject(err);
    });
  } else {
    log.info('Mqtt provider not enabled');
    defer.resolve();
  }


  return defer.promise;
};

Mqtt.cache = {};

Mqtt.connect = function () {
  var defer = q.defer();

  Mqtt.client = mqtt.connect(Mqtt.config.server);
  Mqtt.client.on('connect', function () {
    log.info('Connected to MQTT Server');
    Mqtt.client.subscribe('#');
    defer.resolve();
  });

  Mqtt.client.on('reconnect', function () {
    log.warn('Reconnecting to MQTT server');
    defer.reject();
  });

  Mqtt.client.on('error', function (err) {
    log.error('Could not connect to MQTT server: %s', err);
    defer.reject(err);
  });

  Mqtt.client.on('message', function (topic, message) {
    var parts = topic.split('/'),
      name = parts[0],
      key = parts[1],
      value = message.toString();

    value = (isNaN(value)) ? value : parseFloat(value);

    log.debug('Message received for %s: %s = %s', name, key, value);

    if (!Mqtt.cache[name]) {
      Mqtt.cache[name] = {
        'obj': {},
        'last_save': 0,
      };
    } else {
      clearTimeout(Mqtt.cache[name].wait_timer);
      clearTimeout(Mqtt.cache[name].save_timer);
    }

    Mqtt.cache[name].obj[key] = value;
    Mqtt.cache[name].wait_timer = setTimeout(function () { Mqtt.save_cache(name); }, Mqtt.config.save_wait);
    Mqtt.cache[name].save_timer = setTimeout(function () { Mqtt.save_cache(name); }, Mqtt.config.min_save_age);

  });

  return defer.promise;
};

Mqtt.parsers = {
  'weewx': function (data) {
    var now = new Date().getTime() / 1000;

    if ((now - data.dateTime) > (1000 * 60 * 5)) {
      log.warning('Weewx parser reports stale weather, skipping');
      return false;
    }

    return {
      '_temperature': data.outTemp_F.toFixed(2),
      '_humidity': data.outHumidity.toFixed(2),
      '_weather': {
        'rain_total': data.rain24_in,
        'rain_1hr': data.hourRain_in,
        'dewpoint': data.dewpoint_F.toFixed(2),
        'pressure': data.pressure_inHg.toFixed(2),
        'gusts': data.windGust_mph,
        'wind': data.windSpeed_mph,
        'wind_degrees': data.windDir,
        'humidity': data.outHumidity.toFixed(2),
        'temp': data.outTemp_F.toFixed(2)
      }
    };
  }
};

Mqtt.save_cache = function (name) {
  var now = new Date().getTime(),
    age = now - Mqtt.cache[name].last_save;

  if (age >= Mqtt.config.min_save_age) {

    clearTimeout(Mqtt.cache[name].save_timer);
    Mqtt.cache[name].last_save = now;

    abode.devices.model.findOne({'config.topic': name, 'provider': 'mqtt'}).then(function (device) {
      if (!device) {
        log.warn('Device not found:', name);
        return;
      }

      device.config.raw = Mqtt.cache[name].obj;

      if (device.config.parser && Mqtt.parsers[device.config.parser]) {
        var abode_device = abode.devices.get(device.name);

        var data = Mqtt.parsers[device.config.parser](device.config.raw);
        if (!data) {
          return;
        }

        data.config = device.config;
        data.last_seen = new Date();
        abode_device.set_state(data);
      } else {
        log.warning('No parser for device');
      }
    }, function (err) {
      log.error('Error looking up device: %s', err);
    });

  } else {
    log.debug('Data not old enough for device:', name);
  }

};

module.exports = Mqtt;
