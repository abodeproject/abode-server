'use strict';

var synology = require('../synology'),
  request = require('request'),
  router = require('express').Router();

router.get('/', function (req, res) {
  
  res.send({
    'enabled': synology.enabled,
    'status': synology.status,
    'polling': synology.polling,
    'last_polled': synology.last_polled,
    'can_write': synology.can_write,
    'server': synology.server,
    'cameras': synology.cameras
  });
  
});

router.post('/enable', function (req, res) {
  
  synology.enable(req.body.user, req.body.password)
  .then(function (response) {
    res.send(response);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });
  
});

router.post('/refresh', function (req, res) {
  
  synology.load()
  .then(function (response) {
    res.send(response);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });
  
});

router.get('/snapshot/:id', function (req, res) {
  
  synology.getSnapshot(req.params.id)
  .then(function (response) {
    res.set('Content-Type', 'image/jpeg');
    res.send(response);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });
  
});

router.get('/video/:id', function (req, res) {
  
  synology.getLiveUrls(req.params.id)
  .then(function (response) {
    res.send(response[0]);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });
  
});

router.get('/live/:id', function (req, res) {
  
  synology.getLiveUrls(req.params.id)
  .then(function (response) {
    //request.get(response[0].rtspOverHttpPath).pipe(res);
    var path = response[0].mjpegHttpPath;
    path = path.replace('10.0.1.10', 'sierra.scottneel.com');
    request.get(path).pipe(res);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });
  
});

module.exports = router;