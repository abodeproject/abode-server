'use strict';

var abode;
var routes;
var config;

var mongoose = require('mongoose');
var q = require('q');
var crypto = require('crypto');
var logger = require('log4js'),
  log = logger.getLogger('abode.auth');

var AuthSchema = mongoose.Schema({
  'name': { 'type': String, 'required': true, 'unique': true },
  'user': { 'type': String, 'required': true, 'unique': true },
  'email': { 'type': String, 'required': true, 'unique': true },
  'password': { 'type': String, 'required': true, 'unique': true },
  'created': { 'type': Date, 'default': Date.now },
});

// Build the devices object
var Auth = function () {
  var defer = q.defer();

  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/auth', routes);

  config = abode.config;
  config.secret = config.secret || 'abcdefg1234567';

  log.debug('Checking for default user');
  Auth.list().then(function (results) {
    if (results.length === 0) {
      log.warn('No users defined, creating one');

      Auth.create({
        'name': 'admin',
        'user': 'admin',
        'email': 'admin@localhost',
        'password': Auth.crypt_password('changeme')
      }).then(function () {
          defer.resolve(Auth);
        }, function (err) {
          log.error('Unable to create default account:', err);
          defer.resolve(Auth);
      });
    } else {
      defer.resolve(Auth);
    }
  }, function (err) {
    log.error(err);

    defer.resolve(Auth);
  });

  defer.resolve();

  return defer.promise;
};

Auth.crypt_password = function (password) {

  return crypto.createHmac('sha256', config.secret).update(password).digest('hex');

};

Auth.list = function (conditions) {
  var defer = q.defer();

  conditions = conditions || {};

  Auth.model.find(conditions, function (err, users) {
    if (err) { defer.reject(err); }

    defer.resolve(users);
  });

  return defer.promise;
};

Auth.create = function (config) {
  var defer = q.defer(),
    user = new Auth.model(config);

  // Save the user
  user.save( function (err) {
    if (err) {
      log.error(err.message || err);
      defer.reject(err);
      return defer.promise;
    }

    log.info('User created: ', config.name);
    defer.resolve(user);
  });

  return defer.promise;
};

Auth.login = function (data) {
  var defer = q.defer();

  var search = {
    'user': data.user,
    'password': Auth.crypt_password(data.password)
  };

  Auth.list(search).then(function (results) {
    if (results.length > 0) {
      defer.resolve(results[0]);
    } else {
      defer.reject();
    }
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Auth.model = mongoose.model('Auth', AuthSchema);
module.exports = Auth;
