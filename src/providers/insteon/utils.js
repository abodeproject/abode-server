'use strict';

var Utils = {};

Utils.toHex = function (v) {
  var hex = v.toString(16);

  if (hex.length === 1) {
    hex = '0' + hex;
  }

  return hex;
};

Utils.bufferToAddr = function (addr) {
  return Utils.toHex(addr[0]) + '.' + Utils.toHex(addr[1]) + '.' + Utils.toHex(addr[2]);
};

Utils.addrToBuffer = function (addr) {
  var buf = new Buffer(3),
    addr_parts = addr.split('.');

  buf.writeUInt8(parseInt(addr_parts[0],16), 0);
  buf.writeUInt8(parseInt(addr_parts[1],16), 1);
  buf.writeUInt8(parseInt(addr_parts[2],16), 2);

  return buf;
};

Utils.recordIdToArray = function (id) {
  var result = [],
    parsed = id.split('.');

  result[0] = parseInt(parsed[0], 16);
  result[1] = parseInt(parsed[1], 16);

  return result;

};

Utils.bufferToString = function (buf) {
  var str = [];

  buf.forEach(function (value) {
    str.push('0x' + Utils.toHex(value));
  });

  return str.join(' ');
};

module.exports = Utils;
