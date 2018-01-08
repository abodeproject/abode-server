'use strict';

var arlo = require('../arlo'),
  request = require('request'),
  router = require('express').Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': arlo.enabled,
    'status': arlo.status,
    'polling': arlo.polling,
    'last_polled': arlo.last_polled,
    'can_write': arlo.can_write,
    'cameras': arlo.cameras,
    'basestations': arlo.basestations
  });

});

router.post('/enable', function (req, res) {
  arlo.enable(req.body.user, req.body.password)
    .then(function (result) {
      res.send(result);
    })
    .fail(function (err) {
      res.status(400).send(err);
    });
});

router.post('/disable', function (req, res) {
  arlo.enable()
    .then(function (result) {
      res.send(result);
    })
    .fail(function (err) {
      res.status(400).send(err);
    });
});

router.post('/refresh', function (req, res) {
  arlo.load()
    .then(function (result) {
      res.send(result);
    })
    .fail(function (err) {
      res.status(400).send(err);
    });
});

module.exports = router;
