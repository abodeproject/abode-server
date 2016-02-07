'use strict';

var insteon = require('../insteon'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send();

});

router.post('/linking/start', function (req, res) {

  var config = {};
  config.type = req.body.type || 'either';
  config.auto_add = (req.body.auto_add !== undefined) ? req.body.auto_add : true;

  insteon.start_linking(config.type, config.auto_add).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/linking/status', function (req, res) {

  res.send({'linking': insteon.linking});

});

router.post('/linking/stop', function (req, res) {

  insteon.stop_linking().then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/linking/clear', function (req, res) {

  insteon.last_device = {};
  res.send({'status': 'success'});

});

router.get('/linking/last', function (req, res) {

  if (insteon.last_device && insteon.last_device.config) {
    res.send(insteon.last_device.config);
  } else {
    res.status(404).status({'status': 'failed'});
  }

});

module.exports = router;
