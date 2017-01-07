'use strict';

var scenes = require('../scenes'),
  rooms = require('../rooms'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {
  res.send(scenes.list());
  res.end();
});

router.post('/', web.isUnlocked, web.isJson, function (req, res) {

  delete req.body.rooms;
  delete req.body.devices;

  scenes.create(req.body).then(function (scene) {
    res.status(200).send(scene);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id', function (req, res) {
  var scene = scenes.get(req.params.id);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  res.send(scene);
  res.end();
});

router.put('/:id', web.isUnlocked, web.isJson, function (req, res) {
  var scene = scenes.get(req.params.id);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  delete req.body._rooms;

  Object.keys(req.body).forEach(function (key) {
    scene[key] = req.body[key];
  });

  scene._save().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.delete('/:id', web.isUnlocked, function (req, res) {
  var scene = scenes.get(req.params.id);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  scene.delete().then(function () {
    res.send();
    res.end();
  }, function (err) {
    res.send(err);
    res.end();
  });
});

router.get('/:id/rooms', function (req, res) {
  var scene = scenes.get(req.params.id);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  res.send(scene.get_rooms());

});

router.post('/:id/rooms', web.isUnlocked, web.isJson, function (req, res) {
  var scene = scenes.get(req.params.id);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Scene not found'});
    return;
  }

  var room = rooms.get(req.body._id || req.body.name);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  scene.add_room(room).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id/rooms/:roomid', function (req, res) {
  var scene = scenes.get(req.params.id);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Scene not found'});
    return;
  }

  var rooms = scene.get_rooms().filter(function(room) {
    return (String(room._id) === String(req.params.roomid));
  });

  if (rooms.length > 0) {
    res.send(rooms[0]);
  } else {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
  }
});

router.delete('/:id/rooms/:roomid', web.isUnlocked, function (req, res) {
  var scene = scenes.get(req.params.id);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Scene not found'});
    return;
  }

  var room = rooms.get(req.params.roomid);
  if (!room) {
    res.status(404).send({'status': 'failed', 'message': 'Room not found'});
    return;
  }

  scene.remove_room(room).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.post('/:id/on', web.isUnlocked, function (req, res) {
  var scene = scenes.get(req.params.id);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Scene not found'});
    return;
  }

  scene.start().then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(400).send(err);
  });
});

router.post('/:id/off', web.isUnlocked, function (req, res) {
  var scene = scenes.get(req.params.id);
  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Scene not found'});
    return;
  }

  scene.stop().then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(400).send(err);
  });
});

module.exports = router;
