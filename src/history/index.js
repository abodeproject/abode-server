'use strict';

var abode;
var config, routes;

var q = require('q');
var logger = require('log4js'),
  log = logger.getLogger('history');
var mongoose = require('mongoose');

// Build the History object
var History = function () {
  var defer = q.defer();

  abode = require('../abode');
  routes = require('./routes');

  log.info('Loading history module');
  abode.web.server.use('/api/history', routes);

  config = abode.config.history || {};
  config.enabled = (config.enabled === false) ? false : true;
  config.interval = config.interval || 1;
  config.max_history_age = config.max_history_age || 24;
  
  History.config = config;
  History.enabled = false;
  History.recording = false;
  History.cleaning = false;
  
  if (config.enabled) {
    History.enable();
  }
  
  History.stats();

  defer.resolve();

  return defer.promise;
};

var HistorySchema = mongoose.Schema({
  'type': {
    'type': String,
    'required': true,
    'index': true
  },
  'name': {
    'type': String,
    'required': true,
    'index': true
  },
  'timestamp': {
    'type': Date,
    'required': true,
    'index': true
  },
  '_on': Boolean,
  '_motion': Boolean,
  '_level': Number,
  '_temperature': Number,
  '_humidity': Number,
  '_lumens': Number,
  '_mode': String,
  '_set_point': Number,
  '_battery': Number,
  '_uv': Number,
  '_state': String,
  'locked': Boolean,
  '_low_battery': Boolean,
  '_lumacity': Number,
  '_motion_on': Boolean,
  '_motion_off': Boolean,
  '_doors_open': Boolean,
  '_doors_closed': Boolean,
  '_windows_open': Boolean,
  '_windows_closed': Boolean,
  '_shades_open': Boolean,
  '_shades_closed': Boolean,
  '_conditioning_on': Boolean,
  '_conditioning_off': Boolean,
  '_lights_on': Boolean,
  '_lights_off': Boolean,
  '_appliances_on': Boolean,
  '_appliances_off': Boolean,
  '_fans_on': Boolean,
  '_fans_off': Boolean,
  '_scenes_on': Boolean,
  '_scenes_off': Boolean,
  '_mode_heat': Boolean,
  '_mode_cool': Boolean,
  '_light_on_count': Number,
  '_light_off_count': Number,
  '_appliance_on_count': Number,
  '_appliance_off_count': Number,
  '_fan_on_count': Number,
  '_fan_off_count': Number,
  '_conditioner_on_count': Number,
  '_conditioner_off_count': Number,
  '_motion_sensor_on_count': Number,
  '_motion_sensor_off_count': Number,
  '_window_on_count': Number,
  '_window_off_count': Number,
  '_door_on_count': Number,
  '_door_off_count': Number,
  '_shade_on_count': Number,
  '_shade_off_count': Number,
  '_scene_on_count': Number,
  '_scene_off_count': Number,
  '_mode_off_count': Number,
  '_mode_heat_count': Number,
  '_mode_cool_count': Number
});

HistorySchema.index({'type': 1, 'name': 1, 'timestamp': 1});
History.model = mongoose.model('History', HistorySchema);

History.record_map = {
  'devices': [
    '_on',
    '_level',
    '_motion',
    '_temperature',
    '_humidity',
    '_lumens',
    '_mode',
    '_set_point',
    '_battery',
    '_uv',
    'locked',
    'low_battery'
  ],
  'rooms': [
    '_temperature',
    '_humidity',
    '_lumacity',
    '_set_point',
    '_motion_on',
    '_motion_off',
    '_doors_open',
    '_doors_closed',
    '_windows_open',
    '_windows_closed',
    '_shades_open',
    '_shades_closed',
    '_conditioning_on',
    '_conditioning_off',
    '_lights_on',
    '_lights_off',
    '_appliances_on',
    '_appliances_off',
    '_fans_on',
    '_fans_off',
    '_scenes_on',
    '_scenes_off',
    '_mode_heat',
    '_mode_cool',
    '_light_on_count',
    '_light_off_count',
    '_appliance_on_count',
    '_appliance_off_count',
    '_fan_on_count',
    '_fan_off_count',
    '_conditioner_on_count',
    '_conditioner_off_count',
    '_motion_sensor_on_count',
    '_motion_sensor_off_count',
    '_window_on_count',
    '_window_off_count',
    '_door_on_count',
    '_door_off_count',
    '_shade_on_count',
    '_shade_off_count',
    '_scene_on_count',
    '_scene_off_count',
    '_mode_off_count',
    '_mode_heat_count',
    '_mode_cool_count'
  ],
  'scenes': [
    '_on',
    '_state',
  ]
  
};

History.enable = function () {
  var defer = q.defer();
  
  if (History.recorder_interval) {
      clearInterval(History.recorder_interval);
  }
  
  if (History.cleaner_interval) {
      clearInterval(History.cleaner_interval);
  }
  
  log.info('Enabling state history @ %s minute interval', config.interval);
  History.recorder_interval = setInterval(History.state_recorder, config.interval * 60 * 1000);
  History.cleaner_interval = setInterval(History.state_cleaner, config.interval * 60 * 1000);
  History.enabled = true;
  
  defer.resolve({'enabled': History.enabled});
  
  return defer.promise;
};

History.disable = function () {
  var defer = q.defer();
  
  log.info('Disabling state history collection');
  if (History.recorder_interval) {
      clearInterval(History.recorder_interval);
      History.state_interval = undefined;
  }
  
  if (History.cleaner_interval) {
      clearInterval(History.cleaner_interval);
      History.cleaner_interval = undefined;
  }
  
  History.enabled = false;
  defer.resolve({'enabled': History.enabled});
  
  return defer.promise;
};

History.state_cleaner = function () {
  var defer = q.defer();
  
  if (History.cleaning) {
    var msg = 'State cleaner still running since ' + History.cleaning;
    log.warn(msg);
    defer.reject({'message': msg});
    return defer.promise;
  }
  
  var timestamp = new Date();
  timestamp.setHours(timestamp.getHours() - config.max_history_age);
  
  var search = {'timestamp': {'$lt': timestamp}};
  History.cleaning = new Date();
  
  log.debug('Removing state records older then %s', timestamp);
  
  History.model.remove(search, function (err, docs) {
    History.cleaning = false;
    if (err) {
      log.error(err);
      return defer.reject(err);
    }
    
    log.debug('Cleaned %s old records', docs.result.n || 0);
    History.cleaning = false;
    
  });
  
  return defer.promise;
};

History.state_recorder = function () {
  var defer = q.defer();
  var type_defers = [];
  var states = [];
  
  if (History.recording) {
      var msg = 'State recorder still running since ' + History.recording;
      log.warn(msg);
      defer.reject({'message': msg});
      return defer.promise;
  }
  
  log.debug('Starting history state recording');
  History.recording = new Date();
  
  // Iterate through each state type in the record map (devices, rooms, scenes, etc.)
  Object.keys(History.record_map).forEach(function (type) {
    var type_defer = q.defer();
    log.debug('Getting state for %s records', type);
    
    type_defers.push(type_defer.promise);
    
    // Get all records for this record type
    abode[type].model.find(function (err, results) {
      if (err) {
        log.error(err);
        return type_defer.reject(err);
      }
      
      // Iterate over each record
      results.forEach(function (record) {
        log.debug('Recording state for %s %s', type, record.name);
        
        // Build a base record state hash
        var record_state = {
          'type': type,
          'name': record.name,
          'timestamp': new Date()
        };
        
        // Iterate over all keys for this record type and set our state hash
        History.record_map[type].forEach(function (key) {
          record_state[key] = record[key];
        });

        // Add record state to our states array    
        states.push(record_state);
      });
      
      // Resolve our type promise
      log.debug('Finished getting state for %s objects', type);
      type_defer.resolve();
      
    });
    
  });
  
  // Once all state types are finished, process the results
  q.allSettled(type_defers).then(function () {
    // If no states exist to record, complete the run
    if (states.length === 0) {
      History.recording = false;
      log.debug('No states to save');
      return defer.resolve();
    }
    
    //Otherwise do a bulk insert with our states
    History.model.collection.insert(states, {}, function (err, docs) {
      History.recording = false;
    
      if (err) {
        log.error(err);
        return defer.reject(err);
      }
  
      //Update history stats
      History.stats();
      
      log.debug('Saved state for %s records', docs.insertedCount);
      defer.resolve();
    });
    
  });
  
  return defer.promise;
};

History.stats = function () {
  var defer = q.defer();
  
  log.debug('Retrieving history data size');
  
  // Lookup collection stats
  History.model.collection.stats(function(err, results) {
    if (err) {
      log.error(err);
      return defer.reject(err);
    }
    
    // Set our stat size
    History.record_stats = {
      'storageSize': results.storageSize,
      'avgObjSize': results.avgObjSize,
      'recordCount': results.count,
    };
    
    defer.resolve(results);
  });

  return defer.promise;
};

History.get = function (type, name, start, end, limit, page) {
  var defer = q.defer();
  var search = {};
  
  limit = (!limit || limit > 1000) ? 200 : limit;
  
  if (name) {
    search.name = name;
  }
  
  if (type) {
    search.type = type;
  }
  
  if (start) {
    search.timestamp = {
      '$gte': new Date(start)
    };
    
    if (end) {
      search.timestamp['$lte'] = new Date(end);
    }
  }
  
  History.model.find(search)
  .sort({'timestamp': 1})
  .limit(limit)
  .skip(((page || 1) - 1) * limit)
  .exec(function (err, records) {
    if (err) {
      log.error(err);
      return defer.reject({'message': err.message, 'stack': abode.web.show_stack(err.stack)});
    }

    defer.resolve(records);
  });

  return defer.promise;
};

module.exports = History;