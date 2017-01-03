'use strict';

var devices = require('../../devices'),
  insteon = require('../insteon'),
  web = require('../../web'),
  express = require('express'),
  router = express.Router();
var logger = require('log4js'),
  log = logger.getLogger('insteon');

router.get('/', function (req, res) {

  res.send();

});

router.post('/linking/start', web.isUnlocked, function (req, res) {

  var config = {};
  config.type = req.body.type || 'either';
  config.auto_add = (req.body.auto_add !== undefined) ? req.body.auto_add : true;

  insteon.start_linking(config.type, config.auto_add).then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/linking/status', function (req, res) {

  res.send({'linking': insteon.linking});

});

router.post('/linking/stop', web.isUnlocked, function (req, res) {

  insteon.stop_linking().then(function () {
    res.status(200).send({'status': 'success'});
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/linking/clear', web.isUnlocked, function (req, res) {

  insteon.last_device = {};
  res.send({'status': 'success'});

});

router.get('/linking/last', function (req, res) {

  if (insteon.last_device && insteon.last_device.config) {
    res.send(insteon.last_device.config);
  } else {
    res.status(404).status({'status': 'failed'});
  }

});

router.post('/devices/:id/start_linking', web.isUnlocked, function (req, res) {

  var device = devices.get(req.params.id);

  if (!device) {
    log.debug('Device not found: ', req.params.id);
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  insteon.queue('DIRECT_START_LINKING', device).then(function () {
    res.send({'status': 'success'});
  }, function (err) {
    res.status(400).status({'status': 'failed', 'message': 'Failed to start linking on device', 'details': err});
  });

});

router.post('/devices/:id/add_to_group', web.isUnlocked, function (req, res) {

  var device = devices.get(req.params.id);

  if (!device) {
    log.debug('Device not found: ', req.params.id);
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  insteon.queue('DIRECT_ADD_TO_GROUP', device).then(function () {
    res.send({'status': 'success'});
  }, function (err) {
    res.status(400).status({'status': 'failed', 'message': 'Failed to start linking on device', 'details': err});
  });

});

router.post('/devices/:id/start_unlinking', web.isUnlocked, function (req, res) {

  var device = devices.get(req.params.id);

  if (!device) {
    log.debug('Device not found: ', req.params.id);
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  insteon.queue('DIRECT_START_UNLINKING', device).then(function () {
    res.send({'status': 'success'});
  }, function (err) {
    res.status(400).status({'status': 'failed', 'message': 'Failed to stop linking on device', 'details': err});
  });

});

router.post('/devices/:id/remove_from_group', web.isUnlocked, function (req, res) {

  var device = devices.get(req.params.id);

  if (!device) {
    log.debug('Device not found: ', req.params.id);
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  insteon.queue('DIRECT_REMOVE_FROM_GROUP', device).then(function () {
    res.send({'status': 'success'});
  }, function (err) {
    res.status(400).status({'status': 'failed', 'message': 'Failed to start linking on device', 'details': err});
  });

});

router.get('/actions', function (req, res) {

  res.send(Object.keys(insteon.actions));

});

router.post('/devices/:id/send_action/:action', web.isUnlocked, function (req, res) {

  var device = devices.get(req.params.id);

  if (!device) {
    log.debug('Device not found: ', req.params.id);
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  insteon.queue(req.params.action, device, req.body).then(function () {
    res.send({'status': 'success'});
  }, function (err) {
    res.status(400).status({'status': 'failed', 'message': 'Failed to start linking on device', 'details': err});
  });

});

module.exports = router;