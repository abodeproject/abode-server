'use strict';

var abode;
var routes;
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('notifications');
var mongoose = require('mongoose');

var ActionsSchema = mongoose.Schema({
  'title': {'type': String, 'required': true},
  'name': {'type': String, 'required': true},
  'args': {'type': Array, 'default': []}
});

var NotificationsSchema = mongoose.Schema({
  'name': {'type': String, 'unique': true, 'required': true},
  'active': {'type': Boolean, 'default': false},
  'message_vars': {'type': Object},
  'message': {'type': String, 'required': true},
  'actions': [ActionsSchema],
  'expires': {'type': Date},
  'active_date': {'type': Date},
  'active_last': {'type': Date},
  'updated': { 'type': Date, 'required': true, 'default': Date.now },
  'created': { 'type': Date, 'default': Date.now },
});

// Define our main Rooms object
var Notifications = function () {
  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/api/notifications', routes);
  log.info('Started Notifications');

  return true;
};

NotificationsSchema.methods.render = function () {

  var self = this;

  self.message_vars = self.message_vars || {};
  Object.keys(self.message_vars).forEach(function (key) {
    self.message = self.message.replace('{{' + key + '}}', self.message_vars[key]);
  });

  return self.message;
};

NotificationsSchema.methods.do_action = function (id) {

  var action,
    self = this,
    defer = q.defer();

  action = self.actions.filter(function (item) {
    return (String(item._id) === String(id));
  });


  if (action.length === 0) {
    defer.reject({'status': 'failed', 'message': 'Action not found'});
    return defer.promise;
  }

  action = action[0];
  abode.triggers.fire_actions([action]);

  defer.resolve({'stauts': 'success'});

  return defer.promise;
};

Notifications.model = mongoose.model('Notifications', NotificationsSchema);

Notifications.query = function () {
  var defer = q.defer();

  Notifications.model.find({}, function (err, results) {
    if (err) {
      defer.reject(err);
      return;
    }

    defer.resolve(results);
  });

  return defer.promise;
};

Notifications.create = function (data) {
  var defer = q.defer(),
    notification = new Notifications.model(data);

  // Create the new notification
  notification.save( function (err) {
    if (err) {
      log.error('Failed to create notification');
      log.debug(err.message || err);

      defer.reject({'status': 'failed', 'message': 'Failed to create notification', 'error': err});
      return defer.promise;
    }

    log.info('Notification created: ', notification._id);

    defer.resolve(notification);
  });

  return defer.promise;
};

Notifications.get = function (id) {
  var defer = q.defer();

  Notifications.model.findOne({'_id': id}, function (err, result) {
    if (err || result === null) {
      defer.reject({'status': 'failed', 'message': 'Record not found', 'http_code':404});
      return;
    }

    defer.resolve(result);
  });

  return defer.promise;
};

Notifications.update = function (id, data) {
  var defer = q.defer();

  Notifications.get(id).then(function (record) {
    Object.keys(data).forEach(function (key) {
      record[key] = data[key];
    });

    record.save(function (err) {
      if (err) {
        log.error('Error saving notification: ', err);
        defer.reject(err);
        return;
      }

      log.debug('Notification Saved: ', record._id);
      defer.resolve(record);
    });
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Notifications.delete = function (id) {
  var defer = q.defer();

  Notifications.get(id).then(function (record) {

    record.remove(function (err) {
      if (err) {
        log.error('Error deleting notification: ', err);
        defer.reject(err);
        return;
      }

      log.debug('Notification Deleted: ', id);
      defer.resolve();
    });

  }, function (err) {
    defer.reject(err)
  })

  return defer.promise;
};

Notifications.activate = function (id, body) {
  var data = {},
    defer = q.defer();

  Notifications.get(id).then(function (record) {

    data.active = true;
    data.message_vars = body.message_vars;
    data.active_date = new Date();
    if (!body.expires) {
      data.expires = new Date();
      data.expires.setDate(data.expires.getDate() + 1);
    }
    data.expires = (body.expires) ? new Date(body.expires) : new Date();

    Notifications.update(id, data).then(function (record) {
      var response = {'_id': record.id, 'name': record.name, 'message': record.render(), 'expires': data.expires, 'actions': record.actions};
      abode.events.emit('NOTIFICATION_ACTIVATED', response);

      response.status = 'success';
      response.message = 'Notification Activated';
      defer.resolve(response);
    }, function (err) {
      defer.reject(err);
    });

  }, function (err) {
    defer.reject(err)
  });

  return defer.promise;
};

Notifications.deactivate = function (id, body) {
  var data = {},
    defer = q.defer();

  Notifications.get(id).then(function (record) {

    data.active = false;
    data.message_vars = undefined;
    data.active_last = record.active_date;
    data.active_date = undefined;
    data.expires = undefined;


    Notifications.update(id, data).then(function () {
      var response = {'_id': record.id, 'name': record.name};
      abode.events.emit('NOTIFICATION_DEACTIVATED', response);

      response.status = 'success';
      response.message = 'Notification De-Activated';
      defer.resolve(response);
    }, function (err) {
      defer.reject(err);
    });

  }, function (err) {
    defer.reject(err)
  });

  return defer.promise;
};

Notifications.render = function (id) {
  var data = {},
    defer = q.defer();

  Notifications.get(id).then(function (record) {

    defer.resolve(record.render());

  }, function (err) {
    defer.reject(err)
  });

  return defer.promise;
};

Notifications.do_action = function (id, actionid) {
  var data = {},
    defer = q.defer();

  Notifications.get(id).then(function (record) {

    record.do_action(actionid).then(function (results) {
      defer.resolve(results);
    }, function (err) {
      defer.reject(err);
    });

  }, function (err) {
    defer.reject(err)
  });

  return defer.promise;
};

module.exports = Notifications;
