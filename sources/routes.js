'use strict';

var sources = require('../sources'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {
  res.send(sources.list());
  res.end();
});

router.post('/', web.isJson, function (req, res) {

  sources.create(req.body).then(function (source) {
    res.status(200).send(source);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id', function (req, res) {
  var source = sources.get(req.params.id);
  if (!source) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  res.send(source);
  res.end();
});

router.put('/:id', web.isJson, function (req, res) {
  var source = sources.get(req.params.id);
  if (!source) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  delete req.body._rooms;

  Object.keys(req.body).forEach(function (key) {
    source[key] = req.body[key];
  });

  source._save().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.delete('/:id', function (req, res) {
  var source = sources.get(req.params.id);
  if (!source) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  source.delete().then(function () {
    res.send();
    res.end();
  }, function (err) {
    res.send(err);
    res.end();
  });
});

router.all(/^\/([^\/]+)\/(.+)$/, function (req, res) {
  var source = sources.get(req.params[0]);
  if (!source) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  source.proxy(req.method, req.params[1], req.body).then(function (response) {
    res.status(response.status).send(response.body);
  }, function (err) {
    res.status(422).send(err);
  });
});

module.exports = router;
