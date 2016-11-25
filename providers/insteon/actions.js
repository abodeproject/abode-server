'use strict';

var abode,
  insteon;

var actions = function (config, provider) {
  abode = config;
  insteon = provider;

  return {
    DIRECT_START_LINKING: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x09,
          'cmd_2': 0x00
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    DIRECT_ADD_TO_GROUP: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        },
        {
          'name': 'Group',
          'type': 'number'
        }
      ],
      'handler': function (dev, level) {
        var config;

        level = (level === undefined) ? 0 : level;
        config = {
          'to': dev,
          'cmd_1': 0x01,
          'cmd_2': level
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    DIRECT_START_UNLINKING: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x0A,
          'cmd_2': 0x00
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    DIRECT_REMOVE_FROM_GROUP: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        },
        {
          'name': 'Group',
          'type': 'number'
        }
      ],
      'handler': function (dev, level) {
        var config;

        level = (level === undefined) ? 0 : level;
        config = {
          'to': dev,
          'cmd_1': 0x02,
          'cmd_2': level
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    LIGHT_LEVEL: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        },
        {
          'name': 'Level',
          'type': 'percent'
        }
      ],
      'handler': function (dev, level) {
        var config;

        level = ~~ (255 * parseInt(level, 10) / 100);
        config = {
          'to': dev,
          'cmd_1': 0x11,
          'cmd_2': level
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    LIGHT_LEVEL_RATE: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        },
        {
          'name': 'Level',
          'type': 'percent'
        },
        {
          'name': 'Rate',
          'type': 'percent'
        }
      ],
      'handler': function (dev, level, rate) {
        var config,
          cmd_2;

        level = (15 * parseInt(level, 10) / 100);
        rate = (15 * parseInt(level, 10) / 100);
        cmd_2 = ~~ ((level << 4) + rate);

        config = {
          'to': dev,
          'cmd_1': 0x2e,
          'cmd_2': cmd_2
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    START_BRIGHTEN: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        },
        {
          'name': 'Level',
          'type': 'percent'
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x17,
          'cmd_2': 1
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    START_DIM: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        },
        {
          'name': 'Level',
          'type': 'percent'
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x17,
          'cmd_2': 0
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    STOP_CHANGE: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        },
        {
          'name': 'Level',
          'type': 'percent'
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x18,
          'cmd_2': 0
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    LIGHT_ON: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x11,
          'cmd_2': 0xFF
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    LIGHT_ON_FAST: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x12,
          'cmd_2': 0x01
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    LIGHT_OFF: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x13,
          'cmd_2': 0x01
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    LIGHT_OFF_FAST: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x14,
          'cmd_2': 0x01
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    LIGHT_STATUS: {
      'arguments': [],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x19,
          'cmd_2': 0x00
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD'],['INSTEON_STANDARD_MESSAGE_RECEIVED']);
      }
    },
    SENSOR_STATUS: {
      'arguments': [],
      'handler': function (dev, sensor) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x4a,
          'cmd_2': sensor || 0,
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD'],['INSTEON_STANDARD_MESSAGE_RECEIVED']);
      }
    },
    LIGHT_BRIGHTEN: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x15,
          'cmd_2': 0x01
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    LIGHT_DIM: {
      'arguments': [
        {
          'name': 'Device',
          'type': 'options',
          'options': insteon.dev_names
        }
      ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x16,
          'cmd_2': 0x01
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    LED_OFF: {
      'arguments': [],
      'handler': function () {
        return insteon.modem.send('LED_OFF', undefined, ['LED_OFF']);
      }
    },
    LED_ON: {
      'arguments': [],
      'handler': function () {
        return insteon.modem.send('LED_ON', undefined, ['LED_ON']);
      }
    },
    GET_IM_CONFIGURATION: {
      'arguments': [],
      'handler': function () {
        return insteon.modem.send('GET_IM_CONFIGURATION', undefined, ['GET_IM_CONFIGURATION']);
      }
    },
    GET_IM_INFO: {
      'arguments': [],
      'handler': function () {
        return insteon.modem.send('GET_IM_INFO', undefined, ['GET_IM_INFO']);
      }
    },
    GET_FIRST_ALL_LINK_RECORD: {
      'arguments': [],
      'handler': function () {
        return insteon.modem.send('GET_FIRST_ALL_LINK_RECORD', undefined, ['GET_FIRST_ALL_LINK_RECORD', 'ALL_LINK_RECORD_RESPONSE']);
      }
    },
    GET_NEXT_ALL_LINK_RECORD: {
      'arguments': [],
      'handler': function () {
        return insteon.modem.send('GET_NEXT_ALL_LINK_RECORD', undefined, ['GET_NEXT_ALL_LINK_RECORD', 'ALL_LINK_RECORD_RESPONSE']);
      }
    },
    START_ALL_LINKING: {
      'arguments': [
        {
          'name': 'Mode',
          'type': 'options',
          'options': ['Responder', 'Controller', 'Either', 'Deleted']
        },
        {
          'name': 'Group',
          'type': 'number'
        }
      ],
      'handler': function (code, group) {
        var config = {
          code: code || 0x01,
          group: group || 0x01
        };

        return insteon.modem.send('START_ALL_LINKING', config, ['START_ALL_LINKING']);
      }
    },
    CANCEL_ALL_LINKING: {
      'arguments': [],
      'handler': function (config) {
        return insteon.modem.send('CANCEL_ALL_LINKING', config, ['CANCEL_ALL_LINKING']);
      }
    },
    PRODUCT_DATA_REQUEST: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x03,
          'cmd_2': 0x00
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD', 'INSTEON_STANDARD_MESSAGE_RECEIVED', 'INSTEON_EXTENDED_MESSAGE_RECEIVED']);
        //return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD', 'INSTEON_STANDARD_MESSAGE_RECEIVED']);
      }
    },
    THERMOSTAT_UP: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x68,
          'cmd_2': 0x01
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    THERMOSTAT_DOWN: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x69,
          'cmd_2': 0x01
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    THERMOSTAT_MODE: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x6B,
          'cmd_2': 0x02
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    THERMOSTAT_TEMPERATURE: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x6A,
          'cmd_2': 0x00
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    THERMOSTAT_HEAT_ON: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x6B,
          'cmd_2': 0x04
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    THERMOSTAT_COOL_ON: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x6B,
          'cmd_2': 0x04
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    THERMOSTAT_ALL_OFF: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x6B,
          'cmd_2': 0x09
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      },
    },
    THERMOSTAT_STATE: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x6B,
          'cmd_2': 0x0D
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    THERMOSTAT_SET_COOL: {
      'arguments': [ ],
      'handler': function (dev, temp) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x6C,
          'cmd_2': (parseInt(temp, 10) * 0.5)
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    THERMOSTAT_SET_HEAT: {
      'arguments': [ ],
      'handler': function (dev, temp) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x6D,
          'cmd_2': (parseInt(temp, 10) * 0.5)
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
    THERMOSTAT_ENABLE_STATUS: {
      'arguments': [ ],
      'handler': function (dev) {
        var config;

        config = {
          'to': dev,
          'cmd_1': 0x6D,
          'cmd_2': 0x16
        };

        return insteon.modem.send('SEND_INSTEON_STANDARD', config, ['SEND_INSTEON_STANDARD']);
      }
    },
  };
};

module.exports = actions;
