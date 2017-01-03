'use strict';

var abode,
  q = require('q'),
  fs = require('fs'),
  logger = require('log4js'),
  log = logger.getLogger('web'),
  geoip = require('geoip-lite'),
  useragent = require('useragent'),
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
  Web.config.address = Web.config.address || '0.0.0.0';
  Web.config.secureProtocol = Web.config.secureProtocol || 'TLSv1_2_server_method';
  Web.config.ciphers = Web.config.ciphers || 'AES128-GCM-SHA256:HIGH:!RC4:!MD5:!aNULL:!EDH';
  Web.config.access_log = Web.config.access_log || 'logs/abode_access.log';
  Web.config.cors_origins = Web.config.cors_origins || ['http://localhost'];

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

  /*
  if (allowed) { session.auth = true; session.user = 'guest'; return true; }

  if (auth) {
    return true;
  }
  */

  abode.config.allow_uris.forEach(function (matcher) {

    allowed = (pathspec.parse(matcher).matches(uri)) ? true : allowed;

  });

  return allowed;
};

Web.init = function () {

  //Get abode
  abode = require('../abode');

  //Create an express instance
  Web.server = express();
  Web.server.use(logger.connectLogger(http_logger));
  Web.server.use(bodyParser.json());
  Web.server.use(bodyParser.text());

  Web.server.use(function (req, res, next) {
    var trusted = false;

    if (req.headers.origin) {
      Web.config.cors_origins.forEach(function (trust) {
        trusted = (req.headers.origin.indexOf(trust) === 0) ? trust : trusted;
      });

      if (trusted !== false) {
        res.set('Access-Control-Allow-Origin', req.headers.origin);
        res.set('Access-Control-Allow-Headers','content-type, client_token, auth_token');
        res.set('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');
      }
    }
    next();
  });

  //Always return a 204 for OPTIONS which is usually a CORS test
  Web.server.use(function (req, res, next) {
    if (req.method === 'OPTIONS') {
      res.status(204).send();
      return;
    }
    next();
  });

  //Check server token for abode device
  Web.server.use(function (req, res, next) {
    if (req.headers['server-token'] === undefined || abode.config.mode !== 'device') {
      next();
      return;
    }

    if (req.headers['server-token'] === abode.config.server_token) {
      log.info('Server request received');
      req.is_server = true;
    }

    next();
  });

  // Validate client/auth tokens
  Web.server.use(function (req, res, next) {

    if (!abode.auth || req.is_server) {
      next();
      return;
    }

    req.client_ip = (abode.config.ip_header && req.headers[abode.config.ip_header]) ? req.headers[abode.config.ip_header] : req.ip;
    abode.auth.check(req.headers['client-token'] || req.headers['client_token'] || req.query.client_token, req.headers['auth-token'] || req.headers['auth_token'] || req.query.auth_token, req.client_ip, req.headers['user-agent']).then(function (response) {

      //Should probably standardize on one of these
      req.token = response;
      req.auth = response;

      //Get a new token expiration date
      var token_expiration = new Date();
      token_expiration.setDate(token_expiration.getDate() + 1);

      var agent = useragent.parse(req.headers['user-agent']);
      agent = JSON.stringify(agent);
      agent = JSON.parse(agent);
      agent.source = req.headers['user-agent'];

      var geo = geoip.lookup(req.client_ip);
      geo = geo || {};

      //Set the token expiration and save it
      req.token.last_used = new Date();
      req.token.expires = token_expiration
      req.token.locale = geo;
      req.token.agent = agent;
      req.token.save();

      next();

    }, function (err) {
      next();
    });

  });

  //Get our token device if token found
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

  // Check uri and ip against allowed list
  Web.server.use(function (req, res, next) {

    // If we are already authorized, continue
    if (req.auth || req.token || req.is_server) {
      next();
      return;
    }

    // Determine our client IP
    var ip = (abode.config.ip_header && req.headers[abode.config.ip_header]) ? req.headers[abode.config.ip_header] : req.ip;

    //Check the ip and uri
    if (Web.check_auth(ip, req.path)) {
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

Web.isUnlocked = function (req, res, next) {
  if ( !req.device ) {
    next();
    return;
  }

  if (req.device.locked === true) {
    res.status(403).send({'status': 'locked', 'message': 'This device is locked and the request can not be performed'});
    return;
  }

  next();
};

module.exports = Web;
