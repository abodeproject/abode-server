'use strict';

var abode,
  routes,
  config,
  q = require('q');

var logger = require('log4js'),
  log = logger.getLogger('alarmclock');

var AlarmClock = function () {
  var defer = q.defer();
  abode = require('../../abode');
  routes = require('./routes');

  abode.web.server.use('/api/alarmclocks', routes);

  abode.config.alarmclock = abode.config.alarmclock || {};
  abode.config.alarmclock.enabled = (abode.config.alarmclock.enabled === false) ? false : true;

  config = abode.config.alarmclock || {};
  log.info('Alarm Clock Loaded');
  defer.resolve();

  return defer.promise;
};

AlarmClock.trigger_to_alarm = function (trigger) {
  var alarm = {};

  alarm._id = trigger._id;
  alarm.name = trigger.name;
  alarm.time = trigger.match;
  alarm.actions = trigger.actions;
  alarm.enabled = trigger.enabled;

  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].forEach(function (day) {
    var day_condition = trigger.conditions.filter(function (condition) {
      return (
        condition.left_type === 'time' &&
        condition.left_key === 'is.' + day &&
        condition.condition === 'eq' &&
        condition.right_type === 'boolean' &&
        condition.right_key === true
      );
    });

    if (day_condition.length > 0) {
      alarm[day] = 'true';
    }
  });

  return alarm;
};

AlarmClock.alarm_to_trigger = function (config) {
  var trigger = {};
  trigger.name = config.name;
  trigger.match = config.time;
  trigger.match_type = 'time';
  trigger.trigger = 'TIME_CHANGE';
  trigger.tags = ['alarmclock'];
  trigger.actions = config.actions;
  trigger.enabled = config.enabled;
  trigger.conditions = [];

  ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].forEach(function (day) {
    if (config[day] === true) {
      trigger.conditions.push({'left_type': 'time', 'left_key': 'is.' + day, 'condition': 'eq', 'right_type': 'boolean', 'right_key': true});
    }
  });

  return trigger;
};

AlarmClock.list = function () {
  var defer = q.defer();

  var triggers = abode.triggers.list().filter(function (trigger) {
    return (trigger.tags.indexOf('alarmclock') > -1);
  });

  triggers = triggers.map(AlarmClock.trigger_to_alarm);

  defer.resolve(triggers);

  return defer.promise;
};

AlarmClock.get = function (id) {
  var defer = q.defer(),
    alarm = abode.triggers.get_by_id(id);

  if (!alarm) {
    defer.reject({'message': 'Not Found'});
  } else {
    defer.resolve(AlarmClock.trigger_to_alarm(alarm));
  }

  return defer.promise;
};

AlarmClock.create = function (config) {
  var defer = q.defer();

  var trigger = AlarmClock.alarm_to_trigger(config);
  abode.triggers.create(trigger).then(function (alarm) {
    defer.resolve(AlarmClock.trigger_to_alarm(alarm));
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;

};

AlarmClock.update = function (config, id) {
  var defer = q.defer();

  var trigger = abode.triggers.get_by_id(id);
  if (!trigger) {
    defer.reject({'http_code': 404, 'message': 'Not Found'});
    return defer.promise;
  }

  var trigger_update = AlarmClock.alarm_to_trigger(config);

  Object.keys(trigger_update).forEach(function (key) {
    if (trigger_update[key] !== undefined) {
    trigger[key] = trigger_update[key];
    }
  });

  trigger._save().then(function () {
    defer.resolve(AlarmClock.trigger_to_alarm(trigger));
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;

};

AlarmClock.delete = function (id) {
  var defer = q.defer();

  var trigger = abode.triggers.get_by_id(id);

  if (!trigger) {
    defer.reject({'message': 'Not Found'});
    return defer.promise;
  }

  return trigger.delete();

};

module.exports = AlarmClock;
