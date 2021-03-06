'use strict';

var abode;
var routes;
var config;

var mongoose = require('mongoose');
var q = require('q');
var hat = require('hat');
var crypto = require('crypto');
var geoip = require('geoip-lite');
var useragent = require('useragent');
var addr = require('netaddr').Addr;
var logger = require('log4js'),
  log = logger.getLogger('auth');

// Build the devices object
var Auth = function () {
  var defer = q.defer();

  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/api/auth', routes);

  config = abode.config;
  config.secret = config.secret || 'abcdefg1234567';
  config.min_auth = config.min_auth || 1;
  config.default_user = config.default_user || 'guest';

  log.debug('Checking for admin user');
  Auth.list({'user': 'admin'}).then(function (results) {
    if (results.length === 0) {
      log.warn('No admin user defined, creating one');
      var passwd = hat(128, 16);
      
      Auth.create({
        'name': 'admin',
        'user': 'admin',
        'email': 'admin@localhost',
        'password':passwd
      }).then(function () {
          log.info('Created admin user: admin:' + passwd);
          defer.resolve(Auth);
        }, function (err) {
          log.error('Unable to create admin account:', err);
          defer.resolve(Auth);
      });
    } else {
      defer.resolve(Auth);
    }
  }, function (err) {
    log.error(err);

    defer.resolve(Auth);
  });

  log.debug('Checking for default user: %s', config.default_user);
  Auth.list({'user': config.default_user}).then(function (results) {
    if (results.length === 0) {
      log.warn('No default user defined, creating one');

      Auth.create({
        'name': config.default_user,
        'user': config.default_user,
        'email': config.default_user + '@localhost',
        'password':  hat(512, 32)
      }).then(function () {
        log.info('Created default user: %s', config.default_user);
      }, function (err) {
         log.error('Unable to create default account:', err);
      });
    }
  }, function (err) {
    log.error(err);
  });

  setInterval(Auth.token_cleaner, 1000 * 60);
  Auth.token_cleaner();
  Auth.update_pin_cache();
  defer.resolve();

  return defer.promise;
};

Auth.methods = [
  {
    'name': 'ip',
    'usage': 'sufficient'
  },
  {
    'name': 'password',
    'usage': 'required'
  }
];

Auth.statuses = [
  'auth1', 'auth2', 'nodevice', 'locked', 'outofarea', 'stale', 'active', 'unassigned'
];

var PinSchema = mongoose.Schema({
  'enabled': {'type': Boolean, 'default': true},
  'name': {
    'type': String,
    'required': true,
    'unique': true
  },
  'icon': { 'type': String },
  'tags': { 'type': Array },
  'pin': {
    'type': String,
    'required': [true, 'Numeric PIN of 4 or more digits required'],
    'unique': true,
    'set': function (v) {
        if (isNaN(v)) {
          return;
        }

        if (String(v).length < 4) {
          return;
        }

        return String(v);
    }
  },
  'devices': { 'type': Array },
  'triggers': { 'type': Array },
  'actions': { 'type': Array },
  'expires': { 'type': Date },
  'last_used': { 'type': Date, 'default': Date.now },
  'created': { 'type': Date, 'default': Date.now }
});

var AuthSchema = mongoose.Schema({
  'name': { 'type': String, 'required': [true, 'Name is required'], 'unique': true },
  'user': { 'type': String, 'required': [true, 'User is required'], 'unique': true },
  'email': { 'type': String, 'required': [true, 'Email is required'], 'unique': true },
  'password': {
    'type': String,
    'required': [true, 'Password must be at least 8 characters'],
    'set': function (v) {
        if (v === '') {
          return;
        }

        if (String(v).length < 8) {
          return;
        }

        return Auth.crypt_password(String(v));
    }
  },
  'locked': {'type': Boolean, 'default': false},
  'last_login': { 'type': Date },
  'created': { 'type': Date, 'default': Date.now }
});

var TokenSchema = mongoose.Schema({
  'user': { 'type': String, 'required': true },
  'client_token': { 'type': String, 'required': true, 'unique': false },
  'auth_token': { 'type': String, 'required': true, 'unique': true },
  'created': { 'type': Date, 'default': Date.now },
  'status': { 'type': String },
  'ip': {'type': String},
  'agent': {},
  'device': {'type': String },
  'locked': {'type': Boolean, 'default': false},
  'last_used': { 'type': Date},
  'locale': {},
  'expires': { 'type': Date, 'required': true }
});

Auth.token_cleaner = function () {

  log.debug('Starting cleanup of expire tokens');
  Auth.tokens.remove({'expires': {'$lt': new Date()}}, function (err, results) {
    if (err) {
      log.error('Erroring cleaning expire tokens: %s', err);
      return;
    }

    if (results.n === 0) {
      log.debug('No tokens removed');
    } else {
      log.info('Removed %s expired tokens', results.result.n);
    }
  });

};

Auth.update_pin_cache = function () {
  Auth.query_pins().then(function (pins) {
    Auth.pin_cache = pins;
  });
};

Auth.pins_by_name = function () {
  var result = {};

  Auth.pin_cache.forEach(function (pin) {
    result[pin.name] = pin;
  });

  return result;
};

Auth.query_pins = function (filter, options) {
  var defer = q.defer();

  filter = filter || {};
  options = options || {'sort': {'timestamp': -1}};

  Auth.pins.find(filter, null, options)
  .select('-pin')
  .exec(function (err, pins) {
    if (err) {
      defer.reject(err);
      return;
    }

    //Add each trigger to the _Devices array
    defer.resolve(pins.reverse());
  });

  return defer.promise;
};

Auth.create_pin = function (data) {

  var defer = q.defer(),
    pin = new Auth.pins(data);

  pin.save( function (err) {
    if (err) {
      log.error('Failed to create pin');
      log.debug(err.message || err);

      err.fields = {};

      if (err.errors) {
        Object.keys(err.errors).forEach(function (key) {
          err.fields[key] = err.errors[key].message;
        });
      }

      defer.reject({'status': 'failed', 'message': err.message, 'fields': err.fields});
      return defer.promise;
    }

    log.debug('Pin created: ', pin._id);
    defer.resolve(pin);
    Auth.update_pin_cache();
  });

  return defer.promise;
};

Auth.get_pin = function (id) {
  var defer = q.defer();

  Auth.pins.findOne({'_id': id})
  .exec(function (err, pin) {
    if (err) {
      defer.reject(err);
      return;
    }

    if (!pin) {
      defer.reject({'code': 404, 'status': 'failed', 'message': 'Record not found'});
      return;
    }

    //Add each trigger to the _Devices array
    defer.resolve(pin);
  });

  return defer.promise;
};

Auth.check_pin = function (pin) {
  var defer = q.defer();
  var query = {
    'pin': String(pin)
  };

  Auth.pins.findOne(query, function (err, pin) {
    if (err) {
      defer.reject(err);
      return;
    }

    if (!pin) {
      defer.reject({'status': 'failed', 'message': 'Invalid PIN'});
      return;
    }

    //If we have any actions, fire them off now
    if (pin.actions && pin.actions.length > 0) {
      log.info('Firing Unlock Actions for Pin: %s', pin.name);
      abode.triggers.fire_actions(pin.actions);
    }

    defer.resolve(pin);
  });

  return defer.promise;
};

PinSchema.methods.enable = function () {
  return Auth.enable_pin(this._id);
};

PinSchema.methods.is_enabled = function () {
  return (this._enabled === true);
};

PinSchema.methods.is_disabled = function () {
  return (this._enabled === false);
};

Auth.enable_pin = function (id) {
  return Auth.update_pin(id, {'enabled': true});
};

Auth.disable_pin = function (id) {
  return Auth.update_pin(id, {'enabled': false});
};

Auth.update_pin = function (id, data) {
  var defer = q.defer();

  Auth.get_pin({'_id': id}).then(function (pin) {
    var old_devices = JSON.parse(JSON.stringify(pin.devices));
    var old_pin = JSON.parse(JSON.stringify(pin));

    Object.keys(data).forEach(function (key) {
      pin[key] = data[key];
    });

    pin.save(function (err) {
      if (err) {
        log.error('Failed to create pin');
        log.debug(err.message || err);

        err.fields = {};

        if (err.errors) {
          Object.keys(err.errors).forEach(function (key) {
            err.fields[key] = err.errors[key].message;
          });
        }

        defer.reject({'status': 'failed', 'message': err.message, 'fields': err.fields});
        return defer.promise;
      }

      if (old_pin.enabled !== pin.enabled && pin.enabled) {
        abode.events.emit('ENABLED', {'type': 'pin', 'name': pin.name, 'object': pin});
      } else if (old_pin.enabled !== pin.enabled && !pin.enabled) {
        abode.events.emit('DISABLED', {'type': 'pin', 'name': pin.name, 'object': pin});
      }

      Auth.update_pin_cache();

      Auth.update_pin_devices(pin, old_devices, pin.devices).then(function () {
        delete pin.pin;
        defer.resolve(pin);
        log.debug('Pin saved: ', pin._id);
      }).fail(function (err) {
        defer.reject({'status': 'failed', 'message': err.message, 'fields': err.fields});
      });
    });

  }, function () {
    defer.reject({'code': 404, 'message': 'Record not found'});
  });

  return defer.promise;
};

Auth.delete_pin = function (id) {
  var defer = q.defer();

  // Lookup the pin
  Auth.get_pin({'_id': id}).then(function (pin) {

    // Remove the pin from any associated devices
    Auth.update_pin_devices(pin, pin.devices, []).then(function () {

      // Finally remove the pin
      Auth.pins.remove({'_id': id}, function (err, report) {
        if (err) {
          defer.reject({'status': 'failed', 'message': err.message});
          return defer.promise;
        }

        if (report.result.n === 0) {
          defer.reject({'code': 404, 'status': 'failed', 'message': 'Record not found'});
          return;
        }

        defer.resolve(report);
        Auth.update_pin_cache();
      });

    }).fail(function (err) {
      defer.reject({'status': 'failed', 'message': err.message, 'fields': err.fields});
    });

  }, function () {
    defer.reject({'code': 404, 'message': 'Record not found'});
  });

  return defer.promise;
};

Auth.update_pin_devices = function (pin, old_devices, new_devices) {
  var deletes = [],
    defer = q.defer();

  // Determine where we need to delete pins
  old_devices.forEach(function (old_device) {
    // Look for a new device that matches this old device
    var matches = new_devices.filter(function (new_device) {
      return (old_device.device._id === new_device.device._id && old_device.user === new_device.user);
    });

    // If no matches found, add to our delete list
    if (matches.length === 0) {
      deletes.push(old_device);
    }
  });

  // Get the actual devices for objects to be deleted
  deletes = deletes.map(function (device) {
    return {'user': device.user, 'device': abode.devices.get(device.device._id)};
  });

  // Filter out any missing devices
  deletes = deletes.filter(function (device) {
    return (device.device);
  });

  // Delete pin from old devices
  deletes = deletes.map(function (device) {
    return device.device.delete_code(device.user);
  });

  // Wait for the deletes to complete
  q.allSettled(deletes).then(function () {
    // Get the actual devices for objects to be updated
    var updates = new_devices.map(function (device) {
      return {'user': device.user, 'device': abode.devices.get(device.device._id)};
    });

    updates = updates.map(function (device) {
      if (pin.enabled) {
        return device.device.enable_code(device.user, pin.pin);
      } else {
        return device.device.disable_code(device.user);
      }
    });

    q.allSettled(updates).then(function () {
      defer.resolve();
    });
  });

  return defer.promise;
};

TokenSchema.methods.assign_device = function (id, address) {
  var self = this,
    defer = q.defer();

  if (self.status !== 'active' && self.status !== 'nodevice' && self.status !== 'unassigned') {
    defer.reject({'status': 'failed', 'message': 'Token must be either of status active or nodevice: ' + self.status, 'http_code': 403});
    return defer.promise;
  }

  abode.devices.model.findOne({'_id': id, 'capabilities': 'client'}, function (err, device) {
    if (!device) {
      defer.reject({'status': 'failed', 'message': 'Device not found or does not have the correct capability', 'http_code': 404});
      return;
    }

    Auth.tokens.update({'device': device._id, '_id': {$ne: self._id}}, { $unset: {'device': 1}, 'status': 'unassigned'}, function (err) {
      if (err) {
        defer.reject({'status': 'failed', 'message': 'Error unassigning device from other tokens', 'details': err});
        return;
      }

      self.device = device._id;
      self.status = 'active';
      if (device.provider === 'rad') {
        device.active = true;
        device.markModified('config');
        device.config = device.config || {};
        device.config.token = hat(512, 32);
        if (address) {
          device.config.address = address;
        }
        device._save(undefined, {'skip_pre': true}).then(function () {
          var dumb_device = abode.devices.get(device._id);
          dumb_device.config = device.config;
          self.save(function (err) {
            if (err) {
              defer.reject(err);
              return;
            }

            defer.resolve({'status': 'success', 'message': 'Device assigned to token', 'token': device.config.token});
          });
        }, function (err) {
          defer.reject(err);
        });

      } else {

        self.save(function (err) {
          if (err) {
            defer.reject(err);
            return;
          }

          defer.resolve({'status': 'success', 'message': 'Device assigned to token'});
        });
      }

    });

  });


  return defer.promise;
};

TokenSchema.methods.get_device = function () {
  var self = this,
    defer = q.defer();

  abode.devices.model.findOne({'_id': self.device}, function (err, device) {
    if (!device) {
      defer.reject({'status': 'failed', 'message': 'Device not found', 'http_code': 404});
      return;
    }

    defer.resolve(device);
  });

  return defer.promise;
};

TokenSchema.methods.create_device = function (config) {
  var self = this,
    defer = q.defer();

  config.capabilities = config.capabilities || [];

  if (config.capabilities.indexOf('client') === -1) {
    defer.reject({'status': 'failed', 'message': 'Device must be of capability client'});
    return defer.promise;
  }

  abode.devices.create(config).then(function (device) {
    self.assign_device(device._id).then(function (response) {
      defer.resolve(response);
    }, function (err) {
      device.delete();
      defer.reject(err);
    });
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Auth.crypt_password = function (password) {

  return (password === undefined) ? undefined : crypto.createHmac('sha256', config.secret).update(password).digest('hex');

};

Auth.list = function (filter, options) {
  var defer = q.defer();

  filter = filter || {};

  Auth.model.find(filter, null, options)
  .select('-password')
  .exec(function (err, users) {
    if (err) { defer.reject(err); return; }

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
      log.error('Failed to create user');
      log.debug(err.message || err);

      err.fields = {};

      if (err.errors) {
        Object.keys(err.errors).forEach(function (key) {
          err.fields[key] = err.errors[key].message;
        });
      }

      defer.reject({'status': 'failed', 'message': err.message, 'fields': err.fields});
      return defer.promise;
    }

    log.info('User created: ', config.name);
    delete user.password;
    defer.resolve(user);
  });

  return defer.promise;
};

Auth.get = function (id) {
  var defer = q.defer();

  Auth.model.findOne({'_id': id})
  .select('-password')
  .exec(function (err, user) {
    if (err) {
      defer.reject(err);
      return;
    }

    if (!user) {
      defer.reject({'code': 404, 'status': 'failed', 'message': 'Record not found'});
      return;
    }

    defer.resolve(user);
  });

  return defer.promise;
};

Auth.update = function (id, data) {
  var defer = q.defer();

  Auth.get({'_id': id}).then(function (user) {
    Object.keys(data).forEach(function (key) {
      user[key] = data[key];
    });

    user.save(function (err) {
      if (err) {
        log.error('Failed to update user');
        log.debug(err.message || err);

        err.fields = {};

        if (err.errors) {
          Object.keys(err.errors).forEach(function (key) {
            err.fields[key] = err.errors[key].message;
          });
        }

        defer.reject({'status': 'failed', 'message': err.message, 'fields': err.fields});
        return defer.promise;
      }

      log.debug('User saved: ', user._id);
      delete user.password;
      defer.resolve(user);
    });

  }, function () {
    defer.reject({'code': 404, 'message': 'Record not found'});
  });

  return defer.promise;
};

Auth.delete = function (id) {
  var defer = q.defer();

  Auth.get(id).then(function (user) {

    Auth.model.remove({'_id': id}, function (err, report) {
      if (err) {
        defer.reject({'status': 'failed', 'message': err.message});
        return defer.promise;
      }

      Auth.delete_token(undefined, user.user);

      if (report.result.n === 0) {
        defer.reject({'code': 404, 'status': 'failed', 'message': 'Record not found'});
        return;
      }

      defer.resolve(report);
    });

  }, function (err) {
    defer.reject(err);
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

      Auth.gen_token(data.user).then(function (token) {
        results[0].client_token = token.client_token;
        results[0].auth_token = token.auth_token;
        results[0].expires = token.expires;

        defer.resolve(results[0]);
      }, function () {
        defer.reject();
      });
    } else {
      defer.reject();
    }
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Auth.gen_token = function (user, expires, status, device, ip, agent_raw) {


  var token,
    defer = q.defer(),
    token_expiration = new Date();

  var agent = useragent.parse(agent_raw);
  agent = agent.toJSON();
  agent.source = agent_raw;

  var geo = geoip.lookup(ip);
  geo = geo || {};

  expires = expires || abode.config.expire_logins || 1;
  token_expiration.setDate(token_expiration.getDate() + expires);

  token = new Auth.tokens({
    'client_token': hat(256, 16),
    'auth_token': hat(512, 32),
    'expires': token_expiration,
    'user': user,
    'device': device,
    'status': status,
    'ip': ip,
    'locale': geo,
    'agent': agent
  });

  token.save( function (err) {
    if (err) {
      log.error(err.message || err);
      defer.reject(err);
      return defer.promise;
    }

    log.info('Token created: ', token._id);
    defer.resolve(token);
  });

  return defer.promise;
};

Auth.check_token = function (client_token, auth_token) {
  var defer = q.defer();

  var search = {
    'client_token': client_token,
    'auth_token': auth_token,
    'expires': {'$gt': new Date()}
  };

  Auth.tokens.find(search, function (err, tokens) {
    if (err) { defer.reject(err); return; }

    if (tokens.length === 0) {
      defer.reject();
      return;
    }

    defer.resolve(tokens[0]);
  });

  return defer.promise;
};

Auth.check = function (client_token, auth_token) {
  var defer = q.defer();

  Auth.check_token(client_token, auth_token).then(function (token) {

    defer.resolve(token);

  }, function () {
    defer.reject({'status': 'unauthenticated', 'http_code': 401});
  });

  return defer.promise;
};

Auth.password = function (config) {
  var defer = q.defer();
  var search = {
    'user': config.user,
    'password': Auth.crypt_password(config.password)
  };

  log.debug('Attempting password auth for user: %s', config.user);

  Auth.list(search, '-password -__v -created').then(function (results) {
    if (results.length > 0) {
      log.info('Password authentication successful: %s', config.user);
      defer.resolve(results[0]);
    } else {
      try {
      log.warn('Password authentication unsuccessful: %s', config.user);
      } catch (e) {
        console.log(e);
      }
      defer.reject();
    }
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Auth.ip = function (data) {
  var ip = data.ip,
    allowed = false,
    defer = q.defer();

  if (ip === '::1') {
    allowed = true;
  } else {

    abode.config.allow_networks.forEach(function (net) {

      allowed = (addr(net).contains(addr(ip))) ? true : allowed;

    });

  }

  if (allowed) {
    defer.resolve();
  } else {
    defer.reject();
  }

  return defer.promise;
};

Auth.new_login = function (data, methods) {
  var index = 0,
    identity = {},
    authenticated = 0,
    defer = q.defer();

  var done = function () {
    //If we dont have any successful authentications, fail
    if (authenticated === 0 || authenticated === false) {
      defer.reject({'status': 'failure', 'message': 'Authentication failure'});
      return;
    }

    var status,
      user = identity.user || config.default_user;

    //Determine out authentication stats
    if (authenticated < config.min_auth) {
      status = 'auth' + authenticated;
    } else if (identity.outofarea === true) {
      status = 'outofarea';
    } else if (identity.changepw === true) {
      status = 'changepw';
    } else if (identity.device === undefined) {
      status = 'nodevice';
    } else {
      status = 'active';
    }

    //Build an auth token
    Auth.gen_token(user, undefined, status, identity.device, data.ip, data.agent).then(function (token) {
      log.debug(token);
      defer.resolve({'status': status, 'token': token, 'identity': identity});
    }, function (err) {
      defer.reject(err);
    });
  };

  var next = function (methods) {
    var method = Auth.methods[index];
    index += 1;

    if (methods !== undefined && methods.indexOf(method.name) === -1) {
      log.debug('Method not requested, skipping: %s', method.name);
      next();
      return;
    }

    if (!method) {
      log.debug('Finished all authentications methods');
      done();
      return;
    }

    if (!Auth[method.name]) {
      log.debug('Could not find authentication method: %s', method.name);
      next();
      return;
    }

    if (!data[method.name]) {
      log.debug('Auth provider data no present in request: %s', method.name);
      next();
      return;
    }

    //Attempt our authentication
    Auth[method.name](data).then(function (response) {
      //If we succeeded, set  authenticated to true
      authenticated += 1;

      //If we have response data, set our identity
      if (response !== undefined) {
        identity = response;
      }
      
      //If the method is sufficient, complete authentication
      if (method.usage === 'sufficient') {
        authenticated = config.min_auth;
        done();
        return;
      }

      //Otherwise, move to next method
      next();
    }, function () {
      //If method is required, fail authenitcation and finish
      if (method.usage === 'required') {
        authenticated = 0;
        done();
        return;
      }

      //Otherwise, move to next method
      next();
    });
  };

  if (methods !== undefined && methods instanceof Array === false) {
    methods = [methods];
  }

  next(methods);

  return defer.promise;
};

Auth.devices = function () {
  var defer = q.defer();

  abode.devices.model.find({'capabilities': 'client'}, function (err, devices) {
    if (err) {
      defer.reject(err);
      return;
    }

    defer.resolve(devices);
  });

  return defer.promise;
};

Auth.assign = function () {
  var defer = q.defer();

  defer.reject({});

  return defer.promise;
};

Auth.list_tokens = function (filter, options) {
  var defer = q.defer();

  filter = filter || {};

  Auth.tokens.find(filter, null, options)
  .select('-auth_token')
  .exec(function (err, tokens) {
    if (err) { defer.reject(err); return; }

    defer.resolve(tokens);
  });

  return defer.promise;
};

Auth.get_token = function (id, user) {
  var defer = q.defer();
  var filter = {'_id': id};

  if (user) {
    filter.user = user;
  }

  Auth.tokens.findOne(filter)
  .select('-auth_token')
  .exec(function (err, token) {
    if (err) {
      defer.reject(err);
      return;
    }

    if (!token) {
      defer.reject({'code': 404, 'status': 'failed', 'message': 'Record not found'});
      return;
    }

    defer.resolve(token);
  });

  return defer.promise;
};

Auth.delete_token = function (id, user) {
  var defer = q.defer();
  var filter = {};

  if (id) {
    filter._id = id;
  }

  if (user) {
    filter.user = user;
  }

  if (user === undefined && id === undefined) {
    defer.reject({'code': 400, 'status': 'failed', 'message': 'No token specified'});
    return defer.promise;
  }

  Auth.tokens.remove(filter, function (err, report) {
    if (err) {
      defer.reject({'status': 'failed', 'message': err.message});
      return defer.promise;
    }

    if (report.result.n === 0) {
      defer.reject({'code': 404, 'status': 'failed', 'message': 'Record not found'});
      return;
    }

    defer.resolve();
  });

  return defer.promise;
};

Auth.model = mongoose.model('Auth', AuthSchema);
Auth.tokens = mongoose.model('Tokens', TokenSchema);
Auth.pins = mongoose.model('Pins', PinSchema);

module.exports = Auth;
