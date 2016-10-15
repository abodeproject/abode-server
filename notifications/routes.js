'use strict';

var q = require('q'),
  notifications = require('../notifications'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  notifications.query().then(function (results) {
    res.send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/', function (req, res) {

  notifications.create(req.body).then(function (results) {
    res.status(201).send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/active', function (req, res) {

  notifications.query({'active': true}).then(function (results) {

    var rendered = [];

    results.forEach(function (record) {
      rendered.push({'_id': record.id, 'name': record.name, 'message': record.render(), 'expires': record.expires, 'actions': record.actions, 'active_date': record.active_date});
    });

    res.status(200).send(rendered);

  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/inactive', function (req, res) {

  notifications.query({'active': false}).then(function (results) {
    res.send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/:id', function (req, res) {

  notifications.get(req.params.id).then(function (results) {
    res.send(results);
  }, function (err) {
    res.status(404).send(err);
  });

});

router.put('/:id', function (req, res) {

  delete req.body.active;
  delete req.body.active_vars;
  delete req.body.active_date;

  notifications.update(req.params.id, req.body).then(function (record) {
    res.status(200).send(record);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.post('/:id/activate', function (req, res) {

  notifications.activate(req.params.id, req.body).then(function (result) {

    res.status(200).send(result);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.post('/:id/deactivate', function (req, res) {

  notifications.deactivate(req.params.id).then(function (record) {
    res.status(200).send(record);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.post('/:id/render', function (req, res) {

  notifications.render(req.params.id).then(function (record) {
    res.status(200).send(record);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.post('/:id/do_action/:actionid', function (req, res) {

  notifications.do_action(req.params.id, req.params.actionid).then(function (result) {
    res.send(result)
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.delete('/:id', function (req, res) {

  notifications.delete(req.params.id).then(function () {
    res.status(204).send();
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

module.exports = router;
