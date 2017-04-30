'use strict';

var Q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('insteon.modem'),
  inherits = require('util').inherits,
  Message = require('./message'),
  Expectation = require('./expectation'),
  EventEmitter = require('events').EventEmitter,
  SerialPort = require('serialport');

var Modem = function (config) {
  var self = this;

  log.info('Initializing insteon modem');
  self.config = config || {};
  self.config.send_interval = self.config.send_interval || 100;
  self.config.read_interval = self.config.read_interval || 100;
  self.config.message_timeout = self.config.message_timeout || 5000;
  self.config.modem_debug = (self.config.modem_debug !== false);

  self.connected = false;
  self.message = new Message(0);
  self.position = 0;
  self.type = 0;

  self.send_queue = [];
  self.read_queue = [];
  self.expectations = [];

  self.sending = false;
  self.reading = false;

  //Set our log level
  if (self.config.modem_debug) {
    log.setLevel('DEBUG');
    logger.getLogger('insteon.expectation').setLevel('DEBUG');
    logger.getLogger('insteon.message').setLevel('DEBUG');
  } else {
    log.setLevel('INFO');
    logger.getLogger('insteon.expectation').setLevel('INFO');
    logger.getLogger('insteon.message').setLevel('INFO');
  }
};

Modem.prototype.connect = function () {
  var self = this,
    defer = Q.defer();

  var processSerial = function (err) {
    if (err) {
      log.error('Could not connect to modem:', err.message);
      return defer.reject({'status': 'failed', 'message': err.message});
    }

    log.debug('Insteon Modem Connected');


    self.connected = true;
    self.device.on('error', self.on_error.bind(self));
    self.device.on('open', self.on_open.bind(self));
    self.device.on('data', self.on_data.bind(self));
    self.device.on('disconnect', self.on_disconnect.bind(self));
    self.device.on('close', self.on_close.bind(self));


    self.send_interval = setInterval(self.send.bind(self), self.config.send_interval);
    self.read_interval = setInterval(self.read.bind(self), self.config.read_interval);
    return defer.resolve();
  };

  self.device = new SerialPort(self.config.serial_device, {
    baudrate: parseInt(self.config.serial_baudrate, 10),
    databits: parseInt(self.config.serial_databits, 10),
    stopbits: parseInt(self.config.serial_stopbits, 10),
    parity: 'none',
    autoOpen: true,
    flowcontrol: self.config.serial_flowcontrol
  }, processSerial);

  return defer.promise;
};

Modem.prototype.disconnect = function () {
  var self = this,
    defer = Q.defer();

  clearInterval(self.send_interval);
  clearInterval(self.read_interval);

  self.device.close(function (err) {
    if (err) {
      return defer.reject({'status': 'failed', 'message': err.message});
    }

    defer.resolve();
  });

  return defer.promise;
};

inherits(Modem, EventEmitter);

Modem.prototype.on_error = function () {
  this.emit('ERROR')
  log.error('error', arguments);
};

Modem.prototype.on_open = function () {
  this.emit('OPEN');
  log.info('open', arguments);
};

Modem.prototype.on_disconnect = function (err) {
  log.error('Modem disconnected: %s', err.message);
  this.emit('DISCONNECTED');
  this.connected = false;
};

Modem.prototype.on_close = function () {
  this.emit('CLOSED');
  log.info('Modem connection has closed');
  this.connected = false;
};

Modem.prototype.on_data = function (data) {
  var i,
    tmp,
    self = this;

  for (i = 0; i < data.length; i += 1) {
    //Process message start
    if (data[i] === 0x02 && self.position === 0) {
      tmp = data.slice(i, i + 1);

      self.message = new Message(1);
      data.copy(self.message.buffer, self.position, i, i + 1);

      self.position = 1;
      continue;
    }

    //Process message type
    if (self.message.buffer.length === 1) {
      tmp = new Buffer(2);
      self.message.buffer.copy(tmp, 0);
      data.copy(tmp, 1, i, i + 1);
      self.message.buffer = tmp;
      self.message.parse();
      self.message.code = self.message.buffer.readUInt8(1);
      //self.type = self.commands.lookupByCode(self.message.buffer.readUInt8(1));

      if (self.message.command === undefined) {
        log.warn('Uknown message command: 0x' + self.message.code.toString(16));
        self.resetMsg();
        continue;
      }

      log.debug('Message type determined: ', self.message.command);
      self.position += 1;
      continue;
    }

    //Process message payload
    if (self.position !== 0 && self.message.r_size && self.message.buffer.length < (self.message.r_size + 2)) {
      tmp = new Buffer(self.message.buffer.length + 1);
      self.message.buffer.copy(tmp, 0);
      data.copy(tmp, self.message.buffer.length, i, i + 1);

      self.message.buffer = tmp;
      self.position += 1;
    }

    if (self.message.buffer.length === 6 && self.message.command === 'SEND_INSTEON_STANDARD') {
      self.message.parse();
    }

    //Check if payload size reached
    if (self.position !== 0 && self.message.r_size && self.message.buffer.length === self.message.r_size + 2) {
      log.debug('Message received', self.message.buffer);
      self.message.buffer = self.message.buffer.slice(2, self.message.buffer.length);

      if (self.message.deserialize) {
        try {
          self.message.deserialize(self.message);
          self.message.parse_cmd_1();
          log.debug('Message deserialized:', JSON.stringify(self.message.result));
          self.read_queue.push(self.message);
        } catch (e) {
          log.error('Error deserializing message:', e.message);
        }

      } else {
        log.warn('No deserializer for message:', self.message.command);
      }

      self.resetMsg();

    }
  }
};

Modem.prototype.resetMsg = function () {
  var self = this;

  self.message = new Message(0);
  self.position = 0;
  self.type = 0;
};

Modem.prototype.send = function () {
  var self = this;

  if (self.send_queue.length === 0) {
    return;
  }

  if (self.sending) {
    return;
  }

  self.sending = true;
  var message = self.send_queue.shift();

  if (!self.connected) {
    message.defer.reject({'status': 'failed', 'message': 'Modem is disconnected and message cannot be sent'});
    self.sending = false;
  }

  message.prep();

  if (message.error) {
    log.error(message.error.message);
    self.sending = false;
    return message.defer.reject({'status': 'failed', 'message': message.error.message});
  }

  if (Array.isArray(message.expect)) {
    var expect_defers = [];

    // Iterate through each of our expectations
    message.expect.forEach(function (expected) {
      //Build the expectation object
      var expectation = new Expectation(self);
      expectation.command = expected.command;
      expectation.expect_from = (expected.expect_from === true);

      message.expect.splice(message.expect.indexOf(expected), 1, expectation);
      // Add the
      expect_defers.push(expectation.defer.promise);
      self.expectations.push(expectation);
    });

    Q.allSettled(expect_defers).then(function (results) {
      message.failures = [];
      message.responses = [];

      results.forEach(function (result) {
        if (result.value.result.status !== 'success') {
          result.value.result.command = result.value.command;
          message.failures.push(result.value.result);
        }
        Object.assign(message.result, result.value.result);
        message.responses.push(result.value.result);
      });

      if (message.failures.length > 0) {
        message.failed('Expectation failed');
      } else {
        message.success();

        if (message.emit) {
          self.emit('MESSAGE', message.result);
          self.emit(message.result.command, message.result);
        }
      }
    });
  } else {
    message.defer.resolve({'status': 'success', 'message': 'Message sent'});
  }

  //Send the command
  log.debug('Sending command', message.buffer);
  self.device.write(message.buffer);

  self.sending = false;
};

Modem.prototype.read = function () {
  var device,
    expected,
    self = this;

  if (self.read_queue.length === 0) {
    return;
  }

  if (self.reading) {
    return;
  }

  self.reading = true;
  var message = self.read_queue.shift();

  expected = self.expectations.filter(function (expected) {
    return (expected.command === message.command);
  });

  if (expected.length > 0) {
    expected[0].resolve(message);
  } else {
    self.emit('MESSAGE', message.result);
    self.emit(message.result.command, message.result);
    if (message.event) {
      self.emit(message.event, message);
    }
  }
  self.reading = false;

};

module.exports = Modem;
