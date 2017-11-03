'use strict';

var cluster = require('cluster');
var abode = require('./abode');
var logger = require('log4js'),
  log = logger.getLogger('abode');

var config = {
  'path': process.env.ABODE_CONFIG,
  'url': process.env.ABODE_URL,
  'mode': process.env.ABODE_MODE,
  'name': process.env.ABODE_NAME,
  'debug': process.env.ABODE_DEBUG,
  'database': {
    'server': process.env.ABODE_DB_SERVER,
    'database': process.env.ABODE_DB_DATABASE
  },
  'web': {
    'address': process.env.IP || process.env.ABODE_WEB_ADDRESS,
    'port': process.env.PORT || process.env.ABODE_WEB_PORT,
    'access_log': process.env.ABODE_ACCESS_LOGS
  }
};

var fork = function () {
  log.info('Starting Abode process');
  cluster.fork();
};

if (cluster.isMaster && process.env.ABODE_DISABLE_SUPERVISOR !== '1') {
  log.info('Abode supervisor started');

  cluster.on('exit', function (worker, code, signal) {
    log.debug('Received signal %s', signal);

    if (code !== 0) {
      log.error('Abode exitted, restarting in 2 seconds: %s', code);
      setTimeout(function () {
        fork();
      }, 2000);
    } else {
      process.exit(0);
    }

  });

  fork();

} else {

  abode.init(config);

}
