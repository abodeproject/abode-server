'use strict';

var abode,
  routes,
  q = require('q'),
  telnet = require('telnet-client'),
  logger = require('log4js'),
  log = logger.getLogger('lutroncaseta');

var LutronCaseta = function () {
  var defer = q.defer();

  // Get abode
  abode = require('../../abode');

  // Set our routes
  routes = require('./routes');
  abode.web.server.use('/api/lutroncaseta', routes);

  // Build our config
  abode.config.lutroncaseta = abode.config.lutroncaseta || {};
  LutronCaseta.config = abode.config.lutroncaseta;
  LutronCaseta.config.enabled = (LutronCaseta.config.enabled === true) ? true : false;
  LutronCaseta.config.bridge_host = LutronCaseta.config.bridge_host;
  LutronCaseta.config.bridge_port = LutronCaseta.config.bridge_port || 23;
  LutronCaseta.config.username = LutronCaseta.config.username || 'lutron';
  LutronCaseta.config.password = LutronCaseta.config.password || 'integration';
  LutronCaseta.config.timeout = LutronCaseta.config.reconnect_timeout || 60;
  LutronCaseta.config.reconnect_timeout = LutronCaseta.config.reconnect_timeout || 5;
  LutronCaseta.config.message_time = LutronCaseta.config.message_time || 2;
  LutronCaseta.config.queue_interval = LutronCaseta.config.queue_interval || 100;
  LutronCaseta.config.poll_interval = LutronCaseta.config.poll_interval || 60;

  // Build our telnet client
  LutronCaseta.connection = new telnet();
  LutronCaseta.connection.on('ready', LutronCaseta.on_ready);
  LutronCaseta.connection.on('timeout', LutronCaseta.on_timeout);
  LutronCaseta.connection.on('error', LutronCaseta.on_error);
  LutronCaseta.connection.on('close', LutronCaseta.on_close);
  LutronCaseta.connection.on('data', LutronCaseta.on_data);
  LutronCaseta.connection.on('failedlogin', LutronCaseta.on_failedlogin);

  // Set some defaults
  LutronCaseta.connected = false;
  LutronCaseta.queue = [];

  // If we are enabled, start it up
  if (LutronCaseta.config.enabled) {

    log.info('Lutron Caseta provider initialized');
    LutronCaseta.start();

  } else {
    log.info('Lutron Caseta provider not enabled');
  }

  defer.resolve();

  return defer.promise;
};

LutronCaseta.poll = function () {

  // If we are already polling, throw an error
  if (LutronCaseta.polling) {
    log.warn('Poll in progress since %s', LutronCaseta.polling);
    return;
  }

  // Set our polling start time
  LutronCaseta.polling = new Date();

  // Get all lutron devices
  var devices = abode.devices.get_by_provider('lutroncaseta');
  //abode.devices.get_by_providerAsync('lutroncaseta').then(function (devices) {
    var device_defers = [];

    // If no devices found, return
    if (devices.length === 0) {
      log.info('No Lutron Devices to Poll');
      LutronCaseta.polling = false;
      return;
    }

    log.debug('Starting to poll devices');
    devices.forEach(function (device) {
      // Set our device defer and add it to our list
      var device_defer = q.defer();
      device_defers.push(device_defer.promise);

      // If device is not active, do not poll
      if (device.active !== true) {
        device_defer.resolve();
        return;
      }

      // Get status of device
      LutronCaseta.status(device).then(function (data) {
        device_defer.resolve();

        // If we have an update key, set the device staet
        if (data.update) {

          device.set_state(data.update, undefined, {'skip_pre': true, 'skip_post': true});

        }
      });
    });

    // Once all devices polled, set polling flag to false
    q.allSettled(device_defers).then(function () {
      LutronCaseta.polling = false;
    });

  //});

};

LutronCaseta.start = function () {
  var msg,
    defer = q.defer();

  if (!LutronCaseta.connected) {
    msg = 'Provider started';

    // Enable the provider
    LutronCaseta.config.enabled = true;

    // Attempt a connection
    LutronCaseta.connect();

    // Start our queue processor
    LutronCaseta.timer = setInterval(LutronCaseta.queue_processor, LutronCaseta.config.queue_interval);

    // Start our poller
    LutronCaseta.poller = setInterval(LutronCaseta.poll, LutronCaseta.config.poll_interval * 1000);

    log.info(msg);
    defer.resolve({'status': 'success', 'message': msg});
  } else {
    msg = 'Already running';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
  }

  return defer.promise;
};

LutronCaseta.stop = function () {
  var msg,
    defer = q.defer();

  if (LutronCaseta.connected) {
    msg = 'Provider stopped';

    // Disable the provider
    LutronCaseta.config.enabled = false;

    // Stop the queue handler
    clearInterval(LutronCaseta.timer);

    // Stop the queue handler
    clearInterval(LutronCaseta.poller);

    // Disconnect the telnet connection
    LutronCaseta.connection.end();

    log.info(msg);
    defer.resolve({'status': 'success', 'message': msg});
  } else {
    msg = 'Already stopped';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
  }

  return defer.promise;
};

// Hash of error types
LutronCaseta.ERRORS = {
  '1': 'Parameter count mismatch (1)',
  '2': 'Object does not exist (2)',
  '3': 'Invalid action number (3)',
  '4': 'Parameter data out of range (4)',
  '5': 'Parameter data malformed (5)',
  '6': 'Unsupported Command (6)',
};

// Hash of output commands
LutronCaseta.OUTPUT_ACTIONS = {
  '1': 'Set or Get Zone Level',
  '2': 'Start Raising',
  '3': 'Start Lowering',
  '4': 'Stop Raising / Lowering',
  '5': 'Start Flash',
  '6': 'Pulse',
  '9': 'Set or Get Venetian tilt level only',
  '10': 'Set or Get Venetian lift & tilt level',
  '11': 'Start raising Venetian tilt',
  '12': 'Start lowering Venetian tilt',
  '13': 'Stop Venetian tilt',
  '14': 'Start raising Venetian lift',
  '15': 'Start lowering Venetian lift',
  '16': 'Stop Venetian lift',
  '17': 'Set DMX color /  level settings',
  '18': 'Motor Jog Raise',
  '19': 'Motor Jog Lower',
  '20': 'Motor 4-Stage Jog Raise',
  '21': 'Motor 4-Stage Jog Lower',
};

// Hash of output commands
LutronCaseta.DEVICE_ACTIONS = {
  '15': 'Set or Get Zone Lock',
  '16': 'Set or Get Scene Lock',
  '17': 'Set or Get Sequence State',
  '18': 'Start Raising',
  '19': 'Start Lowering',
  '20': 'Stop Raising / Lowering',
  '22': 'Get battery status',
  '23': 'Set a custom lift and tilt level of venetian blinds programmed to the phantom button',
  '24': 'Set a custom lift level only of venetian blinds programmed to the phantom button',
  '25': 'Set a custom tilt level only of venetian blinds programmed to the phantom button',
  '32': 'Hold / Release',
  '34': 'GRAFIK Eye QS Timeclock state',
  '35': 'Query CCI state',
  '36': 'Set or Get Active LED Level',
  '37': 'Set or Get Inactive LED Level',
};

// Hash of output commands
LutronCaseta.GROUP_ACTIONS = {
  '3': 'Get (?) Occupancy Group State',
};

// Command handlers
LutronCaseta.command_handlers = {
  'ERROR': function (parsed, msg) {
    msg.response = LutronCaseta.ERRORS[parsed[3]] || 'Unknown error ' + parsed[3];
  },
  'OUTPUT': function (parsed, msg) {
    msg.action = LutronCaseta.OUTPUT_ACTIONS[parsed[4]];
    msg.integration_id = parsed[3];
    msg.parameters = parsed[5];

    if (!msg.action) {
      msg.response = 'Unknown action ' + parsed[3];
    } else {
      msg.response = msg.action + ' against ' + msg.integration_id + ' with ' + msg.parameters;
    }
  },
  'DEVICE': function (parsed, msg) {
    msg.action = LutronCaseta.DEVICE_ACTIONS[parsed[4]];
    msg.integration_id = parsed[3];
    msg.parameters = parsed[5];

    if (!msg.action) {
      msg.response = 'Unknown action ' + parsed[3];
    } else {
      msg.response = msg.action + ' against ' + msg.integration_id + ' with ' + msg.parameters;
    }
  },
  'GROUP': function (parsed, msg) {
    msg.action = LutronCaseta.DEVICE_ACTIONS[parsed[4]];
    msg.integration_id = parsed[3];
    msg.parameters = parsed[5];

    if (!msg.action) {
      msg.response = 'Unknown action ' + parsed[3];
    } else {
      msg.response = msg.action + ' against ' + msg.integration_id + ' is ' + msg.parameters;
    }
  }
};

// Set our regex for parsing a message
LutronCaseta.message_re = /([~#?])([^,]+),([^,]+),?([^,]+)?,?([^,]+)?,?([^,]+)?\r?/;

LutronCaseta.Message = function (config) {
  var self = this,
    defer = q.defer();

  config = config || {};

  self.message = config.message;
  self.response = config.response;
  self.promise = defer.promise;
  self.defer = defer;

  // If a response was passed, parse it and return
  if (self.response) {
    self.parse(self.response);
    return defer.resolve();
  }

  // If no message was passed, return
  if (!self.message) {
    return defer.reject();
  }

  if (!LutronCaseta.config.enabled) {
    return defer.reject({'status': 'failed', 'message': 'Cannot send message while provider is disabled'});
  }

  // Set timer to expire the message
  self.timer = setTimeout(function () {
    log.warn('Timeout waiting for message: %s', config.message);
    delete LutronCaseta.queue[LutronCaseta.queue.indexOf(self)];
    defer.reject();
  }, LutronCaseta.config.message_time * 1000);

  // Add message to the send queue
  LutronCaseta.queue.push(self);
};

LutronCaseta.Message.prototype.success = function () {
  var self = this;

  //self.response = response;
  self.defer.resolve({'status': 'success', 'message': self.response, 'command': self.message, 'self': self});
  log.debug('Message success:', self.response);
};

LutronCaseta.Message.prototype.error = function (error) {
  var self = this;

  self.error = error;
  self.defer.reject({'status': 'failed', 'message': self.error, 'command': self.message});
  log.error(self.error);
};

LutronCaseta.Message.prototype.parse = function (response) {

  // Get just the first line
  this.response = response.split('\n').shift();

  // Execute the message regex against the message
  this.parsed = LutronCaseta.message_re.exec(this.response);

  // If we did not parse correct, return here
  if (!this.parsed) {
    return;
  }

  // Set our operatino and command
  this.operation = this.parsed[1];
  this.command = this.parsed[2];

  // Look for command handler and run it
  if (LutronCaseta.command_handlers[this.command]) {
    LutronCaseta.command_handlers[this.command](this.parsed, this);
  }

};

LutronCaseta.Message.prototype.send = function () {
  var self = this;

  LutronCaseta.connection.send(self.message, {'waitfor': 'GNET> '}, function (err, response) {

    // Clear the processing flag
    LutronCaseta.processing = false;

    // Clear our timeout timer
    clearTimeout(self.timer);

    // If we got an error, stop here
    if (err) {
      return self.error(err);
    }

    //Parse the response
    self.parse(response);

    // If we did not get a command, error out
    if (!self.command) {
      return self.error('Could not determine message command: ' + self.response);
    }

    // If we got an ERROR command, error out
    if (self.command === 'ERROR') {
      return self.error();
    }

    // Otherwise run message success handler
    return self.success();
  });

};

LutronCaseta.queue_processor = function () {

  // If we are already processing a message, skip this interval
  if (!LutronCaseta.connected) {
    return;
  }

  // If we are already processing a message, skip this interval
  if (LutronCaseta.processing) {
    return;
  }

  // If the queue is empty, skip this interval
  if (LutronCaseta.queue.length === 0) {
    return;
  }

  // Get a message to process
  var msg = LutronCaseta.queue.shift();

  // Set our processing flag to the message
  LutronCaseta.processing = msg;

  // Send the message
  msg.send();

};

LutronCaseta.send = function (msg) {

  // Create a new message
  var message = new LutronCaseta.Message({message: msg});

  return message.promise;
};

LutronCaseta.connect = function () {
  log.debug('Connecting to Bridge: %s:%s', LutronCaseta.config.bridge_host, LutronCaseta.config.bridge_port);

  var params = {
    host: LutronCaseta.config.bridge_host,
    port: LutronCaseta.config.bridge_port,
    timeout: LutronCaseta.config.bridge_port * 1000,
    shellPrompt: 'GNET> ',
    username: LutronCaseta.config.username,
    password: LutronCaseta.config.password,
    ors: '\r\n',
    // removeEcho: 4
  };

  LutronCaseta.connection.connect(params);

};

LutronCaseta.on_ready = function () {
  log.debug('Bridge connection ready');
  LutronCaseta.connected = true;
};

LutronCaseta.on_data = function (data) {

  // If we are processing a message, return
  if (LutronCaseta.processing) {
    return;
  }

  // Create a new message instance with our response
  var message = new LutronCaseta.Message({response: data.toString()});

  // If we did not get a command, error out
  if (!message.command) {
    return message.error('Could not determine message command: ' + message.response);
  }

  // If we got an ERROR command, error out
  if (message.command === 'ERROR') {
    return message.error(message.response);
  }

  log.info('Message received:', message.response);

  // Lookup the integration id
  abode.devices.model.find({'config.integration_id': message.integration_id, 'provider': 'lutroncaseta'}).then(function (device) {

    if (!device) {
      log.warn('Device not found:', message.integration_id);
      return;
    }

    var data = {};
    if (message.parameters !== undefined) {
      data._level = message.parameters;
      data._on = (message.parameters > 0);
    }

    data.last_seen = new Date();
    device.set_state(data);

  }, function (err) {
    log.error('Error looking up device: %s', err);
  });

};

LutronCaseta.on_error = function () {
  log.info('error', arguments);
};

LutronCaseta.on_timeout = function () {
  log.warn('Connection Timed Out', LutronCaseta.config.reconnect_timeout);
};

LutronCaseta.on_close = function () {
  log.warn('Connection Closed.  Reconnecting in %s seconds', LutronCaseta.config.reconnect_timeout);
  LutronCaseta.connected = false;

  // Only reconnect if enabled
  if (LutronCaseta.config.enabled) {
    LutronCaseta.reconnect_timer = setTimeout(LutronCaseta.connect, LutronCaseta.config.reconnect_timeout * 1000);
  }
};

LutronCaseta.on_failedlogin = function () {
  log.info('failedlogin');
};

// 
LutronCaseta.get_status = function (device) {
  var defer = q.defer();

  var cmd = [
    '?OUTPUT',
    device.config.integration_id,
    '1'
  ];

  LutronCaseta.send(cmd.join(',')).then(function (msg) {
    var level = parseInt(msg.self.parameters, 10) ;
    defer.resolve({'response': true, 'update': {'_level': level, '_on': (level > 0)}}); 
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

LutronCaseta.on = LutronCaseta.open = function (device) {
  var defer = q.defer();

  var cmd = [
    '#OUTPUT',
    device.config.integration_id,
    '1',
    '100'
  ];

  LutronCaseta.send(cmd.join(',')).then(function () {
    defer.resolve({'response': true, 'update': {_on: true, _level: 100}});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

LutronCaseta.off = LutronCaseta.close = function (device) {
  var defer = q.defer();

  var cmd = [
    '#OUTPUT',
    device.config.integration_id,
    '1',
    '0'
  ];

  LutronCaseta.send(cmd.join(',')).then(function () {
    defer.resolve({'response': true, 'update': {_on: false, _level: 0}});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

LutronCaseta.set_level = function (device, level, rate) {
  var defer = q.defer();

  var cmd = [
    '#OUTPUT',
    device.config.integration_id,
    '1',
    level,
    rate
  ];

  LutronCaseta.send(cmd.join(',')).then(function () {
    defer.resolve({'response': true, 'update': {_on: (level > 0), _level: level}});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

module.exports = LutronCaseta;
