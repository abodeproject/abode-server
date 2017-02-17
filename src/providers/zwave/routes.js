'use strict';

var zwave = require('../zwave'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': zwave.config.enabled,
    'connected': zwave.connected,
    'queue': zwave.queue.length,
  });

});

router.post('/enable', function (req, res) {

  zwave.enable().then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/disable', function (req, res) {

  zwave.disable().then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

module.exports = router;
