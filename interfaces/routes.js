'use strict';

var interfaces = require('../interfaces'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {
  res.send(interfaces.list());
  res.end();
});

router.post('/', web.isJson, function (req, res) {
  interfaces.create(req.body).then(function (iface) {
    res.status(200).send(iface);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id', function (req, res) {
  var iface = interfaces.get(req.params.id);
  if (!iface) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  res.send(iface);
  res.end();
});

router.get('/:id/template', function (req, res) {
  var iface = interfaces.get(req.params.id);
  if (!iface) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  res.send(iface.template);
  res.end();
});

router.put('/:id', web.isJson, function (req, res) {
  var iface = interfaces.get(req.params.id);
  if (!iface) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  Object.keys(req.body).forEach(function (key) {
    iface[key] = req.body[key];
  });

  iface._save().then(function (response) {
    res.status(204).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.delete('/:id', function (req, res) {
  var iface = interfaces.get(req.params.id);
  if (!iface) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  iface.delete().then(function () {
    res.status(204).send();
  }, function (err) {
    res.send(err);
    res.end();
  });
});

module.exports = router;
