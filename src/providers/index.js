'use strict';

var abode;
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('providers');

//Build our providers object
var Providers = function (providers) {
  var defer = q.defer(),
    provider_defers = [];

  abode = require('../abode');

  var defer_handler = (abode.config.fail_on_provider) ? q.all : q.allSettled;

  //Create an empty providers array
  Providers._providers = [];

  if ((providers instanceof Array) === false) {

    log.error('Failed to load providers');

    defer.reject({'status': 'failed', 'message': 'No providers to load, check the config'});
    return defer.promise;

  } else {

    //Load the providers
    providers.forEach(function(provider) {
      var provider_defer = q.defer(),
        provider_log = logger.getLogger(provider);

      logger.addAppender(logger.appenders.console(), provider);
      //Add the provider promise to our defer array
      provider_defers.push(provider_defer.promise);

      // Include an intiailize the provider
      log.debug('Loading provider: ' + provider);
      Providers[provider] = require('./' + provider);

      //Set our config
      abode.config[provider] = abode.config[provider] || {};

      //Set our log level
      if (abode.config[provider] && abode.config[provider].debug) {
        provider_log.setLevel('DEBUG');

      } else {
        provider_log.setLevel('INFO');
        abode.config[provider].debug = false;
      }

      Providers[provider]().then(function () {
        Providers._providers.push(provider);

        if (Providers[provider].triggers instanceof Array) {
          Providers[provider].triggers.forEach(function (e) {
            if (abode.triggers.types.indexOf(e) > -1) {
              log.warn('Duplicate event detected:', e);
            }

            log.debug('Trigger type registered: ' + e.name);
            abode.triggers.types.push(e);
          });
        }
        provider_defer.resolve();
      }, function (err) {
        provider_defer.reject(err);
      });

    });

    // If all providers promise resolved, resolve our main promise
    // otherwise reject it with the error
    defer_handler(provider_defers).then(function () {
      log.debug('Providers loaded successfully');
      defer.resolve();
    }, function(err) {
      log.error('Failed to load providers');
      defer.reject(err);
    });

  }

  return defer.promise;
};

// Return all providers
Providers.list = function () {
  return Providers._providers;
};


module.exports = Providers;
