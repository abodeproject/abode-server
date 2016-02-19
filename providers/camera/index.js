'use strict';

var abode,
  config,
  routes,
  q = require('q'),
  fs = require('fs'),
  request = require('request');

var logger = require('log4js'),
  log = logger.getLogger('camera');

var Camera = function () {
  var defer = q.defer();
  abode = require('../../abode');
  routes = require('./routes');

  abode.web.server.use('/api/cameras', routes);

  abode.config.camera = abode.config.camera || {};
  abode.config.camera.enabled = (abode.config.camera.enabled === false) ? false : true;
  abode.config.camera.interval = abode.config.camera.interval || 60;
  abode.config.camera.image_path = abode.config.camera.image_path || 'public/cameras';
  config = abode.config.camera;

  fs.stat(config.image_path, function (err) {
    if (err) {

      log.info('Creating image store:', config.image_path);

      fs.mkdir(config.image_path, function (err) {
        if (err) {
          Camera.can_write = false;
          log.error('Failed to create image store:', config.image_path);
        } else {
          Camera.can_write = true;
        }
      });

    } else {
      Camera.can_write = true;
    }

  });

  abode.events.on('ABODE_STARTED', function () {
    if (config.enabled === false) {
      log.warn('Not starting Camera.  Not enabled');
      return;
    }

    log.info('Starting Camera provider');
    setInterval(Camera.load, (1000 * config.interval));
    Camera.load();
  });

  defer.resolve();

  return defer.promise;
};

Camera.snap_shot = function (device) {
  var defer = q.defer();

  log.debug('Getting snapshot for camera: %s', device.name);

  defer.resolve();


  return defer.promise;
};

Camera.get_status = function (device) {
  var auth,
    defer = q.defer();

  if (!Camera.can_write) {
    log.error('No writable image store found:', device.name);
    defer.reject({'status': 'failed', 'message': 'No writable image store found'});
    return defer.promise;
  }

  log.debug('Getting snapshot for camera: %s', device.name);

  if (device.config.username) {
    auth = {
      auth: {
        user: device.config.username,
        pass: device.config.password,
        'sendImmediately': false
      }
    };
  }

  try {
    request.get(device.config.image_url, auth)
      .on('response', function(response) {

        if (response.statusCode === 401) {
          log.error('Failed to authorize with camera:', device.name);
          defer.reject({'status': 'failed', 'message': 'Failed to authorize with camera:' + device.name});
          return;
        }

        if (response.statusCode !== 200) {
          log.error('Failed to request camera snapshot:', device.name);
          defer.reject({'status': 'failed', 'message': 'Failed to request with camera snapshot:' + device.name});
          return;
        }
        device._image = config.image_path + '/' + device._id + '.jpg';
        device._save().then(function () {
          defer.resolve();
        }, function (err) {
          defer.reject(err);
        });
      })
      .on('error', function (err) {
        console.log(err);
        defer.reject();
      })
      .pipe(fs.createWriteStream(config.image_path + '/' + device._id + '.jpg'));
  } catch (e) {
    log.error('Connection died getting image:', e);
    defer.reject();
  }

  return defer.promise;
};

Camera.load = function () {

  var devices = abode.devices.get_by_provider('camera');

  if (devices.length === 0) {
    log.info('No Camera Devices to Query');
  }

  devices.forEach(function (device) {
    if (device.active !== true) {
      return;
    }
    Camera.get_status(device).then(function (data) {
      if (data.update) {

        device.set_state(data.update);

      }
    });
  });

};


// Return all keys
Camera.list = function () { return abode.devices.get_by_provider('camera'); };

//Return a hash of keys with the key as the keys
Camera.get_by_name = function (id) {
  var cameras = this.list();
  var camera = cameras.filter(function (item) { return (item.name === id); });

  if (camera.length === 0) {
    return false;
  } else {
    return camera[0];
  }
  return;
};

//Return a hash of keys with the id as the keys
Camera.get_by_id = function (id) {
  var cameras = this.list();
  var camera = cameras.filter(function (item) { return (String(item._id) === String(id)); });

  if (camera.length === 0) {
    return false;
  } else {
    return camera[0];
  }
};

Camera.get = function (id) {
  return Camera.get_by_id(id) || Camera.get_by_name(id);
};
module.exports = Camera;
