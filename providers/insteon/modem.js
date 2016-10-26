'use strict';

var logger = require('log4js'),
  log = logger.getLogger('insteon.modem');
var q = require('q');
var serialPort = require('serialport'),
  SerialPort = serialPort.SerialPort;


var toHex = function (v) {
  var hex = v.toString(16);

  if (hex.length === 1) {
    hex = '0' + hex;
  }

  return hex;
};

var Modem = function (insteon) {
  var defer = q.defer();

  Modem.insteon = insteon;
  Modem.commands = require('./commands')(undefined, Modem.insteon);

  Modem.message = new Buffer(0);
  Modem.position = 0;
  Modem.type = 0;

  //Set our log level
  if (insteon.config.modem_debug) {
    log.setLevel('DEBUG');
  } else {
    log.setLevel('INFO');
  }

  var processSerial = function (err) {
    if (err) {
      log.error('Could not connect to modem:', err.message);
      defer.reject({'status': 'failed', 'message': err.message});
      return false;
    }

    log.debug('Insteon Modem Connected');
    insteon.status = 'connected';
    insteon.message = undefined;
    Modem.dev.on('open', Modem.open);
    Modem.dev.on('close', Modem.close);
    Modem.dev.on('error', Modem.error);
    Modem.dev.on('data', Modem.read);

    defer.resolve();
  };

  Modem.command_queue = [];
  Modem.message_queue = [];
  Modem.expecting = [];
  Modem.processing_message = false;
  Modem.queueInterval = setInterval(Modem.queue_processor, insteon.config.delay);
  Modem.message_processor();

  Modem.dev = new SerialPort(insteon.config.serial_device, {
    baudrate: insteon.config.serial_baudrate,
    databits: insteon.config.serial_databits,
    stopbits: insteon.config.serial_stopbits,
    parity: insteon.config.serial_parity,
    flowcontrol: insteon.config.serial_flowcontrol
  }, true, processSerial);

  return defer.promise;
};

Modem.queue_processor = function () {
  if (Modem.command_queue.length === 0) {
    return;
  }

  if (Object.keys(Modem.expecting).length > 0) {
    log.debug('Waiting expectations for commands, skipping.');
    return;
  }

  log.debug('Processing send queue command');

  var job = Modem.command_queue.shift();
  Modem.send_handler(job.type, job.config, job.expect, job.expect_from, job.defer);
};

Modem.message_processor = function () {
  var message_timeout;
  var monitor_count;
  log.info('Starting message processor');

  var wait = function () {
    clearTimeout(message_timeout);
    setTimeout(next, 100);
  };

  var monitor = function () {
    message_timeout = setTimeout(function () {
      monitor_count += 1;

      log.debug('Waiting for message to parse over %s seconds, queue: %s', monitor_count, Modem.message_queue.filter(function (x) { return (x !== undefined); }).length);
      if (monitor_count >= 3) { next(); } else { monitor(); }


    }, 1000);
  };

  var next = function () {
    monitor_count = 0;
    clearTimeout(message_timeout);

    if (Modem.message_queue.length === 0) {
      wait();
      return;
    }

    var message = Modem.message_queue.shift();
    monitor();
    Modem.message_handler(message).then(next, next);

  };

  next();
};

Modem.message_handler = function (message, handler) {
  var expectation,
    defer = q.defer();

  if (!message) {
    defer.reject();
    return defer.promise;
  }

  var to_name = message.to;
    to_name = (to_name !== undefined) ? to_name.name : 'undefined';
  var from_name = message.from;
    from_name = (from_name !== undefined) ? from_name.name : 'undefined';

  expectation = Modem.expecting[message.type + ':' + from_name] || Modem.expecting[message.type];
  log.debug('Processing %s message: ', message.type, message);

  if (expectation !== undefined) {
    log.debug('Resolving expectations promise from %s to %s:', from_name, to_name, message.type);
    expectation.resolve({
      'command': Modem.type.name,
      'status': message.status,
      'message': message
    });

    delete Modem.expecting[Modem.type];

    defer.resolve();
    return defer.promise;

  } else if (message.type === 'ALL_LINKING_COMPLETED') {

    Modem.insteon.link_complete(message).then(defer.resolve, defer.reject);
    return defer.promise;

  } else {
    log.debug('Message not expected: ' + Modem.type.name);
  }

  //Is this needed?
  if (handler) {
    handler(message);
  }

  if (message.from) {
    var device = Modem.insteon.getDevice(message.from.addr);
    var state = {};

    var log_msg = {
        'from': message.from,
        'to': message.to,
        'command': message.cmd,
        'extra': message
      };

    if (device && message.cmd === 'BROADCAST_CLEANUP') {
      var cleanup = false;
      var cleanup_message = message.to.addr.split('.');

      if (cleanup_message[0] === '11') { //LIGHT ON
        if (device._on !== true) {
          message.cmd = 'LIGHT_ON';
          cleanup = true;
        }
      } else if (cleanup_message[0] === '13') { //LIGHT OFF
        if (device._on === true) {
          message.cmd = 'LIGHT_OFF';
          cleanup = true;
        }
      } else {
        log.warn('Unknown cleanup message: ', cleanup_message[0]);
      }

      if (cleanup) {
        log.debug('Cleanup message recieved and device not in expected state: ', device.name, message.cmd);
      } else {
        log.debug('Cleanup message recieved but device is correct: ', device.name, message.cmd);

        defer.resolve();
        return defer.promise;
      }
    }

    if (!device) {

      log.warn('Unknown device: %s (%s)', message.from.addr, message.cmd);
      defer.resolve();

    } else if (device.capabilities instanceof Array && device.capabilities.indexOf('motion_sensor') !== -1) {

      if (message.to.addr === '00.00.02') {

      //Dawn/Dusk Detection
        if (message.cmd === 'LIGHT_ON') {

          log.info('DARK detected by device: ', device.name);
          log_msg.command = 'Dark Detected';
          device.set_state(state, log_msg).then(defer.resolve, defer.reject);

        } else if (message.cmd === 'LIGHT_OFF') {

          log.info('LIGHT detected by device: ', device.name);
          log_msg.command = 'Light Detected';
          device.set_state(state, log_msg).then(defer.resolve, defer.reject);

        } else {
          log.warn('Unhandled Motion Command:', message);
          defer.resolve();
        }

      } else if (message.to.addr === '00.00.03'){

      //Low battery detection
        state.low_battery = true;
        log.info('LOW BATTERY detected by device: ', device.name);
        log_msg.command = 'Low Battery Detected';
        device.set_state(state, log_msg).then(defer.resolve, defer.reject);

      } else if (message.to.addr.slice(0,5) !== '00.00') {
        if (message.cmd === 'LIGHT_ON') {

        //Emit global event for LIGHT_ON
          log.info('MOTION ON detected by device: ', device.name);
          log_msg.command = 'MOTION_ON';
          state._on = true;
          device.set_state(state, log_msg).then(defer.resolve, defer.reject);

        } else if (message.cmd === 'LIGHT_OFF') {

        //Emit global event for LIGHT_OFF
          log_msg.command = 'MOTION_OFF';
          log.info('MOTION OFF detected by device: ', device.name);
          state._on = false;
          device.set_state(state, log_msg).then(defer.resolve, defer.reject);

        } else {
          log.warn('Unhandled Motion Command:', message);
          defer.resolve();
        }
      }

    } else if (device.capabilities instanceof Array && device.capabilities.indexOf('openclose') !== -1) {
      if (message.to.addr === '00.00.03'){

      //Low battery detection
        state.low_battery = true;
        log_msg.command = 'Low Battery Detected';
        log.info('Low Battery detected by device: ', device.name);
        device.set_state(state, log_msg).then(defer.resolve, defer.reject);

      } else if (message.to.addr.slice(0,5) !== '00.00') {
        if (message.cmd === 'LIGHT_ON') {

        //Emit global event for LIGHT_ON
          log.info('OPEN detected by device: ', device.name);
          state._on = true;
          log_msg.command = 'OPENED';
          device.set_state(state, log_msg).then(defer.resolve, defer.reject);

        } else if (message.cmd === 'LIGHT_OFF') {

        //Emit global event for LIGHT_OFF
          log.info('CLOSE detected by device: ', device.name);
          state._on = false;
          log_msg.command = 'CLOSED';
          device.set_state(state, log_msg).then(defer.resolve, defer.reject);

        } else {
          log.warn('Unhandled Openclose Command:', message);
          defer.resolve();
        }
      }

    } else {
      if (device && message.cmd === 'LIGHT_ON') {

      //Emit global event for LIGHT_ON
        log.info('ON detected by device: ', device.name);
        state._on = true;
        device.set_state({'_on': true}, log_msg).then(defer.resolve, defer.reject);

      } else if (device && message.cmd === 'LIGHT_OFF') {

      //Emit global event for LIGHT_OFF
        log.info('OFF detected by device: ', device.name);
        state._on = false;
        device.set_state(state, log_msg).then(defer.resolve, defer.reject);

      } else if (device) {
        log.info('Command received from device %s: %s (%s)', device.name, message.cmd,  message.cmd_1);
      // Catchall log
        device.log_entry({
          'from': message.from,
          'to': message.to,
          'command': message.cmd,
          'extra': message
        });
        defer.resolve();

      } else  {
        log.warn('Unknown device: %s (%s)', message.from.addr, message.cmd);
        defer.resolve();
      }
    }
  } else {
    defer.resolve();
  }

  return defer.promise;
};

Modem.send = function (type, config, expect, expect_from) {
  var defer = q.defer(),
    data = {
      type: type,
      config: config,
      expect: expect,
      expect_from: expect_from || [],
      defer: defer
    };

  //Add the command to the queue
  log.debug('Adding command to the queue');
  Modem.command_queue.push(data);

  return {
    settled: defer.promise,
    status: 'deferred'
  };
};

Modem.send_handler = function (type, config, expect, expect_from, defer) {
  var cmd_buf,
    type_buf,
    index,
    status = {},
    cmd_type = Modem.commands.lookupByName(type);

  //Check if we have a type specified
  if (cmd_type === undefined) {
    log.error('Unknown message type', type);
    return false;
  }

  //Check if the type is a write size
  if (cmd_type.w_size === undefined && cmd_type.serialize) {
    log.error('Invalid send command', type);
    return false;
  }

  //Check if the type is a write size
  if (cmd_type.w_size > 0 && cmd_type.serialize === undefined) {
    log.error('No serialize handler for action', type);
    return false;
  }

  //Serialize the config
  if (cmd_type.w_size === 0) {
    type_buf = new Buffer(0);
  } else {
    type_buf = cmd_type.serialize(config);
  }

  //Check the serialized size matches the types write size
  if (type_buf.length !== cmd_type.w_size) {
    log.error('Buffer not of correct size. Required', cmd_type.w_size, ' received', type_buf.length);
    return false;
  }

  //Build a new buffer with start and message type bytes
  cmd_buf = new Buffer(2 + cmd_type.w_size);
  cmd_buf.writeUInt8(2, 0);
  cmd_buf.writeUInt8(cmd_type.code, 1);

  //If the type_buf has a size, copy it into final buffer
  if (type_buf.length > 0) {
    type_buf.copy(cmd_buf, 2);
  }

  //For each expected return command, return a promise
  if (expect instanceof Array) {
    status.expectations = {};
    status.settled = [];
    index = 0;
    expect.forEach(function (expectation) {
        var time;
        index += 1;
        log.debug('Adding response expectation:', expectation);
        //Add the expection with new promise to the global list
        Modem.expecting[expectation] = q.defer();

        //Add the promise to the status
        status.expectations[expectation] = Modem.expecting[expectation].promise;
        status.settled.push(Modem.expecting[expectation].promise);

        time = setTimeout(function () {
          if (Modem.expecting[expectation] === undefined) {
            return;
          }
          Modem.expecting[expectation].reject({
            'command': expectation,
            'status': 'timeout',
            'message': 'Timeout after ' + Modem.insteon.config.timeout + ' second'
          });

          delete Modem.expecting[expectation];
        }, Modem.insteon.config.timeout * index);
    });

    expect_from.forEach(function (expectation) {
        var time;
        var expectation_key = expectation + ':' + config.to;
        index += 1;
        log.debug('Adding from response expectation:', expectation_key);
        //Add the expection with new promise to the global list
        Modem.expecting[expectation_key] = q.defer();

        //Add the promise to the status
        status.expectations[expectation_key] = Modem.expecting[expectation_key].promise;
        status.settled.push(Modem.expecting[expectation_key].promise);

        time = setTimeout(function () {
          if (Modem.expecting[expectation_key] === undefined) {
            return;
          }
          Modem.expecting[expectation_key].reject({
            'command': expectation,
            'from': config.to,
            'status': 'timeout',
            'message': 'Timeout after ' + Modem.insteon.config.timeout + ' second'
          });

          delete Modem.expecting[expectation_key];
        }, Modem.insteon.config.timeout * index);
    });

    q.all(status.settled).then(function (results) {
      defer.resolve(results);
    }, function (err) {
      defer.reject(err);
    });
  }

  //Send the command
  log.debug('Sending command', cmd_buf);
  Modem.dev.write(cmd_buf);

  //If we don't have any expectations, resolve our defer
  if (expect === undefined) {
    status.message = 'sent';
    defer.resolve(status);
  }
};

Modem.read = function (data) {
  var i,
    tmp;


  for (i = 0; i < data.length; i += 1) {
    //Process message start
    if (data[i] === 0x02 && Modem.position === 0) {
      tmp = data.slice(i, i + 1);

      Modem.message = new Buffer(1);
      data.copy(Modem.message, Modem.position, i, i + 1);

      Modem.position = 1;
      continue;
    }

    //Process message type
    if (Modem.message.length === 1) {
      tmp = new Buffer(2);
      Modem.message.copy(tmp, 0);
      data.copy(tmp, 1, i, i + 1);
      Modem.message = tmp;
      Modem.type = Modem.commands.lookupByCode(Modem.message.readUInt8(1));

      if (Modem.type === false) {
        log.warn('Uknown type');
        Modem.resetMsg();
        continue;
      }

      log.debug('Message type determined: ', Modem.type.name);
      Modem.position += 1;
      continue;
    }

    //Process message payload
    if (Modem.position !== 0 && Modem.type && Modem.message.length < (Modem.type.r_size + 2)) {
      tmp = new Buffer(Modem.message.length + 1);
      Modem.message.copy(tmp, 0);
      data.copy(tmp, Modem.message.length, i, i + 1);

      Modem.message = tmp;
      Modem.position += 1;
    }

    //Check if payload size reached
    if (Modem.position !== 0 && Modem.type && Modem.message.length === Modem.type.r_size + 2) {
      log.debug('Message received', Modem.message);
      Modem.message = Modem.message.slice(2, Modem.message.length);

      if (Modem.type.deserialize) {
        var message = Modem.type.deserialize(Modem.message);
        message.type = Modem.type.name;
        Modem.message_queue.push(message, Modem.type.handler);

      } else {
        log.warn('No deserializer for message:', Modem.type.name);
      }

      Modem.resetMsg();

    }
  }
};

Modem.resetMsg = function () {
  Modem.message = new Buffer(0);
  Modem.position = 0;
  Modem.type = 0;
};

Modem.bufferToAddr = function (addr) {
  return toHex(addr[0]) + '.' + toHex(addr[1]) + '.' + toHex(addr[2]);
};

Modem.addrToBuffer = function (addr) {
  var buf = new Buffer(3),
    addr_parts = addr.split('.');

  buf.writeUInt8(parseInt(addr_parts[0],16), 0);
  buf.writeUInt8(parseInt(addr_parts[1],16), 1);
  buf.writeUInt8(parseInt(addr_parts[2],16), 2);

  return buf;
};

Modem.open = function () {
  log.debug('connected');
  Modem.insteon.status = 'connected';
};
Modem.close = function () {
  log.debug('closed');
  Modem.insteon.status = 'disconnected';
};
Modem.error = function () {
  log.debug('error');
  Modem.insteon.status = 'error';
};

module.exports = Modem;
