'use strict';

var web = require('../web'),
  auth = require('../auth'),
  express = require('express'),
  logger = require('log4js'),
  log = logger.getLogger('auth'),
  router = express.Router();


router.get('/', function (req, res) {
  if (req.auth) {
    res.status(200).send({'user': req.auth.user, 'authorized': true, 'client_token': req.auth.client_token, 'expires': req.auth.expires});
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

  auth.login(req.body).then(function (auth) {
    req.session.auth = true;
    res.status(200).send({'status': 'success', 'user': auth.user, 'client_token': auth.client_token, 'auth_token': auth.auth_token });
  }, function () {
    res.status(401).send({'status': 'failed', 'message': 'Login Failed'});
  });

});

module.exports = router;
