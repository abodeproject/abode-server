'use strict';
var routes,
  day,
  time,
  abode,
  day_int,
  current,
  suncalc,
  sunrise,
  sunset,
  solar_noon,
  time_interval,
  q = require('q'),
  events,
  SunCalc = require('suncalc'),
  days = [ 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday' ];

var Time;
var logger = require('log4js'),
  log = logger.getLogger('time');

//Update the various details which other functions rely on
var updateDetails = function (date) {
  var hour, min, sec;

  //Update the current time to the nearest minute
  current = date;
  current.setSeconds(0);
  current.setMilliseconds(0);
  Time.current = current.getTime();

  //Get the day of the week
  day_int = date.getDay();
  day = days[day_int];
  Time.day = day;

  //Get the time, or number of seconds since midnight
  hour = current.getHours() * 60 * 60;
  min = current.getMinutes() * 60;
  sec = current.getSeconds();

  Time.time = hour + min + sec;

  //Update sun/moon times
  suncalc = SunCalc.getTimes(current, Time.config.location.lat, Time.config.location.long);

  sunrise = suncalc.sunrise;
  sunrise.setSeconds(0);
  sunrise.setMilliseconds(0);
  Time.sunrise = sunrise.getTime();

  sunset = suncalc.sunset;
  sunset.setSeconds(0);
  sunset.setMilliseconds(0);
  Time.sunset = sunset.getTime();

  solar_noon = suncalc.solarNoon;
  solar_noon.setSeconds(0);
  solar_noon.setMilliseconds(0);
  Time.solar_noon = solar_noon.getTime();

  //Build hash to check for various states
  Time.is.sunday = (day_int === 0);
  Time.is.monday = (day_int === 1);
  Time.is.tuesday = (day_int === 2);
  Time.is.wednesday = (day_int === 3);
  Time.is.thursday = (day_int === 4);
  Time.is.friday = (day_int === 5);
  Time.is.saturday = (day_int === 6);
  Time.is.sunset = (Time.current === Time.sunset);
  Time.is.sunrise = (Time.current === Time.sunrise);
  Time.is.solar_noon = (Time.current === solar_noon);
  Time.is.day = (current > sunrise && current < sunset);
  Time.is.night = (current > sunset || current < sunrise);
};

//Primary function to fire events and update times
var processTime = function () {
  var day_change,
    time_change,
    newTime = new Date();
  newTime.setSeconds(0);
  newTime.setMilliseconds(0);


  //Determine if there has been a day or time change
  day_change = (current.toDateString() !== newTime.toDateString());
  time_change = (current.toString() !== newTime.toString());

  //If we had a day or time change, update the time details
  if (time_change || day_change) {
    updateDetails(newTime);

    if (Time.current === Time.sunset) {
      log.debug('sunset');
      events.emit('SUNSET', {'type': 'time', 'name': 'Sunset', 'object': Time});
    }
    if (Time.current === Time.sunrise) {
      log.debug('sunrise');
      events.emit('SUNRISE', {'type': 'time', 'name': 'Sunset', 'object': Time});
    }
    if (Time.current === Time.solar_noon) {
      log.debug('solar_noon');
      events.emit('SOLAR_NOON', {'type': 'time', 'name': 'Sunset', 'object': Time});
    }
  }

  //Fire events for various changes
  if (day_change) {
    log.debug('Day changed');

    //events.emit('DAY_CHANGE', Time.day);
    events.emit('DAY_CHANGE', {'type': 'time', 'name': Time.day, 'object': Time});
  }
  if (time_change) {
    log.debug('Time changed');
    //events.emit('TIME_CHANGE', Time.time);
    events.emit('TIME_CHANGE', {'type': 'time', 'name': Time.time, 'object': Time});
  }
};

Time = function () {
  var deferred = q.defer();
  abode = require('../../abode');
  events = abode.events;
  routes = require('./routes');

  abode.web.server.use('/api/time', routes);

  Time.config = abode.config.time || {};
  Time.config.location = Time.config.location || abode.config.location;
  Time.config.debug = (Time.config.debug !== undefined) ? Time.config.debug : abode.config.debug;

  //Set our log level
  if (Time.config.debug) {
    log.setLevel('DEBUG');
  } else {
    log.setLevel('INFO');
  }

  updateDetails(new Date());
  time_interval = setInterval(processTime, 15000);

  log.debug('Time provider initialized');
  deferred.resolve(time);

  return deferred.promise;
};

Time.getTime = function (date) {
  var hour, min, sec,
    toParse = new Date(date);

  //Get the time, or number of seconds since midnight
  hour = toParse.getHours() * 60 * 60;
  min = toParse.getMinutes() * 60;
  sec = toParse.getSeconds();

  return hour + min + sec;
};

Time.triggers = [
  {'name': 'TIME_CHANGE'},
  {'name': 'DAY_CHANGE'},
  {'name': 'SUNSET'},
  {'name': 'SUNRISE'},
  {'name': 'SOLAR_NOON'}
];
Time.is = {};

module.exports = Time;
