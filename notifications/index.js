'use strict';

var abode;
var routes;
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('notifications');
var mongoose = require('mongoose');

var ActionsSchema = mongoose.Schema({
  'title': {'type': String, 'required': true},
  'type': {'type': String, 'required': true},
  'name': {'type': String, 'required': true},
  'icon': {'type': String, 'required': true},
  'action': {'type': String, 'required': true},
  'args': {'type': Array},
});

var NotificationsSchema = mongoose.Schema({
  'name': {'type': String, 'unique': true, 'required': true},
  'active': {'type': Boolean, 'default': false},
  'message_vars': {'type': Object},
  'message': {'type': String, 'required': true},
  'actions': [ActionsSchema],
  'triggers': {
    'type': Array,
    'validate': {
      'validator': function(v) {
        var valid = true;
        v = v || [];

        v.forEach(function (v) {
          if (!abode.triggers.get(v)) {
            valid = false;
          }
        });

        return valid;
      },
      'message': '{VALUE} is not a valid thing'
    }
  },
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

  Notifications.checking = false;

  setInterval(Notifications.check, 1000 * 10);
  return true;
};

Notifications.check = function () {
  var defer = q.defer(),
    check_defers = [];

  if (Notifications.checking) {
    return;
  }

  Notifications.checking = true;

  log.debug('Checking notifications');
  Notifications.query({'active': true}).then(function (records) {

    records.forEach(function(record) {
      log.debug('Checking notification: ' + record.name);
      var active = false;
      var check_defer = q.defer();
      var trigger_defers = [];
      check_defers.push(check_defer.promise);


      log.debug('Checking if notification is still active: ' + record.name);
      //Check each notification trigger
      record.triggers.forEach(function (id) {
        var trigger_defer = q.defer(),
          trigger = abode.triggers.get(id);

        log.debug('Checking if trigger is still matching: ' + trigger.name);
        trigger_defers.push(trigger_defer.promise);

        trigger.check().then(function () {
          active = true;
          trigger_defer.resolve();
        }, function () {
          trigger_defer.reject();
        });

      });

      //Once all our checks are complete see if we are still active
      q.allSettled(trigger_defers).then(function () {
        log.debug('All triggers checked for notification: ' + record.name);
        if (!active) {
          log.debug('De-activating notification: ' + record.name);
          Notifications.deactivate(record._id).then(function () {
            check_defer.resolve();
          }, function () {
            check_defer.reject();
          })
        } else {
          check_defer.resolve();
        }
      });

    });

    q.allSettled(check_defers).then(function () {
      Notifications.checking = false;
    });

  }, function (err) {
    Notifications.checking = false;
    defer.reject(err);
  });

  return defer.promise;
};

NotificationsSchema.post('save', function (record, next) {
  var trigger_defers = [];

  record.triggers.forEach(function (id) {
    var trigger = abode.triggers.get(id);
    var defer = q.defer();
    trigger_defers.push(defer.promise);

    if (trigger.notifications.indexOf(record._id) === -1) {


      trigger.notifications.push(record._id);

      trigger._save().then(function () {
        log.debug('Added notification to trigger: ' + trigger._id);
        defer.resolve();
      }, function (err) {
        defer.reject();
      });

    } else {
      defer.resolve();
    }

  });

  q.allSettled(trigger_defers).then(function () {
    console.log('here');
    next();
  });

});

NotificationsSchema.methods.render = function () {

  var self = this;

  self.message_vars = self.message_vars || {};
  Object.keys(self.message_vars).forEach(function (key) {
    self.message = self.message.replace('{{' + key + '}}', self.message_vars[key]);
  });

  return self.message;
};

NotificationsSchema.methods.add_action = function (action) {
  var self = this,
    defer = q.defer();


  action._id = mongoose.Types.ObjectId();
  self.actions.push(action);

  self.save(function (err) {
    if (err) {
      log.error('Error adding action to notification: ', err);
      defer.reject(err);
      return;
    }

    log.debug('Notification Saved: ', self._id);
    defer.resolve(action);
  });

  return defer.promise;
};

NotificationsSchema.methods.delete_action = function (action) {
  var self = this,
    defer = q.defer();


  self.actions.pull({'_id': action});

  self.save(function (err) {
    if (err) {
      log.error('Error removing action to notification: ', err);
      defer.reject(err);
      return;
    }

    log.debug('Notification Saved: ', self._id);
    defer.resolve(action);
  });

  return defer.promise;
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

NotificationsSchema.methods.add_trigger = function (config) {

  var self = this,
    defer = q.defer();
  var trigger = abode.triggers.get(config._id);

  var save = function () {
    //Add device to room
    self.triggers.push(trigger._id);

    //Save the room
    self.save(function (err) {
      if (err) {
        log.error('Failed to add trigger');
        log.debug(err.message || err);

        defer.reject({'status': 'failed', 'message': 'Failed to add trigger', 'error': err});
        return;
      }

      log.info('Trigger added: ', trigger._id);

      defer.resolve({'_id': trigger._id});
    });
  };

  if (!trigger) {
    defer.reject({'status': 'failed', 'message': 'Trigger not found'});
    return defer.promise;
  }

  //Check if trigger is already added
  if (self.triggers.indexOf(trigger._id) > -1 ) {
    msg = 'Trigger already exists';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
    return defer.promise;
  }

  //Add trigger to notification if not already added
  if (trigger.notifications.indexOf(self._id) === -1 ) {
    trigger.notifications.push(self._id);

    trigger._save().then(function () {
      save();
    }, function (err) {
      log.error('Error adding notification to trigger: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  defer.resolve();

  return defer.promise;

};

NotificationsSchema.methods.get_trigger = function (id) {
  var self = this,
    defer = q.defer(),
    trigger = abode.triggers.get(id);

  if (self.triggers.indexOf(id) === -1 || !trigger) {
    defer.reject({'status': 'failed', 'message': 'Trigger not found'});
    console.log('here');
    return defer.promise;
  }

  defer.resolve(trigger);

  return defer.promise;
};

NotificationsSchema.methods.list_triggers = function () {
  var self = this,
    defer = q.defer();


  abode.triggers.model.find({'_id': {'$in': self.triggers}}).then(function (results) {
    defer.resolve(results);
  }, function (err) {
    defer.reject(err);
    console.log(err);
  });

  return defer.promise;
};

NotificationsSchema.methods.delete_trigger = function (id) {
  var self = this,
    defer = q.defer(),
    trigger = abode.triggers.get(id);

  var save = function () {
    //Add device to room
    self.triggers.splice(self.triggers.indexOf(trigger._id), 1);

    //Save the room
    self.save(function (err) {
      if (err) {
        log.error('Failed to delete trigger');
        log.debug(err.message || err);

        defer.reject({'status': 'failed', 'message': 'Failed to delete trigger', 'error': err});
        return;
      }

      log.info('Trigger deleted: ', trigger._id);

      defer.resolve();
    });
  };

  if (self.triggers.indexOf(id) === -1 || !trigger) {
    defer.reject({'status': 'failed', 'message': 'Trigger not found'});
    return defer.promise;
  }

  //Remove room from device if exists
  if (trigger.notifications.indexOf(self._id) > -1 ) {
    trigger.notifications.splice(trigger.notifications.indexOf(self._id), 1);

    trigger._save().then(function () {
      save();
    }, function (err) {
      log.error('Error removing notification from trigger: ', err);
      return defer.reject(err);
    });

  } else {
    save();
  }

  return defer.promise;
};

Notifications.model = mongoose.model('Notifications', NotificationsSchema);

Notifications.query = function (config) {
  var defer = q.defer();
  config = config || {};

  Notifications.model.find(config, function (err, results) {
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

  body = body || {};

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
      log.info('Notification activated: ' + response.name);

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
      log.info('Notification de-activated: ' + response.name);
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