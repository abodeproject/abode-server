'use strict';

var Q = require('q'),
  utils = require('./utils'),
  logger = require('log4js'),
  log = logger.getLogger('insteon.modem'),
  log_message = logger.getLogger('insteon_message'),
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
  self.config.message_timeout = self.config.message_timeout || 20000;
  self.config.attempt_timeout = self.config.attempt_timeout || 5000;
  self.config.modem_debug = (self.config.modem_debug === true);
  self.config.serial_baudrate = self.config.serial_baudrate || 19200;
  self.config.serial_databits = self.config.serial_databits || 8;
  self.config.serial_stopbits = self.config.serial_stopbits || 1;
  self.config.serial_parity = self.config.serial_parity || 0;
  self.config.serial_flowcontrol = self.config.serial_flowcontrol || 0;

  self.connected = false;
  self.message = new Message(0);
  self.position = 0;
  self.type = 0;

  self.send_queue = [];
  self.read_queue = [];
  self.read_buffer = [];
  self.expectations = [];

  self.polling = false;
  self.last_sent = new Date();

  self.sending = false;
  self.reading = false;
  self.processing_buffer = false;

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
    self.buffer_processor = setInterval(self.process_buffer.bind(self), 1);
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
  clearInterval(self.buffer_processor);

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
  this.read_buffer.push(data);
  log_message.info(data);
};

Modem.prototype.process_buffer = function () {

  if (this.processing_buffer !== false) {
    return;
  }

  if (this.read_buffer.length === 0) {
    return;
  }

  var i,
    tmp,
    self = this,
    data = this.read_buffer.shift();

  if (data === undefined) {
    return;
  }

  self.processing_buffer = new Date();

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

      self.message.compiled = new Date();

      self.resetMsg();

    }
  }

  self.processing_buffer = false;
};

Modem.prototype.resetMsg = function () {
  var self = this;

  self.message = new Message(0);
  self.position = 0;
  self.type = 0;
};

Modem.prototype.send = function () {
  var self = this,
    attempt_timer;

  // If nothing in the queue, return
  if (self.send_queue.length === 0) {
    return;
  }

  // If we're already sending, return
  if (self.sending) {
    return;
  }

  // Set the sending flag and get our message
  self.sending = true;
  var message = self.send_queue.shift();

  if (!self.polling) {
    self.last_sent = new Date();
  }

  // If we are not connected, fail the message and clear the sending flag
  if (!self.connected) {
    message.defer.reject({'status': 'failed', 'message': 'Modem is disconnected and message cannot be sent'});
    self.sending = false;
    self.polling = false;
  }

  // Define the attempt function
  var attempt = function () {

    // If out message is no longer pending, return
    if (!message.defer.promise.isPending()) {
      return;
    }
    // If we reached retries, fail the message
    if (message.attempt >= message.retries) {
      message.failed('Max retries of ' + message.retries + ' reached');
      return;
    }

    // Increment our attempts
    message.attempt += 1;

    // Prep the message
    message.prep();
    message.processed = new Date();

    log_message.info(message.tx_message());

    // If we have a prep error, fail the message
    if (message.error) {
      log.error(message.error.message);
      return message.defer.reject({'status': 'failed', 'message': message.error.message});
    }

    // If we have NO message expectations, send the message and be done
    if (!Array.isArray(message.expect)) {
      //Send the command
      log.debug('Sending command attempt %s: ', message.attempt, message.buffer);
      self.device.write(message.buffer);

      self.sending = false;
      self.polling = false;
      message.success();

      return;
    }

    // Process our message expectations
    var expect_defers = [];

    // Iterate through each of our expectations
    message.expect.forEach(function (expected) {
      //Build the expectation object
      var expectation = new Expectation(self);
      expectation.command = expected.command;
      expectation.from = message.to;
      //expectation.expect_from = (expected.expect_from === true);

      message.expect.splice(message.expect.indexOf(expected), 1, expectation);
      // Add the expectations
      expect_defers.push(expectation.defer.promise);
      self.expectations.push(expectation);
    });

    Q.allSettled(expect_defers).then(function (results) {
      message.failures = [];
      message.responses = [];

      results.forEach(function (result) {
        if (result.value && result.value.result.status !== 'success') {
          result.value.result.command = result.value.command;
          message.failures.push(result.value.result);
        } else if(result.state === 'rejected') {
          message.failures.push(result.reason);
          result.value = {'result': result.reason};
        }
        Object.assign(message.result, result.value.result);
        message.responses.push(result.value.result);
      });

      if (message.failures.length > 0) {
        clearTimeout(attempt_timer);
        attempt();
        //message.failed('Expectation failed');
      } else {
        clearTimeout(attempt_timer);
        message.success();

        if (message.emit) {
          self.emit('MESSAGE', message.result);
          self.emit(message.result.command, message.result);
        }

        // On success, clear sending flag
        self.sending = false;
        self.polling = false;
      }
    });

    // Set attempt timer
    attempt_timer = setTimeout(function () {
      log.warn('Attempt %s for %s to %s timed out, trying again', message.attempt, message.command, message.to);
      // Timeout the expectations which will fail the attempt
      message.expect.forEach(function (expectation) {
        expectation.timeout();
      });

    }, self.config.attempt_timeout);

    //Send the command
    log.info('Sending command attempt %s: ', message.attempt, message.buffer);
    self.device.write(message.buffer);
  };

  // Call the attempt
  attempt();

  // If the message fails, stop sending
  message.defer.promise.fail(function () {
    // Clear the sending flag
    self.sending = false;
    self.polling = false;
  });
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
  message.processed = new Date();

  log_message.info(message.rx_message());

  //log.info('[rx:0x%s (%s)] from: %s, to: %s, cmd_1: 0x%s, cmd_2: 0x%s', utils.toHex(message.code || 0), message.command, message.result.from, message.result.to, utils.toHex(message.result.cmd_1 || 0), utils.toHex(message.result.cmd_2 || 0));
  expected = self.expectations.filter(function (expected) {
    return (expected.command === message.command && (expected.from === message.result.from || expected.from === message.result.to));
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
