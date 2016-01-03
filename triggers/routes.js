'use strict';

var triggers = require('../triggers'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {
  res.send(triggers.list());
  res.end();
});

router.post('/', web.isJson, function (req, res) {
  triggers.create(req.body).then(function (response) {
    res.status(201).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id', function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  res.send(triggers.get(req.params.id));
  res.end();
});

router.put('/:id', web.isJson, function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  Object.keys(req.body).forEach(function (key) {
    trigger[key] = req.body[key];
  });

  trigger._save().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.delete('/:id', function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  trigger.delete().then(function (response) {
    res.send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.post('/:id/enable', function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  trigger.enable().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.post('/:id/disable', function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  trigger.disable().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

module.exports = router;
