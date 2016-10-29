'use strict';

var abode,
  config,
  q = require('q');

var logger = require('log4js'),
  log = logger.getLogger('browser');

var Browser = function () {
  var defer = q.defer();
  abode = require('../../abode');
  //routes = require('./routes');

  //abode.web.server.use('/api/browsers', routes);

  abode.config.browser = abode.config.browser || {};
  abode.config.browser.enabled = (abode.config.browser.enabled === false) ? false : true;

  config = abode.config.browser || {};
  log.info('Browser Loaded');
  defer.resolve();

  return defer.promise;
};

module.exports = Browser;
