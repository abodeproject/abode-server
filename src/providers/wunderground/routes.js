'use strict';

var wunderground = require('../wunderground'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': wunderground.enabled,
    'current': wunderground.current,
    'forecast': wunderground.forecast,
  });

});

router.post('/enable', function (req, res) {

  wunderground.enable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/disable', function (req, res) {

  wunderground.disable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});


router.get('/current', function (req, res) {

  res.send(wunderground.current);

});


router.get('/forecast', function (req, res) {

  res.send(wunderground.forecast);

});

module.exports = router;
