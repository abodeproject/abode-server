'use strict';

var autoshades = require('../autoshades'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': autoshades.enabled,
    'processing': autoshades.working,
  });

});

router.post('/enable', function (req, res) {

  autoshades.enable().then(function (response) {
    res.send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/disable', function (req, res) {

  autoshades.disable().then(function (response) {
    res.send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

module.exports = router;
