'use strict';

var abode,
  routes,
  q = require('q'),
  spawn = require('child_process').spawn,
  exec = require('child_process').exec;

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

  var play = function () {
    Video.stdout = '';
    Video.stderr = '';

    Video.url = config.url;
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

    Video.timer = setTimeout(Video.stop, config.duration * 1000);
    log.info('Video timer set for %s seconds', config.duration);
  };

  //If trying to play the same video, extend the timeout
  if (Video.playing && Video.url === config.url) {
    clearTimeout(Video.timer);
    Video.timer = setTimeout(Video.stop, config.duration * 1000);

    defer.resolve({'status': 'success', 'message': 'Video duration extended'});
    return defer.promise;
  }

  //If video is playing and url is different, stop the current one
  if (Video.playing && Video.url !== config.url) {
    clearTimeout(Video.timer);

    Video.stop();

    //Delay playing to account for cleanup
    //Could probably generate a event to trigger off instead but i'm feeling lazy
    setTimeout(play, 1000);

    return defer.promise;
  }

  //If nothing is playing start playing
  play();

  return defer.promise;
};

Video.stop = function () {
  var defer = q.defer();

  log.info('Stopping Video:', Video.spawn.pid);

  Video.spawn.kill('SIGKILL');
  exec('pkill ' + abode.config.video.player);

  defer.resolve();

  return defer.promise;
};
module.exports = Video;
