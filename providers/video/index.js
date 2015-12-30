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
  Video.spawn.on('close', function (status) {
    console.log('close');
    Video.last_status = status;
    Video.playing = false;
  });
  Video.spawn.on('disconnect', function () {
    console.log('disconnect');
    Video.playing = false;
  });
  Video.spawn.on('exit', function () {
    console.log('exit');
    Video.playing = false;
  });
  Video.spawn.on('error', function (err) {
    console.log('error');
    defer.reject({'status': 'failed', 'message': err});
    Video.playing = false;
  });

  setTimeout(function () {
    Video.playing = true;
    defer.resolve({'status': 'success'});
  }, 1000);

  setTimeout(Video.stop, config.duration * 1000);

  return defer.promise;
};

Video.stop = function () {
  var defer = q.defer();

  Video.spawn.kill();

  if (Video.spawn.connected) {
    setTimeout(function () {
      if (Video.spawn.connected) {
        Video.spawn.kill('SIGKILL');
        Video.playing = false;
      }
      defer.resolve();
    }, 5000);
  } else {
    Video.playing = false;
    defer.resolve();
  }

  return defer.promise;
};
module.exports = Video;
