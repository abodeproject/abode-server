'use strict';

var logger = require('log4js'),
  log = logger.getLogger('isy');

var IsyDevice = require('./IsyDevice');
var InsteonDevice = require('./InsteonDevice');
var InsteonDimmer = require('./InsteonDimmer');
var InsteonKeyPadDimmer = require('./InsteonKeyPadDimmer');
var InsteonLock = require('./InsteonLock');
var InsteonMotion = require('./InsteonMotion');
var InsteonIO = require('./InsteonIO');
var InsteonOnOff = require('./InsteonOnOff');
var InsteonKeyPadOnOff = require('./InsteonKeyPadOnOff');
var InsteonOpenClose = require('./InsteonOpenClose');
var ZWaveDevice = require('./ZWaveDevice');
var ZWaveDimmer = require('./ZWaveDimmer');
var ZWaveMultiSensor = require('./ZWaveMultiSensor');
var ZWaveOnOff = require('./ZWaveOnOff');
var ZWaveOpenClose = require('./ZWaveOpenClose');
var ZWaveTemperature = require('./ZWaveTemperature');
var ZWaveLock = require('./ZWaveLock');

var get_constructor = function (device) {
  var types = {
    '1.14.65.0': InsteonDimmer,
    '1.14.67.0': InsteonDimmer,
    '1.25.56.0': InsteonDimmer,
    '1.32.65.0': InsteonDimmer,
    '1.32.69.0': InsteonDimmer,
    '1.58.72.0': InsteonDimmer,
    '1.33.68.0': InsteonDimmer,
    '1.66.68.0': InsteonKeyPadDimmer,
    '1.66.69.0': InsteonKeyPadDimmer,
    '2.42.67.0': InsteonOnOff,
    '2.44.68.0': InsteonKeyPadOnOff,
    '2.42.69.0': InsteonOnOff,
    '2.55.72.0': InsteonOnOff,
    '2.56.67.0': InsteonOnOff,
    '4.7.1.0': ZWaveOpenClose,
    '4.16.1.0': ZWaveOnOff,
    '4.33.1.0': ZWaveMultiSensor,
    '4.64.3.0': ZWaveLock,
    '7.0.65.0': InsteonIO,
    '15.10.67.0': InsteonLock,
    '16.1.0.0': InsteonMotion,
    '16.1.65.0': InsteonMotion,
    '16.1.68.0': InsteonMotion,
    '16.22.70.0': InsteonMotion,
    '16.2.64.0': InsteonOpenClose,
    '16.2.67.0': InsteonOpenClose,
    '16.17.67.0': InsteonOpenClose,
    '16.17.69.0': InsteonOpenClose
  };

  if (!types[device.type]) {
    log.warn('Unknown device type: ', device.type, device.name);
    return InsteonDevice;
  }

  return types[device.type];
};

var parseDevice = function (node, properties) {
  var parsed = {};
  var device;

  Object.keys(node).forEach(function (key) {
    parsed[key] = (Array.isArray(node[key])) ? node[key][0] : node[key];
  });

  if (parsed.parent) {
    parsed.parent = {
      'address': parsed.parent._,
      'type': parsed.parent.$.type
    };
  }

  if (parsed.$ && parsed.$.flag) {
    parsed.flag = parsed.$.flag;
    delete parsed.$;
  }

  if (parsed.property) {
    parsed.properties = {};
    parsed.properties[parsed.property.$.id] = {
      'id': parsed.property.$.id,
      'value': parsed.property.$.value,
      'formatted': parsed.property.$.formatted,
      'uom': parsed.property.$.uom
    }
    delete parsed.property;
  }

  if (properties) {
    properties.property.forEach(function (property) {
      var item = property.$;
      parsed.properties[item.id] = {
        'id': item.id,
        'value': item.value._ || item.value,
        'formatted': item.formatted,
        'uom': item.uom
      };
    });
  }

  var DeviceContructor = get_constructor(parsed);
  device = DeviceContructor.find(parsed.address);

  if (!device) {
    device = new DeviceContructor(Object.assign({}, parsed));
  }

  device.emit('update', parsed);

  return parsed;
};

var parseDevices = function (devices) {
  var objs = {};

  devices.forEach(function (device) {
    parseDevice(device);
  });

  return objs;
};

module.exports = {
  parseDevices: parseDevices,
  parseDevice: parseDevice,
  IsyDevice: IsyDevice
};
