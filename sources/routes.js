'use strict';

var sources = require('../sources'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();
var logger = require('log4js'),
  log = logger.getLogger('sources');

router.get('/', function (req, res) {
  res.send(sources.list());
  res.end();
});

router.post('/', web.isUnlocked, web.isJson, function (req, res) {

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

router.put('/:id', web.isUnlocked, web.isJson, function (req, res) {
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

router.delete('/:id', web.isUnlocked, function (req, res) {
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

  try {
    source.proxy(req.method, req.headers, req.params[1], req.body)
    .on('error', function (err) {
      log.error('Error proxying connection to source:', source.name, err);
      try {
        res.status(502).send({'status': 'failed', 'message': 'Error connecting to source', 'details': err});
      } catch (e) {
        res.end();
      }
    })
    .pipe(res);
  } catch (e) {
    log.error('Proxy connection died:', e);
  }

});

module.exports = router;
