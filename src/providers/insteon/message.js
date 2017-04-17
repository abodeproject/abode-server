'use strict';

var q = require('q'),
  commands = require('./commands'),
  logger = require('log4js'),
  log = logger.getLogger('insteon.message');

var MESSAGE_TIMEOUT = 'Timeout waiting for message';

var Message = function (size) {

  if (size !== undefined) {
    this.buffer = new Buffer(size);
  }
  this.result = {};

};

Message.prototype.send = function (modem) {
  var self = this;

  self.defer = q.defer();
  self.modem = modem;
  self.expect = [];
  self.deserializers = [];

  self.modem.send_queue.push(self);

  self.timer = setTimeout(self.timeout.bind(self), self.modem.config.message_timeout);

  return this.defer.promise;
};

Message.prototype.timeout = function () {
  log.debug(MESSAGE_TIMEOUT);
  this.modem.send_queue.splice(this.modem.send_queue.indexOf(this), 1);

  this.expect.forEach(function (expectation) {
    expectation.timeout();
  });

  this.defer.reject({'status': 'failed', 'message': MESSAGE_TIMEOUT});
};

Message.prototype.success = function () {
  if (this.post) {
    this.post();
  }
  this.defer.resolve(this.result);
};

Message.prototype.failed = function (msg) {
  clearTimeout(this.timer);
  this.defer.reject({'status': 'failed', 'message': msg, 'failures': this.failures});

};

Message.prototype.get_command_by_code = function (code, extended) {
  var i,
    self = this,
    cmds = Object.keys(commands),
    total = cmds.length;

  // Iterate through each command
  if (!self.command || extended) {
    for (i = 0; i < total; i += 1) {
      // check if the code matches what we're looking for
      if (commands[ cmds[i] ].code === code && commands[ cmds[i] ].extended === extended) {
        // Set the command to the key
        self.command = cmds[i];

        self.result = self.result || {};
        self.result.command = self.result.command || [];
        self.result.command.push(cmds[i])
        self.deserializers = self.deserializers || [];

        // Merge the command into the message
        Object.assign(self, commands[ cmds[i] ]);
        break;
      }
    }
    
  }

};

Message.prototype.parse_cmd_1 = function () {
  var i,
    self = this,
    cmds = Object.keys(commands),
    total = cmds.length;

  if (self.result.cmd_1 === undefined || self.command === undefined) {
    return;
  }

  cmds.forEach(function (cmd) {
    var matched = (
      (
        (commands[cmd].send && commands[cmd].send.command === self.command) &&
        (commands[cmd].send && commands[cmd].send.cmd_1 === self.result.cmd_1) &&
        (commands[cmd].send && commands[cmd].send.cmd_2 === undefined || commands[cmd].send.cmd_2 === self.result.cmd_2)
      ) ||
      (
        (commands[cmd].receive && commands[cmd].receive.command === self.command) &&
        (commands[cmd].receive && commands[cmd].receive.cmd_1 === self.result.cmd_1) &&
        (commands[cmd].receive && commands[cmd].receive.cmd_2 === undefined || commands[cmd].receive.cmd_2 === self.result.cmd_2)
      ) ||
      (
        (commands[cmd].command && commands[cmd].command === self.command) &&
        (commands[cmd].cmd_1 === self.result.cmd_1) &&
        (commands[cmd].cmd_2 === undefined || commands[cmd].cmd_2 === self.result.cmd_2)
      )
    );

    if (matched) {
      self.result.command = self.result.command || [];
      self.result.command.push(cmd);

      if (commands[ cmd ].deserialize) {
        log.debug('Deserializing %s message', cmd);
        commands[ cmd ].deserialize.apply(self);
        self.deserializers.push(commands[ cmd ].deserialize)
      } else {
        log.warn('No deserializer for command: %s', cmd);
      }
    }
  });

  // If we match any commands, deserialize the first match
  /*
  if (cmds.length > 0) {
    self.result.command = cmds[0];
    if (commands[ cmds[0] ].deserialize) {
      log.debug('Deserializing %s message', cmds[0]);
      commands[ cmds[0] ].deserialize.apply(self);

    } else {
      log.warn('No deserializer for command: %s', cmds[0]);
    }
  }
  for (i = 0; i < total; i += 1) {
    // check if the code matches what we're looking for
    if (commands[ cmds[i] ].command === self.command && commands[ cmds[i] ].cmd_1 === self.result.cmd_1 && commands[ cmds[i] ].cmd_2 === self.result.cmd_2) {
      // Set the command to the key
      self.result.command = cmds[i];
      if (commands[ cmds[i] ].deserialize) {
        log.debug('Deserializing %s message', cmds[i]);
        commands[ cmds[i] ].deserialize.apply(self);
      }
      break;
    }
  }
  */
};

Message.prototype.parse = function () {

  if (this.buffer.length >= 2 && this.code === undefined) {
      this.code = this.buffer.readUInt8(1);
      this.get_command_by_code(this.code);
  }


  if (this.buffer.length === 6 && this.command === 'SEND_INSTEON_STANDARD') {
    var flags = this.buffer.readUInt8(5);

    this.result = this.result || {};
    this.result.flags = flags.toString(2);
    this.result.type = (flags >> 5);
    this.result.extended = (flags >> 4 & 1);

    if (this.result.extended) {
      log.debug('Upgrading message to extended');
      this.get_command_by_code(this.code, true);
    }
  }

};

Message.prototype.prep = function () {
  var cmd_buffer;

  //Check if we have a command specified
  if (this.command === undefined) {
    this.error = new Error('Message command not defined');
    return;
  }

  //Check if we have a valid command
  if (!commands[this.command]) {
    this.error = new Error('Unknown message command:' + this.command);
    return;
  }
  
  // If our command inherits from another, check it exists
  if (commands[this.command].command && !commands[commands[this.command].command]) {
    this.error = new Error('Unknown parent message command:' + commands[this.command].command);
    return;
  // If it exists, assign the parent command then set cmd_1, cmd_2, expect accordingly
  } else if (commands[this.command].command && commands[commands[this.command].command]) {

    Object.assign(this, commands[commands[this.command].command]);
    this.cmd_1 = this.cmd_1 || commands[this.command].cmd_1;
    this.cmd_2 = this.cmd_2 || commands[this.command].cmd_2;

    // Call our child serializer if exists
    if (commands[this.command].serialize) {
      log.debug('Serializing %s message', this.command);
      commands[this.command].serialize.apply(this);
    }

    if (commands[this.command].expect && this.expect) {
      this.expect = this.expect.concat(commands[this.command].expect);
    } else if (commands[this.command].expect && !this.expect) {
      this.expect = [].concat(commands[this.command].expect);
    }
  // Otherwise just assign the command
  } else {
    Object.assign(this, commands[this.command]);
  }

  //Check if the type is a write size
  if (this.w_size === undefined && this.serialize) {
    this.error = new Error('Serializer defined but no w_size');
    return;
  }

  //Check if the type is a write size
  if (this.w_size > 0 && this.serialize === undefined) {
    this.error = new Error('w_size specified but no serializer defined');
    return;
  }

  //Serialize the config
  if (this.w_size === 0) {
    cmd_buffer = new Buffer(0);
  } else {
    log.debug('Serializing %s message', commands[this.command].command);
    cmd_buffer = this.serialize.apply(this);
  }

  //Check the serialized size matches the types write size
  if (cmd_buffer.length !== this.w_size) {
    this.error = new Error('Buffer not of correct size. Required: '+ this.w_size + ', received:' + cmd_buffer.length);
    return;
  }

  //Build a new buffer with start and message type bytes
  this.buffer = new Buffer(2 + this.w_size);
  this.buffer.writeUInt8(2, 0);
  this.buffer.writeUInt8(this.code, 1);

  //If the cmd_buffer has a size, copy it into final buffer
  if (cmd_buffer.length > 0) {
    cmd_buffer.copy(this.buffer, 2);
  }

  this.post = commands[this.command].post;
};

module.exports = Message;