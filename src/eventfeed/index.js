'use strict';

var abode;
var routes;
var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('eventfeed');
var mongoose = require('mongoose');

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

  setInterval(EventFeed.event_cleaner, 1000 * 60);
  EventFeed.event_cleaner();

  return true;
};

EventFeed.clients = [];
EventFeed.model = mongoose.model('Events', EventsSchema);


EventFeed.event_cleaner = function () {
  var old_age = new Date();
  old_age.setHours(old_age.getHours() - 1);

  log.debug('Starting cleanup of stale events');
  EventFeed.model.remove({'created': {'$lt': old_age}}, function (err, results) {
    if (err) {
      log.error('Erroring cleaning stale events: %s', err);
      return;
    }

    if (results.n === 0) {
      log.debug('No events removed');
    } else {
      log.info('Removed %s stale events', results.n);
    }
  });
};

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
  var event,
    timestamp = new Date();

  timestamp = timestamp.getTime();
  event = new EventFeed.model({'timestamp': timestamp, 'event': data});

  event.save( function (err) {
    if (err) {
      log.error('Failed to create event');
      log.debug(err.message || err);

      return;
    }

    log.debug('Event created: ', event._id);
  });

  EventFeed.clients.forEach(function (res) {
    res.write('id: ' + timestamp + '\n');
    res.write('data:' + JSON.stringify(data) + '\n\n'); // Note the extra newline
  });

};

EventFeed.initClient = function (req, res) {
  
  // set timeout as high as possible
  req.socket.setTimeout(0);

  // send headers for event-stream connection
  // see spec for more information
  res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
  });
  res.write('\n');
      
};

EventFeed.addClient = function (req, res) {

  // push this res object to our global variable
  abode.eventfeed.clients.push(res);

  req.on('close', function() {
    abode.eventfeed.clients.splice(abode.eventfeed.clients.indexOf(res), 1);
  });

};

module.exports = EventFeed;
