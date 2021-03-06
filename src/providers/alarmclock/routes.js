'use strict';

var alarmclocks = require('../alarmclock'),
  web = require('../../web'),
  express = require('express'),
  router = express.Router();

router.get('/status', function (req, res) {

  res.send({
    'enabled': alarmclocks.enabled,
  });

});

router.post('/enable', function (req, res) {

  alarmclocks.enable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/disable', function (req, res) {

  alarmclocks.disable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/', function (req, res) {

  alarmclocks.list().then(function (results) {
    res.send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/', web.isUnlocked, function (req, res) {

  alarmclocks.create(req.body).then(function (response) {
    res.send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/:id', function (req, res) {

  alarmclocks.get(req.params.id).then(function (response) {
    res.send(response);
  }, function (err) {
    res.status(404).send(err);
  });

});

router.put('/:id', web.isUnlocked, function (req, res) {

  alarmclocks.update(req.body, req.params.id).then(function (response) {
    res.send(response);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.delete('/:id', web.isUnlocked, function (req, res) {

  alarmclocks.delete(req.params.id).then(function () {
    res.status(204).send();
  }, function (err) {
    res.status(404).send(err);
  });

});

module.exports = router;
