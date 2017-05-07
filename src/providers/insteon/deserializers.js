'use strict';

var utils = require('./utils');

var Deserializers = {};

Deserializers.im_info = function () {
  var msg = this.buffer,
    status = msg.readUInt8(6);

  status = (status === 0x06) ? 'success': 'error';

  this.result.address = utils.bufferToAddr(msg.slice(0,3));
  this.result.device_cat = msg.readUInt8(3);
  this.result.device_subcat = msg.readUInt8(4);
  this.result.firmware = msg.readUInt8(5);
  this.result.status = status;
};

Deserializers.im_configuration = function () {
  var msg = this.buffer,
    flags = msg.readUInt8(0,1),
    status = msg.readUInt8(3,4);

  this.result.monitor = flags & parseInt('100000', 2);
  this.result.set_disabled = flags & parseInt('10000', 2);
  this.result.auto_led = flags & parseInt('1000', 2);
  this.result.deadman = flags & parseInt('100', 2);
  this.result.status = (status === 0x06) ? 'success': 'error';
};

Deserializers.start_all_linking = function () {
  var msg = this.buffer,
    status = msg.readUInt8(2);

  status = (status === 0x06) ? 'success': 'error';

  this.result.code = msg.readUInt8(0);
  this.result.group = msg.readUInt8(1);
  this.result.status = status;
};

Deserializers.record = function () {
  var msg = this.buffer,
    flags_dec = msg.readUInt8(0);

  this.result.group =  msg.readUInt8(1);
  this.result.addr = utils.bufferToAddr(msg.slice(2,5));
  this.result.on_level = msg.readUInt8(5);
  this.result.ramp_rate = msg.readUInt8(6);
  this.result.button = msg.readUInt8(7);


  this.result.flags = flags_dec.toString(2);
  this.result.used = parseInt(this.result.flags[0], 10);
  this.result.type = parseInt(this.result.flags[1], 10);
  this.result.bit5 = parseInt(this.result.flags[2], 10);
  this.result.bit4 = parseInt(this.result.flags[3], 10);
  this.result.bit3 = parseInt(this.result.flags[4], 10);
  this.result.bit2 = parseInt(this.result.flags[5], 10);
  this.result.used_before = parseInt(this.result.flags[6], 10);
  this.result.reserved = parseInt(this.result.flags[7], 10);

  this.result.controller = (this.result.type === 1);
  this.result.responder = (this.result.type === 0);

  this.result.status = 'success';
};


Deserializers.all_link_complete = function () {
  var msg = this.buffer;

  this.result.type = msg.readUInt8(0);
  this.result.group = msg.readUInt8(1);
  this.result.address = utils.bufferToAddr(msg.slice(2,5));
  this.result.device_cat = msg.readUInt8(5);
  this.result.device_subcat = msg.readUInt8(6);
  this.result.firmware = msg.readUInt8(7);

};

Deserializers.ack = function() {
  var msg = this.buffer,
    status = msg.readUInt8(0);

  status = (status === 0x06) ? 'success': 'error';

  this.result.status = status;
};

Deserializers.light_on = function() {
  this.result.on = true;
  this.result.level = 100;
};

Deserializers.light_off = function() {
  this.result.on = false;
  this.result.level = 0;
};

Deserializers.light_status_request = function() {
  if (this.responses) {
    this.result.on = (this.result.cmd_2 > 0);
    this.result.level = Math.round((this.result.cmd_2 / 255) * 100);
  }
};

Deserializers.get_all_link_database_delta = function() {
  this.result.database_delta = this.result.cmd_2;
};

Deserializers.received_insteon_standard = function () {
  var msg = this.buffer,
    flags = msg.readUInt8(6);

  this.result.flags = flags.toString(2);
  this.result.type = (flags >> 5);

  this.result.broadcast = (this.result.type === parseInt('100', 2));
  this.result.direct = (this.result.type === parseInt('0', 2));
  this.result.direct_ack = (this.result.type === parseInt('1', 2));
  this.result.direct_nak = (this.result.type === parseInt('101', 2));
  this.result.all_link_broadcast = (this.result.type === parseInt('110', 2));
  this.result.all_link_cleanup = (this.result.type === parseInt('10', 2));
  this.result.all_link_cleanup_ack = (this.result.type === parseInt('11', 2));
  this.result.all_link_cleanup_nak = (this.result.type === parseInt('111', 2));

  this.result.extended = (flags >> 4 & 1);
  this.result.hops_left = (flags >> 2 & 3);
  this.result.max_hops = (flags & 3);

  this.result.from = utils.bufferToAddr(msg.slice(0,3));
  this.result.to = utils.bufferToAddr(msg.slice(3,6));
  this.result.cmd_1 = msg.readUInt8(7);
  this.result.cmd_2 = msg.readUInt8(8);

  this.result.status = 'success';
  //this.result.cmd_1 = msg.slice(7,8)[0];
  //this.result.cmd_2 = msg.slice(8,9)[0];
};

Deserializers.received_insteon_extended = function () {
  var msg = this.buffer,
    flags = msg.readUInt8(6);

  this.result.flags = flags.toString(2);
  this.result.type = (flags >> 5);

  this.result.broadcast = (this.result.type === parseInt('100', 2));
  this.result.direct = (this.result.type === parseInt('0', 2));
  this.result.direct_ack = (this.result.type === parseInt('1', 2));
  this.result.direct_nak = (this.result.type === parseInt('101', 2));
  this.result.all_link_broadcast = (this.result.type === parseInt('110', 2));
  this.result.all_link_cleanup = (this.result.type === parseInt('10', 2));
  this.result.all_link_cleanup_ack = (this.result.type === parseInt('11', 2));
  this.result.all_link_cleanup_nak = (this.result.type === parseInt('111', 2));

  this.result.extended = (flags >> 4 & 1);
  this.result.hops_left = (flags >> 2 & 3);
  this.result.max_hops = (flags & 3);

  this.result.from = utils.bufferToAddr(msg.slice(0,3));
  this.result.to = utils.bufferToAddr(msg.slice(3,6));
  this.result.cmd_1 = msg.readUInt8(7);
  this.result.cmd_2 = msg.readUInt8(8);
  this.result.d1 = msg.readUInt8(9);
  this.result.d2 = msg.readUInt8(10);
  this.result.d3 = msg.readUInt8(11);
  this.result.d4 = msg.readUInt8(12);
  this.result.d5 = msg.readUInt8(13);
  this.result.d6 = msg.readUInt8(14);
  this.result.d7 = msg.readUInt8(15);
  this.result.d8 = msg.readUInt8(16);
  this.result.d9 = msg.readUInt8(17);
  this.result.d10 = msg.readUInt8(18);
  this.result.d11 = msg.readUInt8(19);
  this.result.d12 = msg.readUInt8(20);
  this.result.d13 = msg.readUInt8(21);
  this.result.d14 = msg.readUInt8(22);

  this.result.status = 'success';
  //this.result.cmd_1 = msg.slice(7,8)[0];
  //this.result.cmd_2 = msg.slice(8,9)[0];
};

Deserializers.send_insteon_standard = function () {
  var msg = this.buffer,
    status = msg.readUInt8(6),
    flags_dec = msg.readUInt8(3);

  status = (status === 0x06) ? 'success': 'error';

  this.result.cmd_1 = msg.readUInt8(4);
  this.result.cmd_2 = msg.readUInt8(5);
  this.result.flags = flags_dec.toString(2);
  this.result.type = (flags_dec >> 5);

  this.result.broadcast = (this.result.type === parseInt('100', 2));
  this.result.direct = (this.result.type === parseInt('0', 2));
  this.result.direct_ack = (this.result.type === parseInt('1', 2));
  this.result.direct_nak = (this.result.type === parseInt('101', 2));
  this.result.all_link_broadcast = (this.result.type === parseInt('110', 2));
  this.result.all_link_cleanup = (this.result.type === parseInt('10', 2));
  this.result.all_link_cleanup_ack = (this.result.type === parseInt('11', 2));
  this.result.all_link_cleanup_nak = (this.result.type === parseInt('111', 2));

  this.result.extended = (flags_dec >> 4 & 1);
  this.result.hops_left = (flags_dec >> 2 & 3);
  this.result.max_hops = (flags_dec & 3);
  this.result.to = utils.bufferToAddr(msg.slice(0,3));
  this.result.status = status;


};

Deserializers.send_insteon_extended = function () {
  var msg = this.buffer,
    status = msg.readUInt8(20),
    flags_dec = msg.readUInt8(3);

  status = (status === 0x06) ? 'success': 'error';

  this.result.cmd_1 = msg.readUInt8(4);
  this.result.cmd_2 = msg.readUInt8(5);
  this.result.d1 = msg.readUInt8(6);
  this.result.d2 = msg.readUInt8(7);
  this.result.d3 = msg.readUInt8(8);
  this.result.d4 = msg.readUInt8(9);
  this.result.d5 = msg.readUInt8(10);
  this.result.d6 = msg.readUInt8(11);
  this.result.d7 = msg.readUInt8(12);
  this.result.d8 = msg.readUInt8(13);
  this.result.d9 = msg.readUInt8(14);
  this.result.d10 = msg.readUInt8(15);
  this.result.d11 = msg.readUInt8(16);
  this.result.d12 = msg.readUInt8(17);
  this.result.d13 = msg.readUInt8(18);
  this.result.d14 = msg.readUInt8(19);

  this.result.flags = flags_dec.toString(2);
  this.result.type = (flags_dec >> 5);
  this.result.extended = (flags_dec >> 4 & 1);
  this.result.hops_left = (flags_dec >> 2 & 3);
  this.result.max_hops = (flags_dec & 3);
  this.result.to = utils.bufferToAddr(msg.slice(0,3));
  this.result.status = status;
};

Deserializers.broadcast_cleanup = function () {
  var parts = this.result.to.split('.');

  this.result.cmd_1 = parseInt(parts[0], 16);
};

Deserializers.all_link_database_record = function () {


  this.result.record = {};
  this.result.record.type = this.result.d2;
  this.result.record.id = utils.toHex(this.result.d3) + '.' + utils.toHex(this.result.d4);
  this.result.record.flags = this.result.d6;
  this.result.record.group = this.result.d7;
  this.result.record.address = utils.bufferToAddr([this.result.d8, this.result.d9, this.result.d10]);
  this.result.record.data = [this.result.d11, this.result.d12, this.result.d13];

  this.result.record.on_level = this.result.d11;
  this.result.record.ramp_rate = this.result.d12;
  this.result.record.button = this.result.d13;
  this.result.record.d14 = this.result.d14;

  this.result.record.flags = {
    'raw': this.result.d6.toString(2)
  };
  this.result.record.flags.used = (128 & this.result.d6) >> 7;
  this.result.record.flags.type = (64 & this.result.d6) >> 6;
  this.result.record.flags.bit5 = (32 & this.result.d6) >> 5;
  this.result.record.flags.bit4 = (16 & this.result.d6) >> 4;
  this.result.record.flags.bit3 = (8 & this.result.d6) >> 3;
  this.result.record.flags.bit2 = (4 & this.result.d6) >> 2;
  this.result.record.flags.used_before = (2 & this.result.d6) >> 1;
  this.result.record.flags.reserved = (1 & this.result.d6);

  this.result.record.used = (this.result.record.flags.used === 1);
  this.result.record.controller = (this.result.record.flags.type === 1);

};

Deserializers.extended_data = function () {


  this.result.data = {};
  this.result.data.ramp_rate = this.result.d7;
  this.result.data.on_level = this.result.d8;

};

Deserializers.id_request = function () {

  this.result.devcat = this.result.cmd_1;
  this.result.subcat = this.result.cmd_2;

};

module.exports = Deserializers;
