'use strict';

var ifttt = require('../ifttt'),
  abode = require('../../abode'),
  triggers = require('../../triggers'),
  web = require('../../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send(ifttt.list());

});

router.post('/', web.isJson, function (req, res) {
  ifttt.create(req.body).then(function () {
    res.status(201).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id', function (req, res) {

  var key = ifttt.get(req.params.id);
  if (!key) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  res.send(key);

});

router.put('/:id', web.isJson, function (req, res) {
  var key = ifttt.get(req.params.id);
  if (!key) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  //That way it will trigger events on changes
  key._save(req.body).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(422).send(err);
  });
});

router.delete('/:id', function (req, res) {

  var key = ifttt.get(req.params.id);
  if (!key) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  key.delete().then(function () {
    res.send({'status': 'success'});
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/:id/triggers', function (req, res) {
  var key = ifttt.get(req.params.id);

  if (!key) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  res.send(key.get_triggers());

});

router.post('/:id/triggers', web.isJson, function (req, res) {

  var key = ifttt.get(req.params.id);
  var trigger = triggers.get(req.body._id || req.body.name);

  if (!key) {
    res.status(404).send({'status': 'failed', 'message': 'Key not found'});
    return;
  }

  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Trigger not found'});
    return;
  }

  key.add_trigger(trigger).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/:id/triggers/:trigger', function (req, res) {

  var key = ifttt.get(req.params.id);
  var trigger = triggers.get(req.params.trigger);

  if (!key) {
    res.status(404).send({'status': 'failed', 'message': 'Key not found'});
    return;
  }

  if (!trigger || key.triggers.indexOf(trigger._id) === -1) {
    res.status(404).send({'status': 'failed', 'message': 'Trigger not found'});
    return;
  }

  res.send(trigger);

});

router.delete('/:id/triggers/:trigger', function (req, res) {

  var key = ifttt.get(req.params.id);
  var trigger = triggers.get(req.params.trigger);

  if (!key) {
    res.status(404).send({'status': 'failed', 'message': 'Key not found'});
    return;
  }

  if (!trigger || key.triggers.indexOf(trigger._id) === -1) {
    res.status(404).send({'status': 'failed', 'message': 'Trigger not found'});
    return;
  }

  key.remove_trigger(trigger).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(422).send(err);
  });

});

router.get('/keys/:key', function (req, res) {

  res.send({
    'enabled': abode.config.ifttt.enabled
  });

});

router.get('/trigger/:key/:trigger', function (req, res) {

  var key = ifttt.get(req.params.key);
  var trigger = triggers.get(req.params.trigger);

  if (!key) {
    res.status(404).send({'status': 'failed', 'message': 'Key not found'});
    return;
  }

  if (!trigger || key.triggers.indexOf(trigger._id) === -1) {
    res.status(404).send({'status': 'failed', 'message': 'Trigger not found'});
    return;
  }

  //Handle Actions (Move this to a function so it can be called easier depending on delay)
  triggers.fire_actions(trigger.actions);

  //Handle durations
  triggers.trigger_duration(trigger.duration);

  res.send({'status': 'success'});

});

module.exports = router;
