'use strict';

var abode,
  routes,
  q = require('q'),
  mqtt = require('mqtt'),
  logger = require('log4js'),
  log = logger.getLogger('mqtt');

var Mqtt = function () {
  var defer = q.defer();

  abode = require('../../abode');

  // Set our routes
  routes = require('./routes');
  abode.web.server.use('/api/mqtt', routes);

  abode.config.mqtt = abode.config.mqtt || {};
  Mqtt.config = abode.config.mqtt;
  Mqtt.config.enabled = (Mqtt.config.enabled === true) ? true : false;
  Mqtt.config.server = Mqtt.config.server || 'mqtt://localhost';
  Mqtt.config.save_wait = Mqtt.config.save_wait || 500;
  Mqtt.config.min_save_age = Mqtt.config.min_save_age || 1000 * 10;

  if (Mqtt.config.enabled) {
    Mqtt.enable();
    defer.resolve();
  } else {
    log.info('Mqtt provider not enabled');
    Mqtt.enabled = false;
    defer.resolve();
  }


  return defer.promise;
};

Mqtt.enable = function () {
  var defer = q.defer();

  Mqtt.connect().then(function () {
    log.info('Mqtt provider initialized');
    Mqtt.enabled = true;
    defer.resolve();
  }, function (err) {
    Mqtt.client.end();
    Mqtt.enabled = false;
    defer.reject({'status': 'failed', 'message': 'Failed to connect to MQTT'});
  });

  return defer.promise;
};

Mqtt.disable = function () {
  var defer = q.defer();

  if (Mqtt.client && !Mqtt.client.disconnected) {
    Mqtt.client.end();
  }
  Mqtt.enabled = false;
  defer.resolve();

  return defer.promise;
}

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

    log.debug('Message received for %s: %s = %s', topic, key, value);

    if (!Mqtt.cache[topic]) {
      Mqtt.cache[topic] = {
        'obj': {},
        'last_save': 0,
      };
    } else {
      clearTimeout(Mqtt.cache[topic].wait_timer);
      clearTimeout(Mqtt.cache[topic].save_timer);
    }

    Mqtt.cache[topic].obj = message;
    Mqtt.cache[topic].wait_timer = setTimeout(function () { Mqtt.save_cache(topic); }, Mqtt.config.save_wait);
    Mqtt.cache[topic].save_timer = setTimeout(function () { Mqtt.save_cache(topic); }, Mqtt.config.min_save_age);

  });

  return defer.promise;
};

Mqtt.parsers = {
  'weewx': function (data) {
    var now = new Date().getTime() / 1000;
    data = JSON.parse(data);

    if ((now - data.dateTime) > (1000 * 60 * 5)) {
      log.warning('Weewx parser reports stale weather, skipping');
      return false;
    }

    return {
      '_temperature': parseFloat(data.outTemp_F, 2).toFixed(2),
      '_humidity': parseFloat(data.outHumidity, 2).toFixed(2),
      '_weather': {
        'rain_total': parseFloat(data.rain24_in, 2).toFixed(2),
        'rain_1hr': parseFloat(data.hourRain_in, 2).toFixed(2),
        'dewpoint': parseFloat(data.dewpoint_F, 2).toFixed(2),
        'pressure': parseFloat(data.pressure_inHg, 2).toFixed(2),
        'gusts': data.windGust_mph,
        'wind': data.windSpeed_mph,
        'wind_degrees': data.windDir,
        'humidity': parseFloat(data.outHumidity, 2).toFixed(2),
        'temp': parseFloat(data.outTemp_F, 2).toFixed(2)
      }
    };
  },
  'sensor': function (data) {
    data = JSON.parse(data);

    return {
      '_temperature': data.temperature,
      '_humidity': data.humidity,
      '_lumens': data.lux,
      '_motion': (data.motion == 1)
    }
  }
};

Mqtt.save_cache = function (topic) {
  var now = new Date().getTime(),
    age = now - Mqtt.cache[topic].last_save;

  if (age >= Mqtt.config.min_save_age) {

    clearTimeout(Mqtt.cache[topic].save_timer);
    Mqtt.cache[topic].last_save = now;

    abode.devices.model.findOne({'config.topic': topic, 'provider': 'mqtt'}).then(function (device) {
      if (!device) {
        //log.warn('Device not found:', topic);
        return;
      }

      device.config.raw = Mqtt.cache[topic].obj;

      if (device.config.parser && Mqtt.parsers[device.config.parser]) {
        log.info('Found device: ', device.name, topic);
        var abode_device = abode.devices.get(device.name);

        try {
          var data = Mqtt.parsers[device.config.parser](device.config.raw);
        } catch (e) {
          log.error(e);
          return
        }
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
    log.debug('Data not old enough for device:', topic);
  }

};

module.exports = Mqtt;
