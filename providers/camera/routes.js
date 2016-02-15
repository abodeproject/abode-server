'use strict';

var fs = require('fs'),
  cameras = require('../camera'),
  abode = require('../../abode'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send(cameras.list());

});

router.get('/:id', function (req, res) {

  var camera = cameras.get(req.params.id);
  if (!camera) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  var path = abode.config.camera.image_path + '/' + camera._id + '.jpg';

  res.sendFile(fs.realpathSync(path));

});

module.exports = router;
