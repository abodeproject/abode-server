'use strict';

var abode,
  q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('abode.web'),
  bodyParser = require('body-parser'),
  express = require('express');

var Web = function () {

  var defer = q.defer();

  //Get abode
  abode = require('../abode');

  //Set our config defaults
  Web.config = abode.config.web || {};
  Web.config.port = Web.config.port || 8080;
  Web.config.address = Web.config.address || '127.0.0.1';


  //Listen on the port
  Web.server.listen(Web.config.port, Web.config.address, function (err) {
    if (err) {
      defer.reject(err);
      return;
    }

    //Resolve the provider defer
    log.info('Web server listening on %s:%s', Web.config.address, Web.config.port);
    defer.resolve();
  });


  return defer.promise;

};

Web.check_auth = function (ip, uri) {
  if (abode.config.allow_networks.indexOf(ip) > -1) {
    return true;
  }

  if (abode.config.allow_uris.indexOf(uri) > -1) {
    return true;
  }

  return false;
};

Web.init = function () {

  //Create an express instance
  Web.server = express();
  Web.server.use(logger.connectLogger(log));
  Web.server.use(bodyParser.json());
  Web.server.use(function (req, res, next) {
    if (Web.check_auth(req.ip, req.path)) {
      next();
    } else {
      res.status(401).send({'status': 'failed', 'message': 'Unauthorized'});
    }
  });
  Web.server.use('/', express.static(__dirname + '/../public'));
  Web.server.use(function (req, res, next) {
    res.removeHeader('X-Powered-By');
    next();
  });

  return Web;

};

Web.isJson = function (req, res, next) {
  if (req.headers && req.headers['content-type'] && req.headers['content-type'].indexOf('application/json') !== -1) {
    next();
  } else {
    res.status(400).send({'status': 'failed', 'message': 'Invalid JSON'});
  }
};

module.exports = Web;
