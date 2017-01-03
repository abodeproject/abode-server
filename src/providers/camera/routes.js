'use strict';

var fs = require('fs'),
  request = require('request'),
  cameras = require('../camera'),
  abode = require('../../abode'),
  express = require('express'),
  router = express.Router();
var logger = require('log4js'),
  log = logger.getLogger('camera');

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


  request.get(camera.video_url, auth)
  .on('error', function (err) {
    log.error('Error proxying connection to camera:', camera.video_url, err);
    try {
      res.status(502).send({'status': 'failed', 'url': camera.video_url, 'message': 'Error connecting to camera', 'details': err});
    } catch (e) {
      res.end();
    }
  })
  .pipe(res);

});

module.exports = router;
