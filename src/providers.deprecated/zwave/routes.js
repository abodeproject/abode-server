'use strict';

var zwave = require('../zwave'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': zwave.enabled,
    'connected': zwave.connected,
    'queue': zwave.queue.length,
    'new_devices': zwave.new_devices,
  });

});

router.post('/enable', function (req, res) {

  zwave.enable().then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/disable', function (req, res) {

  zwave.disable().then(function (response) {
  	res.send(response);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/add_node', function (req, res) {
  zwave.add_node(false);
  res.send({});
});

router.post('/add_secure_node', function (req, res) {
  zwave.add_node(true);
  res.send({});
});

router.post('/remove_node', function (req, res) {
  zwave.remove_node();
  res.send({});
});

router.post('/set_name', function (req, res) {
  zwave.set_name(req.body.node_id, req.body.name);
  res.send({});
});

router.post('/set_location', function (req, res) {
  zwave.set_location(req.body.node_id, req.body.location);
  res.send({});
});

router.post('/set_value', function (req, res) {
  zwave.set_value(req.body.node_id, req.body.commandClass, req.body.instance, req.body.index, req.body.value);
  res.send({});
});

router.get('/scenes', function (req, res) {

  res.send(zwave.scenes);

});

router.post('/scenes', function (req, res) {

  zwave.create_scene(req.body.name).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });


});

router.get('/scenes/:id', function (req, res) {

  zwave.get_scene(req.params.id).then(function (scene) {
    res.status(200).send(scene);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.delete('/scenes/:id', function (req, res) {

  zwave.remove_scene(req.params.id);

  res.status(204).send();

});

router.post('/scenes/:id/values', function (req, res) {

  zwave.add_scene_value(req.params.id, req.body.nodeid, req.body.commandclass, req.body.instance, req.body.index, req.body.value).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.delete('/scenes/:id/values', function (req, res) {

  zwave.remove_scene_value(req.params.id, req.body.nodeid, req.body.commandclass, req.body.instance, req.body.index, req.body.value).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

module.exports = router;
