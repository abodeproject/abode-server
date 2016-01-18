'use strict';

var web = require('../web'),
  auth = require('../auth'),
  express = require('express'),
  logger = require('log4js'),
  log = logger.getLogger('auth'),
  router = express.Router();


router.get('/', function (req, res) {
  if (req.session.auth) {
    res.status(200).send({'user': 'guest', 'authorized': true});
  } else {
    res.status(401).send({'authorized': false});
  }
});

router.delete('/', function (req, res) {

  req.session.destroy(function(err) {
    if (err) {
      res.status(400).send({'status': 'failed', 'error': err});
      return;
    }

    res.status(200).send({'authorized': false});
  });

});

router.post('/', web.isJson, function (req, res) {

  auth.login(req.body).then(function () {
    req.session.auth = true;
    res.status(200).send({'status': 'success'});
  }, function () {
    res.status(401).send({'status': 'failed', 'message': 'Login Failed'});
  });

});

module.exports = router;
