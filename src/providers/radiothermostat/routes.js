'use strict';

var radiothermostat = require('../radiothermostat'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'current': radiothermostat.current,
    'forecast': radiothermostat.forecast,
  });

});


module.exports = router;
