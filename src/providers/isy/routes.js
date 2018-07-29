'use strict';

var isy = require('../isy'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': isy.enabled,
    'connected': isy.connected,
    'queue': isy.queue.length,
    'devices': isy.devices,
    'folders': isy.folders,
    'groups': isy.groups
  });

});

router.post('/enable', function (req, res) {

  isy.start().then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/disable', function (req, res) {

  isy.stop().then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.get('/devices/:id', function (req, res) {

  var device = isy.IsyDevice.find(req.params.id);
  if (device) {
    res.send(device);
  } else {
    res.status(404).send();
  }

});

router.post('/devices/:device/on', function (req, res) {

  isy.on({'address': req.params.device}).then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/off', function (req, res) {

  isy.off({'address': req.params.device}).then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/set_level/:level', function (req, res) {

  isy.set_level({'address': req.params.device}, req.params.level).then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/status', function (req, res) {

  isy.get_status({'address': req.params.device}).then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.get('/devices', function (req, res) {

  res.send(isy.devices);

});

router.get('/folders', function (req, res) {

  res.send(isy.folders);

});

router.get('/groups', function (req, res) {

  res.send(isy.groups);

});

router.post('/get_nodes', function (req, res) {

  isy.get_nodes()
    .then(function () {
      res.send({
        'devices': isy.devices,
        'groups': isy.groups,
        'folders': isy.folders
      });
    })
    .fail(function (err) {
      res.status(400).send(err);
    });

});

module.exports = router;
