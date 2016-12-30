'use strict';

var fs = require('fs'),
  ini = require('ini'),
  web = require('../web'),
  abode = require('../abode'),
  express = require('express'),
  logger = require('log4js'),
  log = logger.getLogger('network'),
  extend = require('util')._extend,
  exec = require('child_process').exec,
  router = express.Router();
  

router.get('/', function (req, res) {
  abode.network.status().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  })
});

router.get('/wireless', function (req, res) {
  abode.network.list_wireless().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.get('/interfaces', function (req, res) {
  abode.network.list_interfaces().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.get('/routes', function (req, res) {
  abode.network.list_routes().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.get('/wireless_status', function (req, res) {
  abode.network.wireless_status().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.post('/connect', function (req, res) {
  abode.network.connect(req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

module.exports = router;