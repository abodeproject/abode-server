'use strict';
//page 16
//var devices = require('../../devices');
var abode,
  insteon,
  dev_commands,
  im_commands;

var toHex = function (v) {
  var hex = v.toString(16);

  if (hex.length === 1) {
    hex = '0' + hex;
  }

  return hex;
};

//Lookup Device comand by cmd_1 and cmd_2
var lookupCommand = function (cmd_1, cmd_2) {
  var name;

  for (name in dev_commands) {
    if (dev_commands.hasOwnProperty(name) === false) {
      continue;
    }

    if (cmd_1 === dev_commands[name].cmd_1 && (dev_commands[name].cmd_2 === undefined || cmd_2 === dev_commands[name].cmd_2) ) {
      return name;
    }
  }

  return 'UNKNOWN';
};

var deserialize_received_insteon_standard = function (msg) {
  var to = {},
    from = {},
    flags = {},
    cmd_1 = msg.slice(7,8)[0],
    cmd_2 = msg.slice(8,9)[0],
    flags_raw = msg.slice(6,7),
    flags_dec = flags_raw.readUInt8(0);

  flags.raw = flags_raw;
  flags.type = (flags_dec >> 5);
  flags.extended = (flags_dec >> 4 & 1);
  flags.hops_left = (flags_dec >> 2 & 3);
  flags.max_hops = (flags_dec & 3);

  from.addr = insteon.modem.bufferToAddr(msg.slice(0,3));
  from.name = insteon.lookupByAddr(from.addr);
  to.addr = insteon.modem.bufferToAddr(msg.slice(3,6));
  to.name = insteon.lookupByAddr(to.addr);

  return {
    'from': from,
    'to': to,
    'flags': flags,
    'cmd': lookupCommand(cmd_1, cmd_2),
    'cmd_1': cmd_1,
    'cmd_2': cmd_2,
  };
};

var serialize_send_insteon_standard = function (config) {
  var to_addr;

  config = config || {};

  config.to = config.to || '';
  to_addr = (config.to === '') ? '00.00.01': insteon.lookupByName(config.to);

  console.log(config);

  config.type = config.type || ((to_addr.indexOf('00.00') === 0) ? 0x06 : 0x00);
  config.hops = config.hops || 0x03;
  config.cmd_1 = config.cmd_1 || 0x00;
  config.cmd_2 = config.cmd_2 || 0x00;


  if (to_addr === undefined) {
    console.log('Unknown device', config.to);
    return false;
  }

  var flags = config.type;
  flags = flags << 1 | 0;
  flags = flags << 2 | config.hops;
  flags = flags << 2 | config.hops;

  to_addr = insteon.modem.addrToBuffer(to_addr);

  var buf = new Buffer(6);
  to_addr.copy(buf, 0);
  buf.writeUInt8(flags, 3);
  buf.writeUInt8(config.cmd_1, 4);
  buf.writeUInt8(config.cmd_2, 5);

  return buf;
};

var deserialize_send_insteon_standard = function (msg) {
  var to = {},
    flags = {},
    status = msg.readUInt8(6),
    flags_dec = msg.readUInt8(3);

  flags.raw = flags_dec;
  flags.type = (flags_dec >> 5);
  flags.extended = (flags_dec >> 4 & 1);
  flags.hops_left = (flags_dec >> 2 & 3);
  flags.max_hops = (flags_dec & 3);

  to.addr = insteon.modem.bufferToAddr(msg.slice(0,3));
  to.name = insteon.lookupByAddr(to.addr);

  status = (status === 0x06) ? 'success': 'error';

  return {
    'to': to,
    'flags': flags,
    'cmd_1': msg.readUInt8(4),
    'cmd_2': msg.readUInt8(5),
    'status': status
  };
};

var deserialize_send_insteon_extended = function (msg) {
  var to = {},
    from = {},
    cmd_1 = msg.slice(7,8)[0],
    cmd_2 = msg.slice(8,9)[0],
    flags = {},
    flags_dec = msg.readUInt8(3);

  flags.raw = flags_dec;
  flags.type = (flags_dec >> 5);
  flags.extended = (flags_dec >> 4 & 1);
  flags.hops_left = (flags_dec >> 2 & 3);
  flags.max_hops = (flags_dec & 3);

  from.addr = insteon.modem.bufferToAddr(msg.slice(0,3));
  from.name = insteon.lookupByAddr(from.addr);
  to.addr = insteon.modem.bufferToAddr(msg.slice(3,6));
  to.name = insteon.lookupByAddr(to.addr);

  return {
    'from': from,
    'to': to,
    'flags': flags,
    'cmd': lookupCommand(cmd_1, cmd_2),
    'cmd_1': cmd_1,
    'cmd_2': cmd_2,
    'user_data': msg.slice(9,24)
  };
};

var deserialize_im_configuration = function (msg) {
  var flags = msg.readUInt8(0,1),
    status = msg.readUInt8(3,4),
    monitor = flags & parseInt('100000', 2),
    set_disabled = flags & parseInt('10000', 2),
    auto_led = flags & parseInt('1000', 2),
    deadman = flags & parseInt('100', 2);

  status = (status === 0x06) ? 'success': 'error';
  return {
    'status': status,
    'monitor': monitor,
    'set_disabled': set_disabled,
    'auto_led': auto_led,
    'deadman': deadman
  };
};

var deserialize_im_info = function (msg) {
  var addr = insteon.modem.bufferToAddr(msg.slice(0,3)),
    device_category = msg.readUInt8(3),
    device_subcategory = msg.readUInt8(4),
    firmware = msg.readUInt8(5),
    status = msg.readUInt8(6);

  status = (status === 0x06) ? 'success': 'error';

  return {
    'addr': addr,
    'name': insteon.lookupByAddr(addr),
    'device_category': device_category,
    'device_subcategory': device_subcategory,
    'firmware': firmware,
    'status': status
  };
};

var deserialize_ack = function(msg) {
  var status = msg.readUInt8(0);

  status = (status === 0x06) ? 'success': 'error';

  return {'status': status};
};

var deserialize_record = function (msg) {
  var flags_dec = msg.readUInt8(0),
    group = msg.readUInt8(1),
    addr = insteon.modem.bufferToAddr(msg.slice(2,5)),
    data_1 = msg.readUInt8(5),
    data_2 = msg.readUInt8(6),
    data_3 = msg.readUInt8(7);


  var flags = {};
  flags.raw = flags_dec.toString(2);
  flags.used = parseInt(flags.raw[0], 10);
  flags.type = parseInt(flags.raw[1], 10);
  flags.bit5 = parseInt(flags.raw[2], 10);
  flags.bit4 = parseInt(flags.raw[3], 10);
  flags.bit3 = parseInt(flags.raw[4], 10);
  flags.bit2 = parseInt(flags.raw[5], 10);
  flags.used_before = parseInt(flags.raw[6], 10);
  flags.reserved = parseInt(flags.raw[7], 10);

  return {
    'flags': flags,
    'controller': (flags.type === 1),
    'responder':  (flags.type === 0),
    'group': group,
    'addr': addr,
    'name': insteon.lookupByAddr(addr),
    'on_level': data_1,
    'ramp_rate': data_2,
    'data_3': data_3
  };
};

var serialize_set_im_configuration = function (device, config) {
  var buf = new Buffer(2);

  //01000000
  config = config || {};
  config.code = config.code || 0x6B;
  config.group = config.group || 0x40;

  buf.writeUInt8(config.code, 0);
  buf.writeUInt8(config.group, 1);

  return buf;
};

var deserialize_set_im_configuration = function (msg) {
  var code = msg.readUInt8(0),
    group = msg.readUInt8(1);

  return {
    'code': code,
    'group': group
  };
};

var serialize_start_all_linking = function (device, config) {
  var buf = new Buffer(2);

  config = config || {};
  config.code = config.code || 0x03;
  config.group = config.group || 0x01;

  buf.writeUInt8(config.code, 0);
  buf.writeUInt8(config.group, 1);

  return buf;
};

var deserialize_start_all_linking = function (msg) {
  var code = msg.readUInt8(0),
    group = msg.readUInt8(1),
    status = msg.readUInt8(2);

  status = (status === 0x06) ? 'success': 'error';

  return {
    'code': code,
    'group': group,
    'status': status
  };
};

var deserialize_all_link_complete = function (msg) {

  var type = msg.readUInt8(0),
    group = msg.readUInt8(1),
    addr = insteon.modem.bufferToAddr(msg.slice(2,5)),
    device_cat = msg.readUInt8(5),
    device_subcat = msg.readUInt8(6),
    firmware = msg.readUInt8(7);

  return {
    'controller': (type === 1),
    'responder':  (type === 0),
    'group': group,
    'address': addr,
    'capabilities': ['light'],
    'device_cat': toHex(device_cat),
    'device_subcat': toHex(device_subcat),
    'firmware': firmware
  };
};

//page 139
//Insteon Device Message commands
dev_commands = {
  'ASSIGN_TO_ALL_LINK_GROUP': {'cmd_1': 0x01},
  'DELETE_FROM_ALL_LINK_GROUP': {'cmd_1': 0x02},
  'PRODUCT_DATA_REQUEST': {'cmd_1': 0x03, 'cmd_2': 0x00},
  'FX_USERNAME_REQUEST': {'cmd_1': 0x03, 'cmd_2': 0x01},
  'DEVICE_TEXT_STRING_REQUEST': {'cmd_1': 0x03, 'cmd_2': 0x02},
  'BROADCAST_CLEANUP': {'cmd_1': 0x06, 'cmd_2': 0x00},
  'EXIT_LINKING_MODE': {'cmd_1': 0x08},
  'ENTER_LINKING_MODE': {'cmd_1': 0x09},
  'ENTER_UNLINKING_MODE': {'cmd_1': 0x0a},
  'GET_INSTEON_ENGINE_VERSION': {'cmd_1': 0x0d, 'cmd_2': 0x00},
  'PING': {'cmd_1': 0x0f},
  'ID_REQUEST': {'cmd_1': 0x10},
  'LIGHT_ON': {'cmd_1': 0x11},
  'LIGHT_ON_FAST': {'cmd_1': 0x12},
  'LIGHT_OFF': {'cmd_1': 0x13},
  'LIGHT_OFF_FAST': {'cmd_1': 0x14},
  'LIGHT_BRIGHTEN_ONE': {'cmd_1': 0x15, 'cmd_2': 0x01},
  'LIGHT_DIM_ONE': {'cmd_1': 0x16, 'cmd_2': 0x01},
  'LIGHT_START_MANUAL_CHANGE': {'cmd_1': 0x17},
  'LIGHT_STOP_MANUAL_CHANGE': {'cmd_1': 0x18},
  'LIGHT_STATUS_REQUEST': {'cmd_1': 0x19},
  'GET_OPERATING_FLAGS': {'cmd_1': 0x1F},
  'LIGHT_ON_RAMP_RATE': {'cmd_1': 0x2E},
  'LIGHT_OFF_RAMP_RATE': {'cmd_1': 0x2F},
  'THERMOSTAT_MODE': {'cmd_1': 0x6B},
  'THERMOSTAT_UP': {'cmd_1': 0x68},
  'THERMOSTAT_DOWN': {'cmd_1': 0x69},
  'THERMOSTAT_SET_COOL': {'cmd_1': 0x6C},
  'THERMOSTAT_SET_HEAT': {'cmd_1': 0x6D},
};

//Insteon Modem Commands
im_commands  = {
  'INSTEON_STANDARD_MESSAGE_RECEIVED': {
    'deserialize': deserialize_received_insteon_standard,
    'code': 0x50,
    'r_size': 9,
  },
  'INSTEON_EXTENDED_MESSAGE_RECEIVED': {
    'deserialize': deserialize_send_insteon_extended,
    'code': 0x51,
    'r_size': 23,
  },
  'X10_RECEIVED': {'code': 0x52, 'r_size': 2},
  'ALL_LINKING_COMPLETED': {'code': 0x53, 'r_size': 8, 'deserialize': deserialize_all_link_complete},
  'BUTTON_EVENT_REPORT': {'code': 0x54, 'r_size': 1},
  'USER_RESET_DETECTED': {'code': 0x55, 'r_size': 0},
  'ALL_LINK_CLEANUP_FAILURE': {'code': 0x56, 'r_size': 4},
  'ALL_LINK_RECORD_RESPONSE': {'code': 0x57, 'r_size': 8, 'deserialize': deserialize_record},
  'ALL_LINK_CLEANUP_STATUS_REPORT': {'code': 0x58, 'r_size': 1},
  'GET_IM_INFO': {'code': 0x60, 'w_size': 0, 'r_size': 7, 'deserialize': deserialize_im_info},
  'SEND_ALL_LINK_COMMAND': {'code': 0x61, 'w_size': 3, 'r_size': 4},
  'SEND_INSTEON_STANDARD': {
    'serialize': serialize_send_insteon_standard,
    'deserialize': deserialize_send_insteon_standard,
    'code': 0x62,
    'w_size': 6,
    'r_size': 7
  },
  'SEND_INSTEON_EXTENDED': {'code': 0x62, 'w_size': 20, 'r_size': 20},
  'SEND_X10': {'code': 0x63, 'w_size': 2, 'r_size': 3},
  'START_ALL_LINKING': {'code': 0x64, 'w_size': 2, 'r_size': 3, 'serialize': serialize_start_all_linking, 'deserialize': deserialize_start_all_linking},
  'CANCEL_ALL_LINKING': {'code': 0x65, 'w_size': 0, 'r_size': 1, 'deserialize': deserialize_ack},
  'SET_HOST_DEVICE_CATEGORY': {'code': 0x66, 'w_size': 3, 'r_size': 4},
  'RESET_THE_IM': {'code': 0x67, 'w_size': 0, 'r_size': 1},
  'SET_INSTEON_ACK_MESSAGE_BYTE': {'code': 0x68, 'w_size': 1, 'r_size': 2},
  'GET_FIRST_ALL_LINK_RECORD': {'code': 0x69, 'w_size': 0, 'r_size': 1, 'deserialize': deserialize_ack},
  'GET_NEXT_ALL_LINK_RECORD': {'code': 0x6a, 'w_size': 0, 'r_size': 1,  'deserialize': deserialize_ack},
  'SET_IM_CONFIGURATION': {'code': 0x6b, 'w_size': 2, 'r_size': 2, 'serialize': serialize_set_im_configuration, 'deserialize': deserialize_set_im_configuration},
  'GET_ALL_LINK_RECORD_FOR_SENDER': {'code': 0x6c, 'w_size': 0, 'r_size': 1},
  'LED_ON': {'code': 0x6d, 'w_size': 0, 'r_size': 1, 'deserialize': deserialize_ack},
  'LED_OFF': {'code': 0x6e, 'w_size': 0, 'r_size': 1, 'deserialize': deserialize_ack},
  'MANAGE_ALL_LINK_RECORD': {'code': 0x6f, 'w_size': 9, 'r_size': 10},
  'SET_INSTEON_NAK_MESSAGE_BYTE': {'code': 0x70, 'w_size': 1, 'r_size': 2},
  'SET_INSTEON_ACK_MESSAGE_TWO_BYTE': {'code': 0x71, 'w_size': 2, 'r_size': 3},
  'RF_SLEEP': {'code': 0x72, 'w_size': 0, 'r_size': 1, 'deserialize': deserialize_ack},
  'GET_IM_CONFIGURATION': {'code': 0x73, 'w_size': 0, 'r_size': 4, 'deserialize': deserialize_im_configuration}
};

module.exports = function (config, provider) {
  abode = config;
  insteon = provider;

  return {
    dev_commands: dev_commands,
    im_commands: im_commands,
    lookupByName: function (name) {
      return im_commands[name];
    },
    lookupByCode: function (code) {
      var cmd;

      for (cmd in im_commands) {
        if (im_commands.hasOwnProperty(cmd)) {

          if (code === im_commands[cmd].code) {
            im_commands[cmd].name = cmd;
            return im_commands[cmd];
          }
        }
      }

      return false;
    }
  };
};
