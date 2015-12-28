'use strict';

var abode,
  q = require('q'),
  addr = require('netaddr').Addr,
  logger = require('log4js'),
  log = logger.getLogger('abode.web'),
  bodyParser = require('body-parser'),
  session = require('express-session'),
  MongoStore = require('connect-mongo')(session),
  pathspec = require('pathspec').Mask,
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

Web.check_auth = function (ip, uri, auth) {
  var allowed = false;

  abode.config.allow_networks.forEach(function (net) {

    allowed = (addr(net).contains(addr(ip))) ? true : allowed;

  });
  
  if (allowed) { return true; }

  if (auth) {
    return true;
  }

  abode.config.allow_uris.forEach(function (matcher) {

    allowed = (pathspec.parse(matcher).matches(uri)) ? true : allowed;

  });

  return allowed;
};

Web.init = function () {

  //Get abode
  abode = require('../abode');

  var store_config = {
    mongooseConnection: abode.db,
  };


  //Create an express instance
  Web.server = express();
  Web.server.use(logger.connectLogger(log));
  Web.server.use(bodyParser.json());
  Web.server.use(session({
    name: 'abode-auth',
    saveUninitialized: true,
    resave: true,
    secret: abode.config.secret || 'XAj2XTOQ5TA#ybgNxl#cw6pcyDn%bKeh',
    store: new MongoStore(store_config)
  }));
  Web.server.use(function (req, res, next) {
    var ip = (abode.config.ip_header && req.headers[abode.config.ip_header]) ? req.headers[abode.config.ip_header] : req.ip;

    if (Web.check_auth(ip, req.path, req.session.auth)) {
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
