'use strict';

var abode,
  routes,
  config,
  q = require('q'),
  fs = require('fs'),
  path = require('path'),
  spawn = require('child_process').spawn;

var logger = require('log4js'),
  log = logger.getLogger('video');

var Video = function () {
  var defer = q.defer();
  abode = require('../../abode');
  routes = require('./routes');

  Video.playing = false;
  Video.last_status = -1;

  abode.web.server.use('/api/video', routes);

  abode.config.video.player = abode.config.video.player || 'omxplayer';
  abode.config.video.options = abode.config.video.options || [];

  if (process.env.DISPLAY) {
    log.info('Valid display found:', process.env.DISPLAY);
    Video.display = process.env.DISPLAY;

  } else {
    log.warn('No valid display found');
  }
  defer.resolve();

  return defer.promise;
};

Video.start = function (config) {
  var defer = q.defer();

  if (Video.playing) {
    defer.reject({'status': 'failed', 'message': 'Video already playing'});
    return defer.promise;
  }

  Video.stdout = '';
  Video.stderr = '';

  config.url = [config.url];
  config.url.unshift.apply(abode.config.video.options);

  Video.spawn = spawn(abode.config.video.player, config.url, {env: process.env});
  Video.spawn.on('exit', function (status, sig) {
    log.info('Video exited: %s (%s)', status, sig);
    Video.last_status = status;
    Video.playing = false;
  });
  Video.spawn.on('error', function (err) {
    log.error('Error playing video:', err);
    defer.reject({'status': 'failed', 'message': err});
    Video.stop();
  });

  setTimeout(function () {
    Video.playing = true;
    defer.resolve({'status': 'success', 'pid': Video.spawn.pid});
  }, 1000);

  setTimeout(Video.stop, config.duration * 1000);
  log.info('Video timer set for %s seconds', config.duration);

  return defer.promise;
};

Video.stop = function () {
  var defer = q.defer();

  log.info('Stopping Video:', Video.spawn.pid);

  Video.spawn.kill('SIGKILL');

  defer.resolve();

  return defer.promise;
};
module.exports = Video;
