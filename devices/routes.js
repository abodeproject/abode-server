'use strict';

var abode = require('../abode'),
  devices = abode.devices,
  rooms = abode.rooms,
  web = require('../web'),
  express = require('express'),
  logger = require('log4js'),
  log = logger.getLogger('devices'),
  router = express.Router();

router.get('/logs', function (req, res) {
  var opts = {
    skip: req.params.skip || 0,
    limit: req.params.limit || 25,
    sort:{
        created: -1
    }
  };

  devices.logs.find({}, undefined, opts, function (err, logs) {
    if (err) {
      res.status(400).send(err);
      return;
    }
    res.send(logs);
  });
});

router.get('/', function (req, res) {
  res.send(devices.list().map(function (d) {
    return {'_id': d._id, 'name': d.name, '_rooms': d._rooms, 'capabilities': d.capabilities};
  }));
  res.end();
});


devices.capabilities.forEach(function (capability) {
  router.get('/' + capability + 's', function (req, res) {
    res.send(devices.by_capability(capability));
  });

});

router.post('/', web.isJson, function (req, res) {
  devices.create(req.body).then(function () {
    res.status(201).send({'status': 'success'});
  }, function (err) {
    log.error(err.message || err);
    res.status(422).send(err);
  });
});

router.get('/:id', function (req, res) {
  var device = devices.get(req.params.id);
  if (!device) {
    log.debug('Record not found: ', req.params.id);
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  log.debug('Record found: ', req.params.id);
  res.send(device);

  res.end();
});

router.get('/:id/logs', function (req, res) {
  var device = devices.get(req.params.id);
  if (!device) {
    log.debug('Record not found: ', req.params.id);
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  device.logs().then(function (logs) {
    res.send(logs);
  }, function (err) {
    console.log('here2');
    res.status(400).send(err);
  });
});

router.get('/:id/rooms', function (req, res) {
  var device = devices.get(req.params.id);
  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  res.send(device.get_rooms());

});

router.post('/:id/rooms', web.isJson, function (req, res) {
  var device = devices.get(req.params.id);
  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  var room = rooms.get(req.body._id || req.body.name);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  device.add_room(room).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id/rooms/:roomid', function (req, res) {
  var device = devices.get(req.params.id);
  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
    return;
  }

  var rooms = device.get_rooms().filter(function(room) {
    return (String(room._id) === String(req.params.roomid));
  });

  if (rooms.length > 0) {
    res.send(rooms[0]);
  } else {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
  }
});

router.delete('/:id/rooms/:roomid', function (req, res) {
  var device = devices.get(req.params.id);
  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  var room = rooms.get(req.params.roomid);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  device.remove_room(room).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.put('/:id', web.isJson, function (req, res) {
  var device = devices.get(req.params.id);
  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  delete req.body.rooms;

  //That way it will trigger events on changes
  device.set_state(req.body).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.delete('/:id', function (req, res) {
  var device = devices.get(req.params.id);
  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  device.delete().then(function () {
    res.send({'status': 'success'});
  }, function (err) {
    res.status(400).send(err);
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
  'status',
  'play',
];

var statuses = [
  'is_on',
  'is_off',
  'is_open',
  'is_closed',
  'level',
  'temperature',
  'mode',
  'humidity',
  'lumens',
  'motion',
  'status',
  'on_time', 'open_time',
  'off_time', 'closed_time',
  'weather',
  'forecast',
  'moon',
  'alerts',
];
actions.forEach(function (action) {
  router.post('/:id/' + action, function (req, res) {
    var device = devices.get(req.params.id);
    if (!device) {
      res.status(404).send({'status': 'failed', 'message': 'Record not found'});
      return;
    }

    var args = req.body || [];
    var response = device[action].apply(device, args);

    if (response.then) {
      response.then(function (result) {
        res.send({'status': 'success', 'response': result, 'device': device});
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
    var device = devices.get(req.params.id);
    if (!device) {
      res.status(404).send({'status': 'failed', 'message': 'Record not found'});
      return;
    }

    var args = req.body || [];
    var response = device[status].apply(device, args);
    if (response.then) {
      response.then(function (result) {
        res.send({'status': 'success', 'response': result});
      }, function (err) {
        res.status(400).send(err || {'status': 'failed', 'message': 'Failed to send status'});
      });
    } else {
      res.send({'status': 'success', 'response': response});
    }
  });

});

module.exports = router;
