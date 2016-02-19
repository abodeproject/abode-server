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
  Modem.expecting = [];
  Modem.queueInterval = setInterval(Modem.queue_processor, insteon.config.delay);

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
  Modem.send_handler(job.type, job.config, job.expect, job.defer);
};

Modem.send = function (type, config, expect) {
  var defer = q.defer(),
    data = {
      type: type,
      config: config,
      expect: expect,
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

Modem.send_handler = function (type, config, expect, defer) {
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
    tmp,
    expectation;


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
        Modem.message = Modem.type.deserialize(Modem.message);
      } else {
        log.warn('No deserializer for message:', Modem.type.name);
      }
      //console.log('Message Type Parsed: ', type.name);

      expectation = Modem.expecting[Modem.type.name];

      if (expectation !== undefined) {
        log.debug('Resolving expectations promise:', Modem.type.name);
        expectation.resolve({
          'command': Modem.type.name,
          'status': Modem.message.status,
          'message': Modem.message
        });

        delete Modem.expecting[Modem.type.name];

        Modem.resetMsg();
        return true;
      } else if (Modem.type.name === 'ALL_LINKING_COMPLETED') {
        Modem.insteon.link_complete(Modem.message);
      } else {
        log.debug('Message not expected: ' + Modem.type.name);
      }
      if (Modem.type.handler) {
        Modem.type.handler(Modem.message);
      }

      if (Modem.message.from) {
        var device = Modem.insteon.getDevice(Modem.message.from.addr);
        var state = {};

        var log_msg = {
            'from': Modem.message.from,
            'to': Modem.message.to,
            'command': Modem.message.cmd,
            'extra': Modem.message
          };

        if (!device) {
          log.warn('Unknown device: %s (%s)', Modem.message.from.addr, Modem.message.cmd);
        } else if (device.capabilities instanceof Array && device.capabilities.indexOf('motion_sensor') !== -1) {

          if (Modem.message.to.addr === '00.00.02') {

          //Dawn/Dusk Detection
            if (Modem.message.cmd === 'LIGHT_ON') {

              log.debug('Dark detected by device: ', device.name);
              log_msg.command = 'Dark Detected';
              device.set_state(state, log_msg);

            } else if (Modem.message.cmd === 'LIGHT_OFF') {

              log.debug('Light detected by device: ', device.name);
              log_msg.command = 'Light Detected';
              device.set_state(state, log_msg);

            } else {
              log.warn('Unhandled Motion Command:', Modem.message);
            }

          } else if (Modem.message.to.addr === '00.00.03'){

          //Low battery detection
            state.low_battery = true;
            log_msg.command = 'Low Battery Detected';
            device.set_state(state, log_msg);

          } else if (Modem.message.to.addr.slice(0,5) !== '00.00') {
            if (Modem.message.cmd === 'LIGHT_ON') {

            //Emit global event for LIGHT_ON
              log_msg.command = 'MOTION_ON';
              state._on = true;
              device.set_state(state, log_msg);

            } else if (Modem.message.cmd === 'LIGHT_OFF') {

            //Emit global event for LIGHT_OFF
              log_msg.command = 'MOTION_OFF';
              state._on = false;
              device.set_state(state, log_msg);

            } else {
              log.warn('Unhandled Motion Command:', Modem.message);
            }
          }

        } else if (device.capabilities instanceof Array && device.capabilities.indexOf('openclose') !== -1) {
          if (Modem.message.to.addr === '00.00.03'){

          //Low battery detection
            state.low_battery = true;
            log_msg.command = 'Low Battery Detected';
            device.set_state(state, log_msg);

          } else if (Modem.message.to.addr.slice(0,5) !== '00.00') {
            if (Modem.message.cmd === 'LIGHT_ON') {

            //Emit global event for LIGHT_ON
              state._on = true;
              log_msg.command = 'OPENED';
              device.set_state(state, log_msg);

            } else if (Modem.message.cmd === 'LIGHT_OFF') {

            //Emit global event for LIGHT_OFF
              state._on = false;
              log_msg.command = 'CLOSED';
              device.set_state(state, log_msg);

            } else {
              log.warn('Unhandled Openclose Command:', Modem.message);
            }
          }

        } else {
          if (device && Modem.message.cmd === 'LIGHT_ON') {

          //Emit global event for LIGHT_ON
            state._on = true;
            device.set_state({'_on': true}, log_msg);

          } else if (device && Modem.message.cmd === 'LIGHT_OFF') {

          //Emit global event for LIGHT_OFF
            state._on = false;
            device.set_state(state, log_msg);

          } else if (device) {
            log.info('Command received from device %s: %s', device.name, Modem.message.cmd);
          // Catchall log
            device.log_entry({
              'from': Modem.message.from,
              'to': Modem.message.to,
              'command': Modem.message.cmd,
              'extra': Modem.message
            });

          } else  {
            log.warn('Unknown device: %s (%s)', Modem.message.from.addr, Modem.message.cmd);
          }
        }
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
  console.log('open');
  Modem.insteon.status = 'connected';
};
Modem.close = function () {
  console.log('closed');
  Modem.insteon.status = 'disconnected';
};
Modem.error = function () {
  console.log('error');
  Modem.insteon.status = 'error';
};

module.exports = Modem;
