'use strict';

var abode;
var routes;
var q = require('q');
var hat = require('hat');
var logger = require('log4js'),
  log = logger.getLogger('events');
var mongoose = require('mongoose');
var webPush = require('web-push');

var EventsSchema = mongoose.Schema({
  'timestamp': {'type': Number, 'required': true},
  'event': {'type': Object, 'required': true},
  'created': { 'type': Date, 'default': Date.now, expires: 1000 * 60 * 60  },
});

// Define our main Rooms object
var EventFeed = function () {
  abode = require('../abode');
  routes = require('./routes');

  abode.web.server.use('/api/events', routes);

  setInterval(EventFeed.event_heartbeat, 1000 * abode.config.hearbeat_interval);
  log.debug('Started Events');

  return true;
};

EventFeed.clients = [];
EventFeed.model = mongoose.model('Events', EventsSchema);

EventFeed.event_heartbeat = function () {
  EventFeed.clients.forEach(function (res) {
    var d = new Date();
    var message = {
      'event': 'HEARTBEAT',
      'type': 'abode',
      'name': 'heartbeat',
      'timestamp': new Date(),
      'object': {}
    };

    res.write('id: ' + d.getTime() + '\n');
    res.write('data:' + JSON.stringify(message) + '\n\n'); // Note the extra newline
  });
};

//Load all Triggers from the database
EventFeed.query = function (filter, options) {
  var defer = q.defer();

  filter = filter || {};
  options = options || {'sort': {'timestamp': -1}};

  EventFeed.model.find(filter, null, options, function (err, events) {
    if (err) {
      defer.reject(err);
      return defer.promise;
    }

    //Add each trigger to the _Devices array
    defer.resolve(events.reverse());
  });

  return defer.promise;
};

EventFeed.send = function (data) {
  var timestamp = new Date(),
    timestamp = timestamp.getTime(),
    event = new EventFeed.model({'timestamp': timestamp, 'event': data});

  event.save( function (err) {
    if (err) {
      log.error('Failed to create event');
      log.debug(err.message || err);

      defer.reject({'status': 'failed', 'message': 'Failed to create event', 'error': err});
      return defer.promise;
    }

    log.debug('Event created: ', event._id);
  });

  abode.eventfeed.clients.forEach(function (res) {
    res.write('id: ' + timestamp + '\n');
    res.write('data:' + JSON.stringify(data) + '\n\n'); // Note the extra newline
  });

};

module.exports = EventFeed;
