'use strict';

var radiothermostat = require('../radiothermostat'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': radiothermostat.enabled,
    'current': radiothermostat.current,
    'forecast': radiothermostat.forecast,
  });

});

router.post('/enable', function (req, res) {

  radiothermostat.enable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/disable', function (req, res) {

  radiothermostat.disable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

module.exports = router;
