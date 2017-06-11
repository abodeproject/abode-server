'use strict';

var abode,
  routes,
  q = require('q');

var logger = require('log4js'),
  log = logger.getLogger('computers');

var Computers = function () {
  var defer = q.defer();
  abode = require('../../abode');
  routes = require('./routes');

  abode.web.server.use('/api/computers', routes);

  abode.config.computers = abode.config.computers || {};
  abode.config.computers.enabled = (abode.config.computers.enabled !== false);

  if (abode.config.computers.enabled) {
    Computers.enable();
  } else {
    log.warn('Computer provider not enabled: %s', abode.config.computers.enabled);
    Computers.enabled = false;
  }
  defer.resolve();

  return defer.promise;
};

Computers.enable = function () {
  var defer = q.defer();

  log.info('Enabling Computer provider');
  Computers.enabled = true;
  defer.resolve({'status': 'success'});

  return defer.promise;
};

Computers.disable = function () {
  var defer = q.defer();

  log.info('Disabling Computer provider');
  Computers.enabled = false;
  defer.resolve({'status': 'success'});

  return defer.promise;
};

module.exports = Computers;
