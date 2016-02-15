'use strict';

var fs = require('fs'),
  request = require('request'),
  cameras = require('../camera'),
  abode = require('../../abode'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send(cameras.list());

});

router.get('/:id/image', function (req, res) {

  var camera = cameras.get(req.params.id);
  if (!camera) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  if (!camera.image_url) {
    res.status(404).send({'status': 'failed', 'message': 'No Video Path Found'});
    return;
  }

  var path = abode.config.camera.image_path + '/' + camera._id + '.jpg';

  res.sendFile(fs.realpathSync(path));

});

router.get('/:id/video', function (req, res) {

  var auth,
    camera = cameras.get(req.params.id);

  if (!camera) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  if (!camera.video_url) {
    res.status(404).send({'status': 'failed', 'message': 'No Video Path Found'});
    return;
  }

  if (camera.config.username) {
    auth = {
      auth: {
        user: camera.config.username,
        pass: camera.config.password,
      }
    };
  }

  request.get(camera.video_url, auth).pipe(res);

});

module.exports = router;
