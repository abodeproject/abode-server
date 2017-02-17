'use strict';

var mock = require('../mock'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': mock.config.enabled
  });

});

module.exports = router;
