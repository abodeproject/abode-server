'use strict';

var abode,
  events,
  routes,
  config,
  Wunderground,
  q = require('q'),
  http = require('http'),
  logger = require('log4js'),
  log = logger.getLogger('wunderground');

Wunderground = function () {
  var defer = q.defer();
  abode = require('../../abode');
  events = abode.events;
  routes = require('./routes');

  config = abode.config.wunderground || {};
  config.enabled = config.enabled || true;
  config.server = config.server || 'api.wunderground.com';
  config.interval = config.interval || 5;
  config.temp_units = config.temp_units || 'f';
  config.wind_units = config.wind_units || 'mph';
  config.press_units = config.press_units || 'in';
  config.dist_units = config.dist_units || 'mi';
  config.rain_units = config.rain_units || 'in';

  if (config.key === undefined) {
    log.error('Wunderground provider has no key configured');
    defer.reject('Wunderground provider has no key configured');
    return defer.promise;
  }

  abode.web.server.use('/wunderground', routes);

  abode.events.on('ABODE_STARTED', function () {
    if (config.enabled === false) {
      log.warn('Not starting Wunderground.  Not enabled');
      return;
    }

    log.info('Starting Wunderground provider');
    setInterval(Wunderground.load, (1000 * 60 * config.interval));
    Wunderground.load();
  });


  log.debug('Wunderground provider initialized');
  defer.resolve(Wunderground);

  return defer.promise;
};

Wunderground.get = function (location) {
  var data = '',
    defer = q.defer();

  var uri = '/api/' + config.key + '/conditions/forecast10day/alerts/astronomy/q/' + location + '.json';
  var options = {
    host: config.server,
    path: uri,
  };

  var handleError = function (err) {
    log.error('Error getting weather: %s\n%s', location, err);
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
        log.debug('Parsed weather data: %s\n%s', location, data);
        log.info('Parsed weather: ', location);

      } catch (e) {

        log.error('Failed to parse %s: \n%s', location, [e]);
        defer.reject('Failed to parse response');

      }

    });
  };

  http.request(options, parseResponse)
  .on('error', handleError)
  .end();

  return defer.promise;
};

Wunderground.load = function () {

  var devices = abode.devices.get_by_provider('wunderground');

  if (devices.length === 0) {
    log.info('No Wunderground Devices to Query');
  }

  var timeToEpoch = function (hour, minute) {
    return (hour * 60 * 60) + (minute * 60);
  };

  var parseForecast = function (forecast) {
    var parsed = [];
    var t_units = (config.temp_units === 'f') ? 'fahrenheit' : 'celsius';

    forecast.forEach(function (day) {
      parsed.push(
        {
          humidity: day.avehumidity,
          wind: day.avewind[config.wind_units],
          wind_degrees: day.avewind.degrees,
          wind_direction: day.avewind.dir,
          conditions: day.conditions,
          icon: day.icon,
          temp_high: day.high[t_units],
          temp_low: day.low[t_units],
          rain: day.qpf_allday[config.rain_units],
          snow: day.snow_allday[config.rain_units],
          weekday: day.date.weekday,
        });
    });

    return parsed;
  };

  devices.forEach(function (device) {
    Wunderground.get(device.config.location).then(function (data) {
      device.config.raw = data;

      var current = data.current_observation || {};
      var forecast = data.forecast || {};
      forecast = data.forecast.simpleforecast || {};
      forecast = data.forecast.simpleforecast.forecastday || [];
      var moon = data.moon_phase || {};
      var alerts = data.alerts || [];

      device.set_state({
        _temperature: current['temp_' + config.temp_units],
        _humidity: parseInt(current.relative_humidity, 10),
        _weather: {
          temp: current['temp_' + config.temp_units],
          humidity: parseInt(current.relative_humidity, 10),
          wind_direction: current.wind_dir,
          wind_degrees: current.wind_degrees,
          wind: current['wind_' + config.wind_units],
          gusts: current['wind_gust_' + config.wind_units],
          pressure: current['pressure_' + config.press_units],
          pressure_trend: current.pressure_trend,
          dewpoint: current['dewpoint_' + config.temp_units],
          visibility: current['visibility_' + config.dist_units],
          rain_1hr: current['precip_1hr_' + config.rain_units],
          rain_total: current['precip_today_' + config.rain_units],
          icon: current.icon,
          conditions: current.weather,
        },
        _forecast: parseForecast(forecast),
        _moon: {
          age: moon.ageOfMoon,
          rise: timeToEpoch(moon.moonrise.hour, moon.moonrise.minute),
          set: timeToEpoch(moon.moonset.hour, moon.moonset.minute),
          phase: moon.phaseofMoon,
          illumination: moon.percentIlluminated
        },
        _alerts: alerts
      });

    });
  });

};



module.exports = Wunderground;
