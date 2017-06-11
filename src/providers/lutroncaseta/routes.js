'use strict';

var lutroncaseta = require('../lutroncaseta'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': lutroncaseta.enabled,
    'connected': lutroncaseta.connected,
    'queue': lutroncaseta.queue.length,
  });

});

router.post('/enable', function (req, res) {

  lutroncaseta.start().then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/disable', function (req, res) {

  lutroncaseta.stop().then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/send', function (req, res) {

  lutroncaseta.send(req.body).then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

module.exports = router;
