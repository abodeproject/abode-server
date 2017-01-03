'use strict';

var wunderground = require('../wunderground'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'current': wunderground.current,
    'forecast': wunderground.forecast,
  });

});


router.get('/current', function (req, res) {

  res.send(wunderground.current);

});


router.get('/forecast', function (req, res) {

  res.send(wunderground.forecast);

});

module.exports = router;
