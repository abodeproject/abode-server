'use strict';

var utils = require('./utils');

var Serializers = {};

Serializers.start_all_linking = function () {
  var buf = new Buffer(2);
  var code = 0x03;

  if (this.controller === true) {
    code = 0x01;
  } else if (this.controller === false) {
    code = 0x00;
  } else {
    code = 0x03;
  }
  this.group = this.group || 0x01;

  buf.writeUInt8(code, 0);
  buf.writeUInt8(this.group, 1);


  return buf;
};

Serializers.send_insteon_standard = function () {
  var flags,
    buf = new Buffer(6);

  this.to = this.to || '00.00.01';

  this.type = this.type || ((this.to.indexOf('00.00') === 0) ? 0x06 : 0x00);
  this.hops = this.hops || 0x03;
  this.cmd_1 = this.cmd_1 || 0x00;
  this.cmd_2 = this.cmd_2 || 0x00;

  flags = this.type;
  flags = flags << 1 | 0;
  flags = flags << 2 | this.hops;
  flags = flags << 2 | this.hops;

  utils.addrToBuffer(this.to).copy(buf, 0);
  buf.writeUInt8(flags, 3);
  buf.writeUInt8(this.cmd_1, 4);
  buf.writeUInt8(this.cmd_2, 5);

  return buf;
};

Serializers.send_insteon_extended = function () {
  var flags,
    buf = new Buffer(20);

  this.to = this.to || '00.00.01';

  this.type = this.type || ((this.to.indexOf('00.00') === 0) ? 0x06 : 0x00);
  this.hops = this.hops || 0x03;
  this.cmd_1 = this.cmd_1 || 0x00;
  this.cmd_2 = this.cmd_2 || 0x00;

  flags = this.type;
  flags = flags << 1 | 1;
  flags = flags << 2 | this.hops;
  flags = flags << 2 | this.hops;

  utils.addrToBuffer(this.to).copy(buf, 0);
  buf.writeUInt8(flags, 3);
  buf.writeUInt8(this.cmd_1, 4);
  buf.writeUInt8(this.cmd_2, 5);
  buf.writeUInt8(this.d1 || 0, 6);
  buf.writeUInt8(this.d2 || 0, 7);
  buf.writeUInt8(this.d3 || 0, 8);
  buf.writeUInt8(this.d4 || 0, 9);
  buf.writeUInt8(this.d5 || 0, 10);
  buf.writeUInt8(this.d6 || 0, 11);
  buf.writeUInt8(this.d7 || 0, 12);
  buf.writeUInt8(this.d8 || 0, 13);
  buf.writeUInt8(this.d9 || 0, 14);
  buf.writeUInt8(this.d10 || 0, 15);
  buf.writeUInt8(this.d11 || 0, 16);
  buf.writeUInt8(this.d12 || 0, 17);
  buf.writeUInt8(this.d13 || 0, 18);
  buf.writeUInt8(this.d14 || 0, 19);

  return buf;
};

Serializers.all_link_database_record = function () {
  var address;

  this.d1 = 0x00;
  if (this.record) {
    this.d2 = 0x00;
    this.d3 = utils.recordIdToArray(this.record)[0];
    this.d4 = utils.recordIdToArray(this.record)[1];
    this.d5 = 0x01;
  }

  if (this.address && (this.action === 'write' || this.action === 'delete')) {
    address = utils.addrToBuffer(this.address);
    this.d2 = 0x02;
    this.d5 = 0x08;
    this.d6 = parseInt(this.flags.raw, 2);

    //Set our flags
    this.d6 = this.used;
    this.d6 = (this.d6 << 1 | this.controller);
    this.d6 = (this.d6 << 1 | this.flags.bit5);
    this.d6 = (this.d6 << 1 | this.flags.bit4);
    this.d6 = (this.d6 << 1 | this.flags.bit3);
    this.d6 = (this.d6 << 1 | this.flags.bit2);
    this.d6 = (this.d6 << 1 | this.flags.used_before);
    this.d6 = (this.d6 << 1 | this.flags.reserved);

    this.d7 = parseInt(this.group, 10);
    this.d8 = address[0];
    this.d9 = address[1];
    this.d10 = address[2];
    this.d11 = parseInt(this.on_level, 10);
    this.d12 = parseInt(this.ramp_rate, 10);
    this.d13 = parseInt(this.button, 10);

    this.flags.raw = this.d6.toString(2);
    this.flags.used = (128 & this.result.d6) >> 7;
    this.flags.type = (64 & this.result.d6) >> 6;

    // Generate a crc for d14...
    // Inverse sum of cmd_1, cmd_2 and D1-D13 then bitwise & with 0xff
    var crc = [
      this.cmd_1,
      this.cmd_2,
      this.d1,
      this.d2,
      this.d3,
      this.d4,
      this.d5,
      this.d6,
      this.d7,
      this.d8,
      this.d9,
      this.d10,
      this.d11,
      this.d12,
      this.d13
    ].reduce(function(a, b) { return a + b; }, 0);
    crc = (crc * -1) & 0xff;
    this.d14 = crc;

  }
};

module.exports = Serializers;
