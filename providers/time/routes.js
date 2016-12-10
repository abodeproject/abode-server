'use strict';

var time = require('../time'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send(time.toJSON());

});

module.exports = router;
