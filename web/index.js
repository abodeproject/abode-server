'use strict';

var abode,
  q = require('q'),
  fs = require('fs'),
  logger = require('log4js'),
  log = logger.getLogger('web'),
  http_logger = logger.getLogger('http_access'),
  https = require('https'),
  addr = require('netaddr').Addr,
  read = require('fs').readFileSync,
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
  Web.config.ssl_port = Web.config.ssl_port || 8443;
  Web.config.address = Web.config.address || '127.0.0.1';
  Web.config.secureProtocol = Web.config.secureProtocol || 'TLSv1_2_server_method';
  Web.config.ciphers = Web.config.ciphers || 'AES128-GCM-SHA256:HIGH:!RC4:!MD5:!aNULL:!EDH';
  Web.config.access_log = Web.config.access_log || 'logs/abode_access.log';

  logger.addAppender(logger.appenders.file(Web.config.access_log, logger.layouts.messagePassThroughLayout, 4194304, 4), 'http_access');

  if (Web.config.key && Web.config.cert) {
    var httpsOptions = {
      key: read(Web.config.key, 'utf8'),
      cert: read(Web.config.cert, 'utf8'),
      secureProtocol: Web.config.secureProtocol,
      ciphers: Web.config.ciphers
    };

    if (Web.config.ca) {
      httpsOptions.ca = [];
      Web.config.ca.forEach(function (ca) {
        httpsOptions.ca.push(read(ca, 'utf8'));
      });
    }

    https.createServer(httpsOptions, Web.server).listen(Web.config.ssl_port, Web.config.address, function (err) {
      if (err) {
        log.error(err);
        return;
      }
      log.info('HTTPS server listening on %s:%s', Web.config.address, Web.config.ssl_port);
    });
  }

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

Web.check_auth = function (ip, uri, auth, session) {
  var allowed = false;



  if (ip === '::1') {
    allowed = true;
  } else {

    abode.config.allow_networks.forEach(function (net) {

      allowed = (addr(net).contains(addr(ip))) ? true : allowed;

    });

  }

  if (allowed) { session.auth = true; session.user = 'guest'; return true; }

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
  Web.server.use(logger.connectLogger(http_logger));
  Web.server.use(bodyParser.json());
  Web.server.use(bodyParser.text());
  Web.server.use(session({
    name: 'abode-auth',
    saveUninitialized: true,
    resave: true,
    secret: abode.config.secret || 'XAj2XTOQ5TA#ybgNxl#cw6pcyDn%bKeh',
    store: new MongoStore(store_config)
  }));
  Web.server.use(function (req, res, next) {
    req.client_ip = (abode.config.ip_header && req.headers[abode.config.ip_header]) ? req.headers[abode.config.ip_header] : req.ip;

    abode.auth.check(req.headers['client_token'], req.headers['auth_token'], req.client_ip, req.headers['user-agent']).then(function (response) {

      req.token = response;
      next();

    }, function (err) {
      next();
    });

  });
  Web.server.use(function (req, res, next) {

    if (!req.token) {
      next();
      return;
    }

    req.token.get_device().then(function (device) {
      req.device = device;
      next();
    }, function () {
      next();
    })

  });
  Web.server.use(function (req, res, next) {

    var alt_method = function() {
      var ip = (abode.config.ip_header && req.headers[abode.config.ip_header]) ? req.headers[abode.config.ip_header] : req.ip;

      if (Web.check_auth(ip, req.path, req.session.auth, req.session)) {
        req.auth = {'user': req.session.user}
        next();
      } else {
        res.status(401).send({'status': 'failed', 'message': 'Unauthorized'});
      }

    };

    if (req.headers.client_token && req.headers.auth_token) {
      abode.auth.check_token(req.headers.client_token, req.headers.auth_token).then(function (auth) {
        req.auth = auth;
        req.session.auth = true;
        next();
      }, function () {
        alt_method();
      })
    } else {
      alt_method();
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
