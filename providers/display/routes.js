'use strict';

var display = require('../display'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'name': display.display,
    'power': display.on,
    'brightness': display.brightness,
    'max_brightness': display.max_brightness,
  });

});

router.get('/brightness', function (req, res) {

  res.send({'brightness': display.brightness});

});

router.post('/brightness/:value', function (req, res) {

  display.set_brightness(req.params.value).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/max_brightness', function (req, res) {

  res.send({'max_brightness': display.max_brightness});

});

router.get('/power', function (req, res) {

  res.send({'power': display.power});

});

router.post('/on', function (req, res) {

  display.on().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/off', function (req, res) {

  display.off().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

module.exports = router;
