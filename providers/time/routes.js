'use strict';

var time = require('../time'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'current': time.current,
    'time': time.time,
    'dawn': time.dawn,
    'sunrise': time.sunrise,
    'goldenHourMorning': time.goldenHourMorning,
    'solarNoon': time.solarNoon,
    'goldenHourEvening': time.goldenHourEvening,
    'sunset': time.sunset,
    'dusk': time.dusk,
    'night': time.night,
    'day': time.day,
    'is': time.is,
  });

});

module.exports = router;
