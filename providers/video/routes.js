'use strict';

var video = require('../video'),
  express = require('express'),
  web = require('../../web'),
  router = express.Router();

router.get('/', function (req, res) {

  if (video.display) {
    res.send({'status': 'ready', 'display': video.display, 'playing': video.playing, 'last_status': video.last_status});
  } else {
    res.send({'status': 'failed', 'message': 'No display found'});
  }

});

router.post('/', web.isJson, function (req, res) {

  video.start(req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.delete('/', function (req, res) {

  if (video.playing) {

    video.stop().then(function () {
      res.status(200).send({'status': 'success'});
    }, function (err) {
      res.status(400).send(err);
    });

  } else {
    res.status(404).send({'status': 'failed', 'message': 'No video playing'});
  }

});

module.exports = router;
