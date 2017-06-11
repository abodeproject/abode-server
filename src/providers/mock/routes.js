'use strict';

var mock = require('../mock'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': mock.enabled
  });

});

module.exports = router;
