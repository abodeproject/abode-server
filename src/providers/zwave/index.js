'use strict';

var abode,
  routes,
  q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('zwave'),
  OZW = require('openzwave-shared');

var ZWave = function () {
  var defer = q.defer();

  // Get abode
  abode = require('../../abode');

  // Set our routes
  routes = require('./routes');
  abode.web.server.use('/api/zwave', routes);

  // Build our config
  abode.config.zwave = abode.config.zwave || {};
  ZWave.config = abode.config.zwave;
  ZWave.config.enabled = (ZWave.config.enabled === true) ? true : false;
  ZWave.config.device = ZWave.config.device || '/dev/ttyACM0';
  ZWave.config.message_time = ZWave.config.message_time || 2;
  ZWave.config.queue_interval = ZWave.config.queue_interval || 100;
  ZWave.config.poll_interval = ZWave.config.poll_interval || 60;
  ZWave.config.save_wait = ZWave.config.save_wait || 500;
  ZWave.config.temperature_units = ZWave.config.temperature_units || 'F';

  // Set some defaults
  ZWave.connected = false;
  ZWave.queue = [];
  ZWave.new_devices = [];
  ZWave.pending_devices = [];
  ZWave.pending_timers = {};

  ZWave.connection = new OZW({
      Logging: false,
      ConsoleOutput: true
  });

  ZWave.connection.on('driver ready', ZWave.on_driver_ready);
  ZWave.connection.on('driver failed', ZWave.on_driver_failed);
  ZWave.connection.on('scan complete', ZWave.on_scan_complete);
  ZWave.connection.on('node added', ZWave.on_node_added);
  ZWave.connection.on('node removed', ZWave.on_node_removed);
  ZWave.connection.on('node naming', ZWave.on_node_naming);
  ZWave.connection.on('node available', ZWave.on_node_available);
  ZWave.connection.on('node ready', ZWave.on_node_ready);
  ZWave.connection.on('polling enabled', ZWave.on_polling_enabled);
  ZWave.connection.on('polling disabled', ZWave.on_polling_disabled);
  ZWave.connection.on('scene event', ZWave.on_scene_event);
  ZWave.connection.on('value added', ZWave.on_value_added);
  ZWave.connection.on('value changed', ZWave.on_value_changed);
  ZWave.connection.on('value refreshed', ZWave.on_value_refreshed);
  ZWave.connection.on('value removed', ZWave.on_value_removed);
  ZWave.connection.on('controller command', ZWave.on_controller_command);

  // If we are enabled, start it up
  if (ZWave.config.enabled) {

    log.info('Z-Wave provider initialized');
    ZWave.enable();

  } else {
    log.info('Z-Wave provider not enabled');
  }

  defer.resolve();

  return defer.promise;
};

ZWave.enable = function () {
  var msg,
    defer = q.defer();

  if (!ZWave.connected) {
    msg = 'Provider started';

    // Enable the provider
    ZWave.config.enabled = true;

    // Attempt a connection
    ZWave.connect();

    // Start our queue processor
    ZWave.timer = setInterval(ZWave.queue_processor, ZWave.config.queue_interval);

    // Start our poller
    ZWave.poller = setInterval(ZWave.poll, ZWave.config.poll_interval * 1000);

    log.info(msg);
    defer.resolve({'status': 'success', 'message': msg});
  } else {
    msg = 'Already running';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
  }

  return defer.promise;
};

ZWave.disable = function () {
  var msg,
    defer = q.defer();

  if (ZWave.connected) {
    msg = 'Provider stopped';

    // Disable the provider
    ZWave.config.enabled = false;

    // Stop the queue handler
    clearInterval(ZWave.timer);

    // Stop the queue handler
    clearInterval(ZWave.poller);

    // Disconnect the telnet connection
    ZWave.connection.disconnect(ZWave.config.device);

    log.info(msg);
    defer.resolve({'status': 'success', 'message': msg});
  } else {
    msg = 'Already stopped';
    log.error(msg);
    defer.reject({'status': 'failed', 'message': msg});
  }

  return defer.promise;
};

ZWave.queue_processor = function () {

  // If we are already processing a message, skip this interval
  if (!ZWave.connected) {
    return;
  }

  // If we are already processing a message, skip this interval
  if (ZWave.processing) {
    return;
  }

  // If the queue is empty, skip this interval
  if (ZWave.queue.length === 0) {
    return;
  }

  // Get a message to process
  var msg = ZWave.queue.shift();

  // Set our processing flag to the message
  ZWave.processing = msg;

  // Send the message
  msg.send();
};

ZWave.poll = function () {

  // If we are already polling, throw an error
  if (ZWave.polling) {
    log.warn('Poll in progress since %s', ZWave.polling);
    return;
  }

  // Set our polling start time
  ZWave.polling = new Date();

  // Get all lutron devices
  var devices = abode.devices.get_by_provider('zwave');
  //abode.devices.get_by_providerAsync('zwave').then(function (devices) {
    var device_defers = [];

    // If no devices found, return
    if (devices.length === 0) {
      log.debug('No devices to Poll');
      ZWave.polling = false;
      return;
    }

    log.debug('Starting to poll devices');
    devices.forEach(function (device) {
      // Set our device defer and add it to our list
      var device_defer = q.defer();
      device_defers.push(device_defer.promise);

      // If device is not active, do not poll
      if (device.active !== true) {
        device_defer.resolve();
        return;
      }

      // Get status of device
      ZWave.get_status(device).then(function (data) {
        device_defer.resolve();

        // If we have an update key, set the device staet
        if (data.update) {

          device.set_state(data.update, undefined, {'skip_pre': true, 'skip_post': true});

        }
      });
    });

    // Once all devices polled, set polling flag to false
    q.allSettled(device_defers).then(function () {
      ZWave.polling = false;
    });

  //});

};

ZWave.connect = function () {
  var defer = q.defer();

  ZWave.connection.connect(ZWave.config.device);

  return defer.promise;
};

ZWave.get_status = function (device) {
  var defer = q.defer();

  log.info('ZWave.get_status(%s)', device);
  defer.resolve();

  return defer.promise;
};

ZWave.on = function (device) {
  var defer = q.defer();

  log.info('ZWave.on(%s)', device);
  defer.resolve();
  
  return defer.promise;
};

ZWave.off = function (device) {
  var defer = q.defer();

  log.info('ZWave.off(%s)', device);
  defer.resolve();
  
  return defer.promise;
};

ZWave.set_level = function (device, level) {
  var defer = q.defer();

  log.info('ZWave.off(%s, %s)', device, level);
  defer.resolve();
  
  return defer.promise;
};

ZWave.on_driver_ready = function (homeid) {
  log.info('Driver Ready', homeid);
  ZWave.connected = true;
};

ZWave.on_driver_failed = function () {
  log.error('Driver Failed', arguments);
  ZWave.connected = false;
};

ZWave.on_scan_complete = function () {
  log.info('Scan Complete');
};

ZWave.on_node_added = function (nodeid) {

  ZWave.get_device(nodeid).then(function (device) {
    log.debug('Node Added', device.name || nodeid);
    ZWave.delay_save(device);

  }, function (err) {
    log.error('Error looking up device: %s', err);
  });

};

ZWave.on_node_removed = function (nodeid) {
  log.info('Node Removed', nodeid);
};

ZWave.on_node_naming = function (nodeid, nodeinfo) {
  log.info('Node naming', nodeid, nodeinfo);


  ZWave.get_device(nodeid).then(function (device) {
    log.debug('Node naming', device.name || nodeid);
    ZWave.delay_save(device);

    device.config.nodeinfo = nodeinfo;

  }, function (err) {
    log.error('Error looking up device: %s', err);
  });
};

ZWave.on_node_available = function (nodeid, nodeinfo) {

  ZWave.get_device(nodeid).then(function (device) {
    log.debug('Node available', device.name || nodeid);

    ZWave.delay_save(device);

    device.config.nodeinfo = nodeinfo;
  }, function (err) {
    log.error('Error looking up device: %s', err);
  });
};

ZWave.on_node_ready = function (nodeid, nodeinfo) {

  ZWave.get_device(nodeid).then(function (device) {
    log.debug('Node ready', device.name || nodeid);

    ZWave.delay_save(device);

    device.config.nodeinfo = nodeinfo;
  }, function (err) {
    log.error('Error looking up device: %s', err);
  });

};

ZWave.on_polling_enabled = function (nodeid) {
  log.info('polling enabled', nodeid);
};

ZWave.on_polling_disabled = function (nodeid) {
  log.info('polling disabled', nodeid);
};

ZWave.on_scene_event = function (nodeid, sceneid) {
  log.info('scene event', nodeid, sceneid);
};

ZWave.on_value_added = ZWave.on_value_changed = ZWave.on_value_refreshed = function (nodeid, commandclass, valueId) {
  var class_key = ZWave.get_command_class_by_id(commandclass) || commandclass;

  ZWave.get_device(nodeid).then(function (device) {
    log.debug('value added/changed/refreshed %s.%s.%s.%s.%s', device.name || nodeid, class_key, valueId.value_id, valueId.label, valueId.value);

    ZWave.delay_save(device);

    //Set the values
    device.config.commandclasses = device.config.commandclasses || {};
    device.config.commandclasses[class_key] = device.config.commandclasses[class_key] || {};
    device.config.commandclasses[class_key][valueId.instance] = device.config.commandclasses[class_key][valueId.instance] || {};
    device.config.commandclasses[class_key][valueId.instance][valueId.label || valueId.index] = valueId;

  }, function (err) {
    log.error('Error looking up device: %s', err);
  });

};

ZWave.on_value_removed = function (nodeid, commandclass, instance, index) {
  log.info('value removed', nodeid, commandclass, instance, index);
};

ZWave.on_controller_command = function (nodeId, ctrlState, ctrlError, helpmsg) {
  log.info('controller command', nodeId, ctrlState, ctrlError, helpmsg);
};

ZWave.delay_save = function (device) {
  var nodeid = device.config.node_id;

  // If we have a pending save timer, clear it
  if (ZWave.pending_timers[nodeid]) {
    clearTimeout(ZWave.pending_timers[nodeid]);

  // Otherwise add our pending device to the list
  } else {
    ZWave.pending_devices.push(device);
  }

  // Set a save timer
  ZWave.pending_timers[nodeid] = setTimeout(function () {
    delete ZWave.pending_timers[nodeid];
    ZWave.save_pending(device);
  }, ZWave.config.save_wait);

};

ZWave.save_pending = function (device) {
  log.info('Saving device:', device.name || device.config.node_id);
  device.capabilities = [];


  if (device.config.commandclasses.BATTERY && device.config.commandclasses.BATTERY['1']) {
    if (device.config.commandclasses.BATTERY['1']['Battery Level']) {
      device._battery = parseFloat(device.config.commandclasses.BATTERY['1']['Battery Level'].value);
      device.capabilities.push('battery_sensor');
    }
  }

  if (device.config.commandclasses.SENSOR_MULTILEVEL && device.config.commandclasses.SENSOR_MULTILEVEL['1']) {
    if (device.config.commandclasses.SENSOR_MULTILEVEL['1'].Temperature) {
      var temp = parseFloat(device.config.commandclasses.SENSOR_MULTILEVEL['1'].Temperature.value);
      if (device.config.commandclasses.SENSOR_MULTILEVEL['1'].Temperature.units !== ZWave.config.temperature_units) {
        if (ZWave.config.temperature_units === 'F') {
          temp = temp * (9/5) + 32;
        } else {
          temp = (temp - 32) * (5/9);
        }
      }
      device._temperature = parseFloat(temp.toFixed(2));
      device.capabilities.push('temperature_sensor');
    }
    if (device.config.commandclasses.SENSOR_MULTILEVEL['1'].Luminance) {
      device._lumens = parseFloat(device.config.commandclasses.SENSOR_MULTILEVEL['1'].Luminance.value);
      device.capabilities.push('light_sensor');
    }
    if (device.config.commandclasses.SENSOR_MULTILEVEL['1']['Relative Humidity']) {
      device._humidity = parseFloat(device.config.commandclasses.SENSOR_MULTILEVEL['1']['Relative Humidity'].value);
      device.capabilities.push('humidity_sensor');
    }
    if (device.config.commandclasses.SENSOR_MULTILEVEL['1'].Ultraviolet) {
      device._uv = parseFloat(device.config.commandclasses.SENSOR_MULTILEVEL['1'].Ultraviolet.value);
      device.capabilities.push('uv_sensor');
    }
  }

  if (device.config.commandclasses.ALARM && device.config.commandclasses.ALARM['1']) {
    device._motion = (device.config.commandclasses.ALARM['1'].Burglar.value !== 0);
    device.capabilities.push('motion_sensor');
  }
  
  if (device.set_state) {
    device.set_state(device);
  }

  ZWave.pending_devices.splice(ZWave.pending_devices.indexOf(device), 1);

};

ZWave.get_device = function (nodeid) {
  var pending,
    new_device,
    new_devices,
    abode_device,
    defer = q.defer();

  pending = ZWave.pending_devices.filter(function (device) {
    return (device.config.node_id === nodeid);
  });

  if (pending.length > 0) {
    defer.resolve(pending[0]);
  } else {
    // Lookup the integration id
    abode.devices.model.findOne({'config.node_id': nodeid, 'provider': 'zwave'}).then(function (device) {
      if (!device) {
        new_devices = ZWave.new_devices.filter(function (node) { return (node.config.node_id === nodeid); });

        if (new_devices.length === 0) {
          new_device = {
            'config': {
              'node_id': nodeid,
            }
          };

          ZWave.new_devices.push(new_device);
          return defer.resolve(new_device);
        }
        
        return defer.resolve(new_devices[0]);
      }

      abode_device = abode.devices.get(device.name);
      defer.resolve(abode_device);

    }, function (err) {
      log.error('Error looking up device: %s', err);
      defer.reject(err);
    });
  }

  return defer.promise;
};

ZWave.command_classes = {
  'NO_OPERATION': 0,
  'BASIC': 32,
  'CONTROLLER_REPLICATION': 33,
  'APPLICATION_STATUS': 34,
  'ZIP_SERVICES': 35,
  'ZIP_SERVER': 36,
  'SWITCH_BINARY': 37,
  'SWITCH_MULTILEVEL': 38,
  'SWITCH_MULTILEVEL_V2': 38,
  'SWITCH_ALL': 39,
  'SWITCH_TOGGLE_BINARY': 40,
  'SWITCH_TOGGLE_MULTILEVEL': 41,
  'CHIMNEY_FAN': 42,
  'SCENE_ACTIVATION': 43,
  'SCENE_ACTUATOR_CONF': 44,
  'SCENE_CONTROLLER_CONF': 45,
  'ZIP_CLIENT': 46,
  'ZIP_ADV_SERVICES': 47,
  'SENSOR_BINARY': 48,
  'SENSOR_MULTILEVEL': 49,
  'SENSOR_MULTILEVEL_V2': 49,
  'METER': 50,
  'ZIP_ADV_SERVER': 51,
  'ZIP_ADV_CLIENT': 52,
  'METER_PULSE': 53,
  'METER_TBL_CONFIG': 60,
  'METER_TBL_MONITOR': 61,
  'METER_TBL_PUSH': 62,
  'THERMOSTAT_HEATING': 56,
  'THERMOSTAT_MODE': 64,
  'THERMOSTAT_OPERATING_STATE': 66,
  'THERMOSTAT_SETPOINT': 67,
  'THERMOSTAT_FAN_MODE': 68,
  'THERMOSTAT_FAN_STATE': 69,
  'CLIMATE_CONTROL_SCHEDULE': 70,
  'THERMOSTAT_SETBACK': 71,
  'DOOR_LOCK_LOGGING': 76,
  'SCHEDULE_ENTRY_LOCK': 78,
  'BASIC_WINDOW_COVERING': 80,
  'MTP_WINDOW_COVERING': 81,
  'ASSOCIATION_GRP_INFO': 89,
  'DEVICE_RESET_LOCALLY': 90,
  'CENTRAL_SCENE': 91,
  'IP_ASSOCIATION': 92,
  'ANTITHEFT': 93,
  'ZWAVEPLUS_INFO': 94,
  'MULTI_CHANNEL_V2': 96,
  'MULTI_INSTANCE': 96,
  'DOOR_LOCK': 98,
  'USER_CODE': 99,
  'BARRIER_OPERATOR': 102,
  'CONFIGURATION': 112,
  'CONFIGURATION_V2': 112,
  'ALARM': 113,
  'MANUFACTURER_SPECIFIC': 114,
  'POWERLEVEL': 115,
  'PROTECTION': 117,
  'PROTECTION_V2': 117,
  'LOCK': 118,
  'NODE_NAMING': 119,
  'FIRMWARE_UPDATE_MD': 122,
  'GROUPING_NAME': 123,
  'REMOTE_ASSOCIATION_ACTIVATE': 124,
  'REMOTE_ASSOCIATION': 125,
  'BATTERY': 128,
  'CLOCK': 129,
  'HAIL': 130,
  'WAKE_UP': 132,
  'WAKE_UP_V2': 132,
  'ASSOCIATION': 133,
  'ASSOCIATION_V2': 133,
  'VERSION': 134,
  'INDICATOR': 135,
  'PROPRIETARY': 136,
  'LANGUAGE': 137,
  'TIME': 138,
  'TIME_PARAMETERS': 139,
  'GEOGRAPHIC_LOCATION': 140,
  'COMPOSITE': 141,
  'MULTI_CHANNEL_ASSOCIATION_V2': 142,
  'MULTI_INSTANCE_ASSOCIATION': 142,
  'MULTI_CMD': 143,
  'ENERGY_PRODUCTION': 144,
  'MANUFACTURER_PROPRIETARY': 145,
  'SCREEN_MD': 146,
  'SCREEN_MD_V2': 146,
  'SCREEN_ATTRIBUTES': 147,
  'SCREEN_ATTRIBUTES_V2': 147,
  'SIMPLE_AV_CONTROL': 148,
  'AV_CONTENT_DIRECTORY_MD': 149,
  'AV_RENDERER_STATUS': 150,
  'AV_CONTENT_SEARCH_MD': 151,
  'SECURITY': 152,
  'AV_TAGGING_MD': 153,
  'IP_CONFIGURATION': 154,
  'ASSOCIATION_COMMAND_CONFIGURATION': 155,
  'SENSOR_ALARM': 156,
  'SILENCE_ALARM': 157,
  'SENSOR_CONFIGURATION': 158,
  'MARK': 239,
  'NON_INTEROPERABLE': 240,
};

ZWave.get_command_class_by_id = function (classid) {
  
  var classes = Object.keys(ZWave.command_classes).filter(function (c) {
    return (ZWave.command_classes[c] === classid);
  });

  if (classes.length > 0) {
    return classes[0];
  }
};

ZWave.post_save = function (device) {
  var defer = q.defer();
  var new_device = ZWave.new_devices.filter(function (item) {
    return (item.config.node_id === device.config.node_id);
  });

  if (new_device.length > 0) {
    ZWave.new_devices.splice(ZWave.new_devices.indexOf(new_device[0], 1));
  }

  defer.resolve();

  return defer.promise;
};

module.exports = ZWave;