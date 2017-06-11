'use strict';

var mqtt = require('../mqtt'),
  abode = require('../../abode'),
  triggers = require('../../triggers'),
  web = require('../../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': mqtt.enabled
  });

});

router.post('/enable', function (req, res) {

  mqtt.enable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/disable', function (req, res) {

  mqtt.disable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

module.exports = router;
