'use strict';

var abode,
  routes,
  q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('mock');

var Mock = function () {
  var defer = q.defer();

  // Get abode
  abode = require('../../abode');

  // Set our routes
  routes = require('./routes');
  abode.web.server.use('/api/mock', routes);

  // Build our config
  abode.config.mock = abode.config.mock || {};
  Mock.config = abode.config.mock;
  Mock.config.enabled = (Mock.config.enabled === false) ? false : true;

  var msg = 'Provider started';
  log.info(msg);
  defer.resolve({'status': 'success', 'message': msg});

  if (Mock.config.enabled) {
    Mock.enable();
  } else {
    Mock.enabled = false;
  }

  return defer.promise;
};

Mock.enable = function () {
  var defer = q.defer();

  log.info('Enabling Mock provider');
  Mock.enabled = true;
  defer.resolve({'status': 'success'});

  return defer.promise;
};

Mock.disable = function () {
  var defer = q.defer();

  log.info('Disabling Mock provider');
  Mock.enabled = false;
  defer.resolve({'status': 'success'});

  return defer.promise;
};



//
Mock.get_status = function (device) {
  var defer = q.defer();

  log.info('Mock.get_status(%s)', device);
  defer.resolve({'response': true});

  return defer.promise;
};

Mock.on = Mock.open = function (device) {
  var defer = q.defer();

  log.info('Mock.on(%s)', device.name);
  defer.resolve({'response': true, 'update': {_on: true, _level: 100}});

  return defer.promise;
};

Mock.off = Mock.close = function (device) {
  var defer = q.defer();

  log.info('Mock.off(%s)', device.name);
  defer.resolve({'response': true, 'update': {_on: false, _level: 0}});

  return defer.promise;
};

Mock.set_level = function (device, level) {
  var defer = q.defer();

  log.info('Mock.set_level(%s, %s)', device.name, level);
  defer.resolve({'response': true, 'update': {_on: (level > 0), _level: level}});

  return defer.promise;
};

module.exports = Mock;
