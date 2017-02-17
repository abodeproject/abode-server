'use strict';

var abode,
  routes,
  q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('zwave');

var ZWave = function () {
  var defer = q.defer();

  // Get abode
  abode = require('../../abode');

  // Set our routes
  routes = require('./routes');
  abode.web.server.use('/api/zwave', routes);

  // Build our config
  abode.config.zwave = abode.config.zwave || {};
  ZWave.config = abode.config.zwave;
  ZWave.config.enabled = (ZWave.config.enabled === true) ? true : false;
  ZWave.config.device = ZWave.config.device || '/dev/ttyACM0';
  ZWave.config.message_time = ZWave.config.message_time || 2;
  ZWave.config.queue_interval = ZWave.config.queue_interval || 100;
  ZWave.config.poll_interval = ZWave.config.poll_interval || 60;

  // Set some defaults
  ZWave.connected = false;
  ZWave.queue = [];

  // If we are enabled, start it up
  if (ZWave.config.enabled) {

    log.info('Z-Wave provider initialized');
    ZWave.enable();

  } else {
    log.info('Z-Wave provider not enabled');
  }

  defer.resolve();

  return defer.promise;
};

ZWave.enable = function () {
  var msg,
    defer = q.defer();

  if (!ZWave.connected) {
    msg = 'Provider started';

    // Enable the provider
    ZWave.config.enabled = true;

    // Attempt a connection
    ZWave.connect();

    // Start our queue processor
    ZWave.timer = setInterval(ZWave.queue_processor, ZWave.config.queue_interval);

    // Start our poller
    ZWave.poller = setInterval(ZWave.poll, ZWave.config.poll_interval * 1000);

    log.info(msg);
    defer.resolve({'status': 'success', 'message': msg});
  } else {
    msg = 'Already running';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
  }

  return defer.promise;
};

ZWave.disable = function () {
  var msg,
    defer = q.defer();

  if (ZWave.connected) {
    msg = 'Provider stopped';

    // Disable the provider
    ZWave.config.enabled = false;

    // Stop the queue handler
    clearInterval(ZWave.timer);

    // Stop the queue handler
    clearInterval(ZWave.poller);

    // Disconnect the telnet connection
    ZWave.connection.disconnect(ZWave.config.device);

    log.info(msg);
    defer.resolve({'status': 'success', 'message': msg});
  } else {
    msg = 'Already stopped';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
  }

  return defer.promise;
};

ZWave.queue_processor = function () {

  // If we are already processing a message, skip this interval
  if (!ZWave.connected) {
    return;
  }

  // If we are already processing a message, skip this interval
  if (ZWave.processing) {
    return;
  }

  // If the queue is empty, skip this interval
  if (ZWave.queue.length === 0) {
    return;
  }

  // Get a message to process
  var msg = ZWave.queue.shift();

  // Set our processing flag to the message
  ZWave.processing = msg;

  // Send the message
  msg.send();
};

ZWave.poll = function () {

  // If we are already polling, throw an error
  if (ZWave.polling) {
    log.warn('Poll in progress since %s', ZWave.polling);
    return;
  }

  // Set our polling start time
  ZWave.polling = new Date();

  // Get all lutron devices
  var devices = abode.devices.get_by_provider('zwave');
  //abode.devices.get_by_providerAsync('zwave').then(function (devices) {
    var device_defers = [];

    // If no devices found, return
    if (devices.length === 0) {
      log.debug('No devices to Poll');
      ZWave.polling = false;
      return;
    }

    log.debug('Starting to poll devices');
    devices.forEach(function (device) {
      // Set our device defer and add it to our list
      var device_defer = q.defer();
      device_defers.push(device_defer.promise);

      // If device is not active, do not poll
      if (device.active !== true) {
        device_defer.resolve();
        return;
      }

      // Get status of device
      ZWave.get_status(device).then(function (data) {
        device_defer.resolve();

        // If we have an update key, set the device staet
        if (data.update) {

          device.set_state(data.update, undefined, {'skip_pre': true, 'skip_post': true});

        }
      });
    });

    // Once all devices polled, set polling flag to false
    q.allSettled(device_defers).then(function () {
      ZWave.polling = false;
    });

  //});

};

ZWave.connect = function () {
  var defer = q.defer();

  return defer.promise;
};

ZWave.get_status = function (device) {
  var defer = q.defer();

  log.info('ZWave.get_status(%s)', device);
  defer.resolve();

  return defer.promise;
};

ZWave.on = function (device) {
  var defer = q.defer();

  log.info('ZWave.on(%s)', device);
  defer.resolve();
  
  return defer.promise;
};

ZWave.off = function (device) {
  var defer = q.defer();

  log.info('ZWave.off(%s)', device);
  defer.resolve();
  
  return defer.promise;
};

ZWave.set_leve = function (device, level) {
  var defer = q.defer();

  log.info('ZWave.off(%s, %s)', device, level);
  defer.resolve();
  
  return defer.promise;
};

module.exports = ZWave;