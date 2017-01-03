'use strict';

var abode,
  routes,
  config,
  q = require('q'),
  fs = require('fs'),
  path = require('path'),
  exec = require('child_process').exec;

var logger = require('log4js'),
  log = logger.getLogger('display');

var Display = function () {
  var defer = q.defer();
  abode = require('../../abode');
  routes = require('./routes');

  abode.web.server.use('/api/display', routes);

  abode.config.display.interval = abode.config.display.interval || 5;
  abode.config.display.min_brightness = abode.config.display.min_brightness || 0;
  abode.config.display.min_brightness = parseInt(abode.config.display.min_brightness);
  abode.config.display.enabled = (abode.config.display.enabled === false) ? false : true;

  config = abode.config.display || {};
  Display.config = config;

  if (config.enabled === true  && process.env.DISPLAY) {
    log.info('Starting Display');

    Display.load().then(function () {
      Display.poller = setInterval(Display.load, 1000 * config.interval);
    }, function (err) {
      log.error('Display loader failed, not starting: ', err);
    });

    defer.resolve();
  } else {
    log.warn('Not starting Display.  Not enabled or no Display detected');
    defer.resolve();
  }

  return defer.promise;
};

Display.load = function () {
  var defer = q.defer();
  var base = '/sys/class/backlight';

  var failLoad = function (msg) {
    defer.reject(msg);
  };

  var get_monitor_power = function () {
    var mon_defer = q.defer();

    var process = function (error, stdout, stderr) {
      if (error) {
        log.error('Could not determine power:', stderr);
        mon_defer.resolve();
        return;
      }

      Display.power = (stdout.indexOf('Monitor is Off') === -1);
      log.debug('Monitor power:', Display.power);
      mon_defer.resolve();
    };

    exec('xset -q', process);

    return mon_defer.promise;
  };

  var get_maxbacklight = function () {
    var bl_defer = q.defer();
    var bl_path = path.join(base, Display.display, 'max_brightness');

    fs.readFile(bl_path, 'utf8', function (err, data) {
      if (err) {
        bl_defer.reject(err);
        return;
      }

      Display.max_brightness = parseInt(data, 10);
      log.debug('Max brightness:', Display.max_brightness);
      bl_defer.resolve(data);
    });

    return bl_defer.promise;
  };

  var get_currentbacklight = function () {
    var bl_defer = q.defer();
    var bl_path = path.join(base, Display.display, 'brightness');

    fs.readFile(bl_path, 'utf8', function (err, data) {
      if (err) {
        bl_defer.reject(err);
        return;
      }

      Display.raw_brightness = parseInt(data, 10);
      Display.brightness = parseInt(((Display.raw_brightness - Display.config.min_brightness) / (Display.max_brightness - Display.config.min_brightness)) * 100, 10);

      log.debug('Current brightness:', Display.brightness);
      bl_defer.resolve(data);
    });

    return bl_defer.promise;
  };

  var parseDisplay = function (display) {

    Display.display = display;
    log.debug('Parsing display:', Display.display);

    get_maxbacklight()
    .then(get_currentbacklight, failLoad)
    .then(function (response) {
      defer.resolve(response);
    }, function (err) {
      defer.reject(err);
    });
  };

  var findDisplay = function (displays) {

    if (displays.length === 0) {
      failLoad('Failed to find a display');
    } else if (displays.length === 1) {
      config.name = displays[0];
      parseDisplay(displays[0]);
    } else {
      if (config.display) {
        if (displays.indexOf(config.display) !== -1) {
          parseDisplay(displays.indexOf(config.display));
        } else {
          failLoad('Failed to find configured display: ', config.display);
        }
      } else {
        log.warn('Multiple displays found, using first: ', displays[0]);
        config.name = displays[0];
        parseDisplay(displays[0]);
      }
    }

  };


  get_monitor_power().then(function () {
    log.debug('Loading display properties');
    fs.readdir(base, function (err, displays) {
      if (!err) {
        findDisplay(displays);
      } else {
        failLoad('No backlight class found');
      }
    });
  }, function () {
    failLoad('No monitor detected');
  });

  return defer.promise;
};

Display.set_brightness = function (brightness) {
  var defer = q.defer();
  var cmd;

  if (isNaN(brightness)) {
    defer.reject({'status': 'failed', 'message': 'Invalid brightness specified'});
    return defer.promise;
  }

  //This should be a percent
  brightness = parseInt(brightness, 10);
  brightness = parseInt((brightness / 100) * (Display.max_brightness - Display.config.min_brightness), 10);
  brightness += Display.config.min_brightness;

  brightness = (brightness > Display.max_brightness) ? Display.max_brightness : brightness;
  brightness = (brightness < Display.config.min_brightness) ? Display.config.min_brightness : brightness;

  var b_handler = function (err, stdout, stderr) {
    if (err) {
      defer.resolve({'status': 'failed', 'message': stdout, 'error': stderr, 'cmd': cmd});
      return;
    }

    defer.resolve({'status': 'success'});
  };

  cmd = 'sudo -n ./set_brightness ' + Display.display + ' ' + brightness;
  exec(cmd, b_handler);

  return defer.promise;
};

Display.on = function () {
  var defer = q.defer();

  var b_handler = function (err, stdout, stderr) {
    if (err) {
      defer.resolve({'status': 'failed', 'message': stderr});
      return;
    }

    defer.resolve({'status': 'success'});
  };

  exec('xset -dpms', b_handler);

  return defer.promise;
};

Display.off = function () {
  var defer = q.defer();

  var b_handler = function (err, stdout, stderr) {
    if (err) {
      defer.resolve({'status': 'failed', 'message': stderr});
      return;
    }

    defer.resolve({'status': 'success'});
  };

  exec('xset +dpms && xset dpms force off', b_handler);

  return defer.promise;
};

module.exports = Display;
