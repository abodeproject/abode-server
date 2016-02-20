'use strict';

var insteonhub = require('../insteonhub'),
  abode = require('../../abode'),
  express = require('express'),
  router = express.Router();

router.get('/auth_url', function (req, res) {

  var url = insteonhub.config.base_url + '/oauth2/auth';
  url += '?client_id=' + insteonhub.config.api_key;
  url += '&response_type=code';
  url += '&redirect_uri=http://localhost:8080/api/insteonhub/authorized';

  res.send({'url': url});

});

router.get('/authorize', function (req, res) {


  if (req.query.code) {
    insteonhub.config.api_code = req.query.code;

    abode.update_config(insteonhub.config, 'insteonhub');

    abode.write_config().then(function (response) {
      res.status(200).send(response);
    }, function (err) {
      res.status(400).send(err);
    });

  } else {
    res.status(400).send({'status': 'failed', 'message': 'Invalid api code'});
  }

});

router.get('/token', function (req, res) {
  insteonhub.token().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.get('/devices', function (req, res) {

  res.status(200).send(insteonhub.devices());

});

router.get('/devices/:id', function (req, res) {

  var device = insteonhub.get_device(req.params.id);

  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
    return;
  }

  insteonhub.details('device', device).then(function (details) {
    res.status(200).send(details);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:id/on', function (req, res) {

  var device = insteonhub.get_device(req.params.id);

  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
    return;
  }

  insteonhub.send_command({
    'command': 'on',
    'device_id': device.DeviceID
  }).then(function (details) {
    res.status(200).send(details);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:id/beep', function (req, res) {

  var device = insteonhub.get_device(req.params.id);

  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
    return;
  }

  insteonhub.send_command({
    'command': 'beep',
    'device_id': device.DeviceID
  }).then(function (details) {
    res.status(200).send(details);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:id/off', function (req, res) {

  var device = insteonhub.get_device(req.params.id);

  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
    return;
  }

  insteonhub.send_command({
    'command': 'off',
    'device_id': device.DeviceID
  }).then(function (details) {
    res.status(200).send(details);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:id/status', function (req, res) {

  var device = insteonhub.get_device(req.params.id);

  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
    return;
  }

  insteonhub.send_command({
    'command': 'get_status',
    'device_id': device.DeviceID
  }).then(function (details) {
    res.status(200).send(details);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:id/level/:level', function (req, res) {

  var device = insteonhub.get_device(req.params.id);

  if (!device) {
    res.status(404).send({'status': 'failed', 'message': 'Device not found'});
    return;
  }

  insteonhub.send_command({
    'command': 'on',
    'level': parseInt(req.params.level, 10),
    'device_id': device.DeviceID
  }).then(function (details) {
    res.status(200).send(details);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/scenes', function (req, res) {

  res.status(200).send(insteonhub.scenes());

});

router.get('/scenes/:id', function (req, res) {

  var scene = insteonhub.get_scene(req.params.id);

  if (!scene) {
    res.status(404).send({'status': 'failed', 'message': 'Scene not found'});
    return;
  }

  insteonhub.details('scene', scene).then(function (details) {
    res.status(200).send(details);
  }, function (err) {
    res.status(400).send(err);
  });

});


router.post('/refresh', function (req, res) {

  insteonhub.refresh().then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(400).send(err);
  });

});


module.exports = router;
