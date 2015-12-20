'use strict';

var rooms = require('../rooms'),
  devices = require('../devices'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {
  res.send(rooms.list());
  res.end();
});

router.post('/', web.isJson, function (req, res) {
  rooms.create(req.body).then(function (room) {
    console.log('here2');
    res.status(201).send(room);
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

router.get('/:id/devices', function (req, res) {
  var room = rooms.get(req.params.id);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  res.send(room.get_devices());

});

router.post('/:id/devices', web.isJson, function (req, res) {
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

router.delete('/:id/devices/:deviceid', function (req, res) {
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

router.put('/:id', web.isJson, function (req, res) {
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

router.delete('/:id', function (req, res) {
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
  'get_temperature',
  'get_humidity',
  'get_lumacity',
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
  'scenes_on',
  'scenes_off',
];

actions.forEach(function (action) {

  router.get('/:id/' + action, function (req, res) {
    var room = rooms.get(req.params.id);
    if (!room) {
      res.status(404).send({'status': 'failed', 'message': 'Room not found'});
      return;
    }

    room[action]().then(function (response) {
      console.log(response);
      res.send({'status': 'success', 'response': response});
    }, function (err) {
      res.status(400).send(err || {'status': 'failed', 'message': 'Failed to run action'});
    });
  });

});

module.exports = router;
