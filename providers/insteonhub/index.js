'use strict';

var q = require('q');
var routes;
var fs = require('fs');
var abode = require('../../abode');
var request = require('request');
var logger = require('log4js'),
  log = logger.getLogger('insteonhub');

var InsteonHub = function () {
  var defer = q.defer();

  routes = require('./routes');

  abode.web.server.use('/api/insteonhub', routes);

  //Set our configuration options
  InsteonHub.config = abode.config.insteonhub || {};
  InsteonHub.config.base_url = abode.config.insteonhub.base_url || 'https://connect.insteon.com/api/v2';
  InsteonHub.config.auth_url = abode.config.insteonhub.auth_url || 'http://localhost:8080/api/insteonhub/authorize';

  InsteonHub._token = {};
  InsteonHub._devices = [];
  InsteonHub._scenes = [];

  fs.readFile('/dev/shm/insteonhub.json', function (err, data) {
    if (err) {
      log.info('No authorization token cache found');
      return;
    }

    var cache = JSON.parse(data);
    InsteonHub._token = cache.token;
    InsteonHub._devices = cache.devices || [];
    InsteonHub._scenes = cache.scenes || [];
    InsteonHub._rooms = cache.rooms || [];

    log.info('Loaded authorization token cache');
  });

  if (InsteonHub.config.enabled === true) {


    defer.resolve();

  } else {
    log.warn('Not starting InsteonHub.  Not enabled');
    defer.resolve();
  }

  return defer.promise;
};

InsteonHub.call = function (config, authorize) {
  var url,
    headers,
    options,
    defer = q.defer();

  authorize = (authorize === undefined) ? true : false;

  var attempt = function () {
    config = config || {};
    config.method = config.method || 'GET';

    url = InsteonHub.config.base_url;
    url += config.url;

    headers = {
      'Content-Type': 'application/json',
      'Authentication': 'APIKey ' + InsteonHub.config.api_key,
      'Authorization': InsteonHub._token.type + ' ' + InsteonHub._token.access,
    };

    config.headers = config.headers || headers;

    options = {
      'method': config.method,
      'url': url,
      'headers': config.headers,
      'body': config.body,
      'json': true,
    };

    request(options, function (err, response, body) {
      if (err) {
        defer.reject(err);
        return;
      }

      defer.resolve({'response': response, 'body': body});
    });
  };

  if (authorize && !InsteonHub.token.access) {
    InsteonHub.token().then(attempt, function (err) {
      defer.reject(err);
    });
  } else {
    attempt();
  }

  return defer.promise;
};

InsteonHub.token = function () {
  var body,
    defer = q.defer();

  if (InsteonHub._token && InsteonHub._token.refresh) {
    body = {
      'refresh_token': InsteonHub._token.refresh,
      'client_id': InsteonHub.config.api_key,
      'grant_type': 'refresh_token'
    };
  } else {
    body = {
      'username': InsteonHub.config.user,
      'password': InsteonHub.config.password,
      'client_id': InsteonHub.config.api_key,
      'grant_type': 'password'
    };
  }

  InsteonHub.call({
    'url': '/oauth2/token',
    'method': 'POST',
    'headers': {'Content-Type': 'application/json'},
    'json': true,
    'body': {
      'username': InsteonHub.config.user,
      'password': InsteonHub.config.password,
      'client_id': InsteonHub.config.api_key,
      'grant_type': 'password'
    }
  }, false).then(function (response) {
    InsteonHub._token = {
      'access': response.body.access_token,
      'refresh': response.body.refresh_token,
      'type': response.body.token_type,
      'expires': response.body.expires_in,
    };

    InsteonHub.write_cache().then(function () {
      defer.resolve(InsteonHub._token);
    }, function () {
      defer.reject();
    });

    setTimeout(function () {
      InsteonHub._token.access = undefined;
    }, response.body.expires_in * 60 * 1000);

  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

InsteonHub.write_cache = function () {
  var data,
    defer = q.defer();

  data = {
    'token': InsteonHub._token,
    'devices': InsteonHub._devices,
    'scenes': InsteonHub._scenes,
    'rooms': InsteonHub._rooms,
  };

  fs.writeFile('/dev/shm/insteonhub.json', JSON.stringify(data), 'utf8', function (err) {
    if (err) {
      defer.reject(err);
      return;
    }
    defer.resolve();
  });

  return defer.promise;
};

InsteonHub.devices = function () { return InsteonHub._devices; };
InsteonHub.scenes = function () { return InsteonHub._scenes; };
InsteonHub.rooms = function () { return InsteonHub._rooms; };

InsteonHub.refresh = function () {
  var defer = q.defer();

  var fail = function (err) {
    defer.reject(err);
  };

  var rooms = function () {
    log.debug('Getting InsteonHub Rooms');
    InsteonHub.call({'url': '/rooms'})
    .then(function (response) {
      InsteonHub._rooms = response.body.RoomList;
      InsteonHub.write_cache();
      defer.resolve();
    }, fail);
  };

  var scenes = function () {
    log.debug('Getting InsteonHub Scenes');
    InsteonHub.call({'url': '/scenes'})
    .then(function (response) {
      InsteonHub._scenes = response.body.SceneList;
      rooms();
    }, fail);
  };

  var devices = function () {
    log.debug('Getting InsteonHub Devices');
    InsteonHub.call({'url': '/devices'})
    .then(function (response) {
      InsteonHub._devices = response.body.DeviceList;
      scenes();
    }, fail);
  };

  devices();

  return defer.promise;
};

InsteonHub.on = function (device) {
  var defer = q.defer(),
    command = {
      'command': 'on'
    };

  if (device.config.type === 'device') {
    command.device_id = device.config.DeviceID;
  } else if (device.config.type === 'scene') {
    command.scene_id = device.config.SceneID;
  } else if (device.config.type === 'room') {
    command.room_id = device.config.RoomID;
  }
  InsteonHub.send_command(command).then(function (details) {
    var update = {};

    if (details && details.level !== undefined) {
      update._level = details.level;
      update._on = (details.level > 0) ? true : false;
    }

    if (device.config.type !== 'device') {
      update = {'_on': false, '_level': 0};
    }
    defer.resolve({'update': update});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

InsteonHub.off = function (device) {
  var defer = q.defer(),
    command = {
      'command': 'off'
    };

  if (device.config.type === 'device') {
    command.device_id = device.config.DeviceID;
  } else if (device.config.type === 'scene') {
    command.scene_id = device.config.SceneID;
  } else if (device.config.type === 'room') {
    command.room_id = device.config.RoomID;
  }
  InsteonHub.send_command(command).then(function (details) {
    var update = {};
    if (details && details.level !== undefined) {
      update._level = details.level;
      update._on = (details.level > 0) ? true : false;
    }
    if (device.config.type !== 'device') {
      update = {'_on': false, '_level': 0};
    }
    defer.resolve({'update': update});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;

};

InsteonHub.set_level = function (device, level) {
  var defer = q.defer(),
    command = {
      'command': 'on',
      'level': level
    };

  if (device.config.type === 'device') {
    command.device_id = device.config.DeviceID;
  } else if (device.config.type === 'scene') {
    command.scene_id = device.config.SceneID;
  } else if (device.config.type === 'room') {
    command.room_id = device.config.RoomID;
  }
  InsteonHub.send_command(command).then(function () {
    var update = {};
    if (level === 0) {
      update._on = false;
      update._level = 0;
    } else {
      update._on = true;
      update._level = level;
    }
    if (device.config.type !== 'device') {
      update = {'_on': false, '_level': 0};
    }
    defer.resolve({'update': update});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;

};

InsteonHub.get_status = function (device) {
  var defer = q.defer(),
    command = {
      'command': 'get_status',
    };

  if (device.config.type === 'device') {
    command.device_id = device.config.DeviceID;
  } else if (device.config.type === 'scene') {
    command.scene_id = device.config.SceneID;
  } else if (device.config.type === 'room') {
    command.room_id = device.config.RoomID;
  }
  InsteonHub.send_command(command).then(function (details) {
    var update = {};
    if (details.level !== undefined) {
      update._level = details.level;
      update._on = (details.level > 0) ? true : false;
    }
    if (device.config.type !== 'device') {
      update = {'_on': false, '_level': 0};
    }
    defer.resolve({'update': update});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;

};

InsteonHub.details = function (type, obj) {
  var url,
    name,
    defer = q.defer();

  switch (type) {
    case 'device':
      name = obj.DeviceName;
      url = '/devices/' + obj.DeviceID;
      break;
    case 'scene':
      name = obj.SceneName;
      url = '/scenes/' + obj.SceneID;
      break;
    case 'room':
      name = obj.RoomName;
      url = '/rooms/' + obj.RoomID;
      break;
  }

  log.debug('Getting ' + type + ' details:', name, url);
  InsteonHub.call({'url': url}).then(function (response) {
    defer.resolve(response.body);
  }, function (err) {
    defer.resolve(err);
  });

  return defer.promise;
};

InsteonHub.send_command = function (command) {
  var defer = q.defer();

  log.debug('Sending Command:', command);

  InsteonHub.call({'url': '/commands/', 'json': true, 'body': command, 'method': 'POST'}).then(function (response) {
    var status_timer;
    var command_id = response.body.id;

    if (response.response.statusCode === 202) {
      status_timer = setInterval(function () {
        InsteonHub.command_status(command_id).then(function (status) {

          if (status.status !== 'pending') {
            clearTimeout(status_timer);
            defer.resolve(status.response);
          }

        }, function (err) {
          clearTimeout(status_timer);
          log.error(err);
          defer.reject(err);
        });
      }, 1000);
    } else {
      defer.resolve(response.body);
    }

  }, function (err) {
    defer.resolve(err);
  });

  return defer.promise;
};

InsteonHub.command_status = function (command) {
  var defer = q.defer();

  log.debug('Getting command status:', command);

  InsteonHub.call({'url': '/commands/' + command, 'json': true}).then(function (response) {
    defer.resolve(response.body);
  }, function (err) {
    defer.resolve(err);
  });

  return defer.promise;
};

InsteonHub.get_by_id = function (type, id) {
  var matches;

  if (type === 'device') {
    matches = InsteonHub._devices.filter(function (item) { return (String(item.DeviceID) === String(id)); });
  } else if (type === 'scene') {
    matches = InsteonHub._scenes.filter(function (item) { return (String(item.SceneID) === String(id)); });
  } else if (type === 'room') {
    matches = InsteonHub._scenes.filter(function (item) { return (String(item.RoomID) === String(id)); });
  }

  if (matches.length === 0) {
    return false;
  } else {
    return matches[0];
  }

};

InsteonHub.get_by_name = function (type, id) {
  var matches;

  if (type === 'device') {
    matches = InsteonHub._devices.filter(function (item) { return (String(item.DeviceName) === String(id)); });
  } else if (type === 'scene') {
    matches = InsteonHub._scenes.filter(function (item) { return (String(item.SceneName) === String(id)); });
  } else if (type === 'room') {
    matches = InsteonHub._rooms.filter(function (item) { return (String(item.RoomName) === String(id)); });
  }

  if (matches.length === 0) {
    return false;
  } else {
    return matches[0];
  }
};

InsteonHub.get_device = function (id) {
  return InsteonHub.get_by_id('device', id) || InsteonHub.get_by_name('device', id);
};

InsteonHub.get_scene = function (id) {
  return InsteonHub.get_by_id('scene', id) || InsteonHub.get_by_name('scene', id);
};

InsteonHub.get_room = function (id) {
  return InsteonHub.get_by_id('room', id) || InsteonHub.get_by_name('room', id);
};

module.exports = InsteonHub;
