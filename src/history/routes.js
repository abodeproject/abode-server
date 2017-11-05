'use strict';

var fs = require('fs'),
  abode = require('../abode'),
  web = require('../web'),
  express = require('express'),
  logger = require('log4js'),
  log = logger.getLogger('history'),
  router = express.Router();

router.get('/', web.isUnlocked, function (req, res) {

  res.status(200).send({
    'enabled': abode.history.enabled,
    'recording': abode.history.recording,
    'cleaning': abode.history.cleaning,
    'max_history_age': abode.history.config.max_history_age,
    'record_stats': abode.history.record_stats
  });
  
});

router.post('/enable', web.isUnlocked, function (req, res) {
  abode.history.enable().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });
});

router.post('/disable', web.isUnlocked, function (req, res) {
  abode.history.disable().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });
});
router.get('/:type/:name', function (req, res) {
  abode.history.get(req.params.type, req.params.name, undefined, undefined, req.query.limit, req.query.page)
  .then(function (response) {
    res.set('total-count', response.count);
    res.set('total-pages', response.pages);
    res.status(200).send(response.records);
  })
  .fail(function (err) {
    res.status(err.http_code || 400).send(err);
  });
});

router.get('/:type/:name/:start', function (req, res) {
  
  abode.history.get(req.params.type, req.params.name, req.params.start, undefined, req.query.limit, req.query.page)
  .then(function (response) {
    res.set('total-count', response.count);
    res.set('total-pages', response.pages);
    res.status(200).send(response.records);
  })
  .fail(function (err) {
    res.status(err.http_code || 400).send(err);
  });
  
});

router.get('/:type/:name/:start/:end', function (req, res) {
  
  abode.history.get(req.params.type, req.params.name, req.params.start, req.params.end, req.query.limit, req.query.page)
  .then(function (response) {
    res.set('total-count', response.count);
    res.set('total-pages', response.pages);
    res.status(200).send(response.records);
  })
  .fail(function (err) {
    res.status(err.http_code || 400).send(err);
  });
  
});

module.exports = router;