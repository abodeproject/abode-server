'use strict';

var alarmclocks = require('../alarmclock'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  alarmclocks.list().then(function (results) {
    res.send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/', function (req, res) {

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

router.put('/:id', function (req, res) {

  alarmclocks.update(req.body, req.params.id).then(function (response) {
    res.send(response);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.delete('/:id', function (req, res) {

  alarmclocks.delete(req.params.id).then(function (response) {
    res.status(204).send();
  }, function (err) {
    res.status(404).send(err);
  });

});

module.exports = router;
