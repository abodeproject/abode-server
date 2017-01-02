'use strict';

var rooms = require('../rooms'),
  devices = require('../devices'),
  scenes = require('../scenes'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {
  res.send(rooms.list());
  res.end();
});

router.post('/', web.isUnlocked, web.isJson, function (req, res) {
  rooms.create(req.body).then(function (room) {
    res.status(200).send(room);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id', function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  res.send(room);
  res.end();
});

router.get('/:id/scenes', function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  res.send(room.get_scenes());

});

router.post('/:id/scenes', web.isUnlocked, web.isJson, function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  var scene = scenes.get(req.body._id || req.body.name);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Scene not found'});
    return;
  }

  room.add_scene(scene).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id/scenes/:sceneid', function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  var scenes = room.get_scenes().filter(function(scene) {
    return (String(scene._id) === String(req.params.sceneid));
  });

  if (scenes.length > 0) {
    res.send(scenes[0]);
  } else {
    res.status(404).send({'status': 'failed', 'message': 'Scene not found'});
  }
});

router.delete('/:id/scenes/:sceneid', web.isUnlocked, function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  var scene = scenes.get(req.params.sceneid);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Scene not found'});
    return;
  }

  room.remove_scene(scene).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id/devices', function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  res.send(room.get_devices());

});

router.post('/:id/devices', web.isUnlocked, web.isJson, function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  var device = devices.get(req.body._id || req.body.name);
  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
    return;
  }

  room.add_device(device).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id/devices/:deviceid', function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  var devices = room.get_devices().filter(function(device) {
    return (String(device._id) === String(req.params.deviceid));
  });

  if (devices.length > 0) {
    res.send(devices[0]);
  } else {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
  }
});

router.delete('/:id/devices/:deviceid', web.isUnlocked, function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  var device = devices.get(req.params.deviceid);
  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
    return;
  }

  room.remove_device(device).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.put('/:id', web.isUnlocked, web.isJson, function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  delete req.body.devices;

  Object.keys(req.body).forEach(function (key) {
    room[key] = req.body[key];
  });

  room._save().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.delete('/:id', web.isUnlocked, function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  room.delete().then(function () {
    res.send();
    res.end();
  }, function (err) {
    res.send(err);
    res.end();
  });
});

var filters = {
  'lights': 'get_lights',
  'appliance': 'get_appliances',
  'conditioner': 'get_conditioners',
  'motion_sensors': 'get_motion_sensors',
  'temperature_sensors': 'get_temperature_sensors',
  'humidity_sensors': 'get_humidity_sensors',
  'moisture_sensors': 'get_moisture_sensors',
  'light_sensors': 'get_light_sensors',
  'window': 'get_windows',
  'door': 'get_doors',
  'shade': 'get_shades',
  'scene': 'get_scenes',
  'fans': 'get_fans',
};

Object.keys(filters).forEach(function (filter) {

  router.get('/:id/' + filter, function (req, res) {
    var room = rooms.get(req.params.id);
    if (!room) {
      res.status(404).send({'status': 'failed', 'message': 'Room not found'});
      return;
    }

    res.send(room[filters[filter]]());
  });

});

var actions = [
  'on',
  'off',
  'open',
  'close',
  'set_level',
  'set_mode',
  'set_humidity',
  'set_point',
];

var statuses = [
  'get_temperature',
  'get_humidity',
  'get_lumacity',
  'get_set_point',
  'motion_on',
  'motion_off',
  'doors_open',
  'doors_closed',
  'windows_open',
  'windows_closed',
  'shades_open',
  'shades_closed',
  'conditioning_on',
  'conditioning_off',
  'lights_on',
  'lights_off',
  'appliances_on',
  'appliances_off',
  'fans_on',
  'fans_off',
  'scenes_on',
  'scenes_off',
];

var ages = [
  'light_on_age',
  'light_off_age',
  'motion_on_age',
  'motion_off_age',
  'window_open_age',
  'window_close_age',
  'door_open_age',
  'door_close_age',
  'fan_on_age',
  'fan_off_age',
  'conditioner_on_age',
  'conditioner_off_age',
];

actions.forEach(function (action) {
  router.post('/:id/' + action, web.isUnlocked, function (req, res) {
    var room = rooms.get(req.params.id);
    if (!room) {
      res.status(404).send({'status': 'failed', 'message': 'Record not found'});
      return;
    }

    var args = req.body || [];
    var response = room[action].apply(room, args);

    if (response.then) {
      response.then(function (result) {
        res.send({'status': 'success', 'response': result, 'room': room});
      }, function (err) {
        res.status(400).send(err || {'status': 'failed', 'message': 'Failed to send action'});
      });
    } else {
      res.send({'status': 'success', 'response': response});
    }
  });

});

statuses.forEach(function (status) {

  router.get('/:id/' + status, function (req, res) {
    var room = rooms.get(req.params.id);
    if (!room) {
      res.status(404).send({'status': 'failed', 'message': 'Room not found'});
      return;
    }

    room[status]().then(function (response) {
      res.send({'status': 'success', 'response': response});
    }, function (err) {
      res.status(400).send(err || {'status': 'failed', 'message': 'Failed to run status'});
    });
  });

});

ages.forEach(function (age) {
  router.get('/:id/' + age, function (req, res) {
    var room = rooms.get(req.params.id);
    if (!room) {
      res.status(404).send({'status': 'failed', 'message': 'Room not found'});
      return;
    }

    room[age]().then(function (response) {
      res.send({'status': 'success', 'response': response});
    }, function (err) {
      res.status(400).send(err || {'status': 'failed', 'message': 'Failed to run age'});
    });

  });

});

router.post('/:id/status', web.isUnlocked, function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  var response = room.status(false);

  if (response.then) {
    response.then(function (result) {
      res.send({'status': 'success', 'response': result, 'room': room});
    }, function (err) {
      res.status(400).send(err || {'status': 'failed', 'message': 'Failed to send action'});
    });
  } else {
    res.send({'status': 'success', 'response': response});
  }
});

router.get('/:id/status', function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  var response = room.status(true);

  if (response.then) {
    response.then(function (result) {
      res.send({'status': 'success', 'response': result, 'room': room});
    }, function (err) {
      res.status(400).send(err || {'status': 'failed', 'message': 'Failed to send action'});
    });
  } else {
    res.send({'status': 'success', 'response': response});
  }
});

module.exports = router;
