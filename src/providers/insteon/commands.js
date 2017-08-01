'use strict';

var serialize = require('./serializers'),
  deserialize = require('./deserializers');


var Commands = {};

Commands.GET_IM_INFO = {
  'code': 0x60,
  'w_size': 0,
  'r_size': 7,
  'deserialize': deserialize.im_info,
  'expect': [{'command': 'GET_IM_INFO'}]
};

Commands.GET_IM_CONFIGURATION = {
  'code': 0x73,
  'w_size': 0,
  'r_size': 4,
  'deserialize': deserialize.im_configuration,
  'expect': [{'command': 'GET_IM_CONFIGURATION'}]
};

Commands.START_ALL_LINKING = {
  'code': 0x64,
  'w_size': 2,
  'r_size': 3,
  'serialize': serialize.start_all_linking,
  'deserialize': deserialize.start_all_linking,
  'expect': [{'command': 'START_ALL_LINKING'}]
};

Commands.CANCEL_ALL_LINKING = {
  'code': 0x65,
  'w_size': 0,
  'r_size': 1,
  'deserialize': deserialize.ack,
  'expect': [{'command': 'CANCEL_ALL_LINKING'}]
};

Commands.GET_FIRST_ALL_LINK_RECORD = {
  'code': 0x69,
  'w_size': 0,
  'r_size': 1,
  'deserialize': deserialize.ack,
  'expect': [{'command': 'GET_FIRST_ALL_LINK_RECORD'}, {'command': 'ALL_LINK_RECORD_RESPONSE'}]
};

Commands.GET_NEXT_ALL_LINK_RECORD = {
  'code': 0x6a,
  'w_size': 0,
  'r_size': 1,
  'deserialize': deserialize.ack,
  'expect': [{'command': 'GET_NEXT_ALL_LINK_RECORD'}, {'command': 'ALL_LINK_RECORD_RESPONSE'}]
};

Commands.ALL_LINK_RECORD_RESPONSE = {
  'code': 0x57,
  'r_size': 8,
  'deserialize': deserialize.record
};

Commands.ALL_LINKING_COMPLETED = {
  'code': 0x53,
  'r_size': 8,
  'deserialize': deserialize.all_link_complete,
  'event': 'linked'
};

Commands.LED_ON = {
  'code': 0x6d,
  'w_size': 0,
  'r_size': 1,
  'deserialize': deserialize.ack,
  'expect': [{'command': 'LED_ON'}]
};

Commands.LED_OFF = {
  'code': 0x6e,
  'w_size': 0,
  'r_size': 1,
  'deserialize': deserialize.ack,
  'expect': [{'command': 'LED_OFF'}]
};

Commands.SEND_INSTEON_STANDARD = {
  'code': 0x62,
  'w_size': 6,
  'r_size': 7,
  'serialize': serialize.send_insteon_standard,
  'deserialize': deserialize.send_insteon_standard,
  'expect': [{'command': 'SEND_INSTEON_STANDARD'}]
};

Commands.SEND_INSTEON_EXTENDED = {
  'code': 0x62,
  'w_size': 20,
  'r_size': 21,
  'extended': true,
  'serialize': serialize.send_insteon_extended,
  'deserialize': deserialize.send_insteon_extended,
  'expect': [{'command': 'SEND_INSTEON_EXTENDED'}]
};

Commands.INSTEON_STANDARD_MESSAGE_RECEIVED = {
  'code': 0x50,
  'r_size': 9,
  'deserialize': deserialize.received_insteon_standard
};

Commands.INSTEON_EXTENDED_MESSAGE_RECEIVED = {
  'code': 0x51,
  'r_size': 23,
  'deserialize': deserialize.received_insteon_extended
};

Commands.BROADCAST_CLEANUP = {
  'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
  'receive': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x06,
    'cmd_2': 0x00
  },
  'deserialize': deserialize.broadcast_cleanup,
  'cmd_1': 0x06,
  'cmd_2': 0x00
};

Commands.LIGHT_ON = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x11,
  'cmd_2': 0xFF,
  'send': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x11,
    'cmd_2': 0xFF
  },
  'receive': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x11
  },
  'deserialize': deserialize.light_on
};

Commands.LIGHT_ON_FAST = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x12,
  'cmd_2': 0x01,
  'receive': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x12,
    'cmd_2': 0x01
  }
};

Commands.LIGHT_LEVEL = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x11
};

Commands.LIGHT_LEVEL_RATE = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x2e
};

Commands.LIGHT_BRIGHTEN = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x15,
  'cmd_2': 0x01
};

Commands.START_BRIGHTEN = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x17,
  'cmd_2': 0x01,
  'receive': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x17,
    'cmd_2': 0x01
  }
};

Commands.START_DIM = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x17,
  'cmd_2': 0x00,
  'receive': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x17,
    'cmd_2': 0x00
  }
};

Commands.STOP_CHANGE = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x18,
  'cmd_2': 0x01,
  'receive': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x18
  }
};

Commands.LIGHT_DIM = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x16,
  'cmd_2': 0x01
};

Commands.LIGHT_OFF = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x13,
  'cmd_2': 0xFF,
  'send': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x13,
    'cmd_2': 0xFF
  },
  'receive': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x13
  },
  'deserialize': deserialize.light_off
};

Commands.LIGHT_OFF_FAST = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x14,
  'cmd_2': 0x01,
  'receive': {
    'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED',
    'cmd_1': 0x14,
    'cmd_2': 0x01
  }
};

Commands.LIGHT_STATUS_REQUEST = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x19,
  'cmd_2': 0x00,
  'receive': {
    'cmd_1': 0x19
  },
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}],
  'deserialize': function () {},
  'post': deserialize.light_status_request
};

Commands.PING = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x0F,
  'cmd_2': 0x00
};

Commands.BEEP = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x30,
  'cmd_2': 0x00,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}]
};

Commands.READ_OPERATING_FLAGS = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x1f,
  'cmd_2': 0x00,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}],
};

Commands.GET_ALL_LINK_DATABASE_DELTA = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x1F,
  'cmd_2': 0x01,
  'post': deserialize.get_all_link_database_delta
};

Commands.EXIT_LINKING_MODE = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x08,
  'cmd_2': 0x00,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}]
};

Commands.ENTER_LINKING_MODE = {
  'command': 'SEND_INSTEON_EXTENDED',
  'cmd_1': 0x09,
  'serialize': serialize.enter_linking_mode,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}]
};

Commands.ENTER_UNLINKING_MODE = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x0A,
  'cmd_2': 0x00,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}]
};

Commands.SET_BUTTON_TAP = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x25,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}]
};

Commands.ASSIGN_TO_GROUP = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x01,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}]
};

Commands.UNASSIGN_FROM_GROUP = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x02,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}]
};

Commands.PRODUCT_DATA_REQUEST = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x03,
  'cmd_2': 0x00,
  'expect': [{'command': 'INSTEON_EXTENDED_MESSAGE_RECEIVED'}]
};

Commands.ID_REQUEST = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x10,
  'cmd_2': 0x00,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}, {'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}],
  'post': deserialize.id_request
};

Commands.DEVICE_TEXT_STRING_REQUEST = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x03,
  'cmd_2': 0x02,
  'expect': [{'command': 'INSTEON_STANDARD_MESSAGE_RECEIVED'}]
};

Commands.LIGHT_OFF_FAST = {
  'command': 'SEND_INSTEON_STANDARD',
  'cmd_1': 0x14,
  'cmd_2': 0x01
};

Commands.READ_WRITE_ALL_LINK_DATABASE = {
  'command': 'SEND_INSTEON_EXTENDED',
  'cmd_1': 0x2F,
  'cmd_2': 0x00,
  'serialize': serialize.all_link_database_record,
  'deserialize': deserialize.all_link_database_record
};

Commands.ALL_LINK_DATABASE_RECORD = {
  'command': 'INSTEON_EXTENDED_MESSAGE_RECEIVED',
  'cmd_1': 0x2F,
  'cmd_2': 0x00,
  'deserialize': deserialize.all_link_database_record
};

Commands.GET_SET_EXTENDED_DATA = {
  'command': 'SEND_INSTEON_EXTENDED',
  'cmd_1': 0x2E,
  'cmd_2': 0x00,
  'serialize': serialize.send_insteon_extended,
  'deserialize': deserialize.extended_data,
  'expect': [{'command': 'INSTEON_EXTENDED_MESSAGE_RECEIVED'}]
};

Commands.EXTENDED_DATA = {
  'command': 'INSTEON_EXTENDED_MESSAGE_RECEIVED',
  'cmd_1': 0x2E,
  'cmd_2': 0x00,
  'deserialize': deserialize.extended_data,
  'expect': [{'command': 'INSTEON_EXTENDED_MESSAGE_RECEIVED'}]
};

module.exports = Commands;
