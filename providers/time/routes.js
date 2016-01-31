'use strict';

var time = require('../time'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'time': time.time,
    'sunset': time.getTime(time.sunset),
    'sunrise': time.getTime(time.sunrise),
    'solar_noon': time.getTime(time.solar_noon),
    'day': time.day,
    'is': time.is,
  });

});

module.exports = router;
