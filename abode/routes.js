'use strict';

var ini = require('ini'),
  web = require('../web'),
  abode = require('../abode'),
  express = require('express'),
  logger = require('log4js'),
  log = logger.getLogger('abode'),
  extend = require('util')._extend,
  router = express.Router();


router.get('/config', function (req, res) {
  var config = extend({}, abode.config);
  config.save_needed = abode.save_needed;

  res.status(200).send(config);
});

router.put('/config', web.isJson, function (req, res) {

  abode.update_config(req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/config/:section', function (req, res) {

  res.status(200).send(abode.config[req.params.section]);

});

router.put('/config/:section', web.isJson, function (req, res) {

  abode.update_config(req.body, req.params.section).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/save', function (req, res) {
  abode.write_config().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.get('/views/:view', function (req, res) {

  abode.get_view(req.params.view).then(function (view) {
    res.status(200).send(view);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.put('/views/:view', function (req, res) {

  abode.write_view(req.params.view, req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.delete('/views/:view', function (req, res) {

  abode.delete_view(req.params.view).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/status/', function (req, res) {

  var level,
    display = abode.providers.display;
  if (abode.providers.display.power && display.max_brightness && display.brightness) {
    level = Math.round((display.brightness / display.max_brightness) * 100);
  } else {
    level = 0;
  }

  res.status(200).send({
    '_on': display.power,
    '_level': level
  });

});

router.get('/providers', function (req, res) {
  res.send(abode.providers._providers);
});

router.get('/capabilities', function (req, res) {
  res.send(abode.devices.capabilities);
});

module.exports = router;
