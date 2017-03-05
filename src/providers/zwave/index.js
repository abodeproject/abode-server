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
  ZWave.config.save_wait = ZWave.config.save_wait || 1000;
  ZWave.config.temperature_units = ZWave.config.temperature_units || 'F';
  ZWave.config.ready_timeout = ZWave.config.ready_timeout || 60;
  ZWave.config.command_timeout = ZWave.config.command_timeout || 30;

  // Set some defaults
  ZWave.connected = false;
  ZWave.queue = [];
  ZWave.new_devices = [];
  ZWave.waiting = [];
  ZWave.pending_devices = [];
  ZWave.pending_timers = {};
  ZWave.ready = [];

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
    //ZWave.poller = setInterval(ZWave.poll, ZWave.config.poll_interval * 1000);

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

  // If we are already processing a command, skip this interval
  if (!ZWave.connected) {
    return;
  }

  // If we are already processing a command, skip this interval
  if (ZWave.processing) {
    return;
  }

  // If the queue is empty, skip this interval
  if (ZWave.queue.length === 0) {
    return;
  }

  // Get a command to process
  var cmd = ZWave.queue.shift();

  // Set our processing flag to the command
  ZWave.processing = cmd;

  // Send the command
  cmd.send();
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

ZWave.convert_to_hex = function (key) {
  var i,
    keyBuf,
    keyHex = [];

  if (!key) {
    return;
  }

  keyBuf = Buffer.from(key, 'utf8');

  for (i=0; i<keyBuf.length; i += 1) {
    keyHex.push('0x' + keyBuf.toString('hex', i, i+1));
  }

  return keyHex;
};

ZWave.connect = function () {
  var defer = q.defer();

  ZWave.connection = new OZW({
      Logging: false,
      ConsoleOutput: true,
      NetworkKey: ZWave.convert_to_hex(ZWave.config.security_key)
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

  ZWave.connection.connect(ZWave.config.device);

  return defer.promise;
};

ZWave.wait_for_ready = function (device) {
  var msg,
    timer,
    wait_obj,
    defer = q.defer(),
    nodeid = device.config.node_id;

  timer = setTimeout(function () {
    msg = 'Timeout waiting for node to be ready: ' + device.name;
    defer.reject({'status': 'failed', 'message': msg});
    log.warn(msg);
    ZWave.waiting.splice(ZWave.waiting.indexOf(wait_obj), 1);
  }, ZWave.config.ready_timeout * 1000);

  wait_obj = {'node_id': nodeid, 'defer': defer, 'timer': timer};

  ZWave.waiting.push(wait_obj);

  return defer.promise;
};

ZWave.send = function (config) {

  // Create a new message
  var cmd = new ZWave.Command(config);

  return cmd.promise;
};

ZWave.get_status = function (device) {
  var defer = q.defer();

  log.info('ZWave.get_status(%s)', device.name);

  ZWave.connection.refreshNodeInfo(device.config.node_id);
  ZWave.wait_for_ready(device).then(function (device) {
    defer.resolve({'status': true, 'update': ZWave.parse_device(device)});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

ZWave.on = function (device) {
  var defer = q.defer();

  log.info('ZWave.on(%s)', device);
  if (device.config.node_id || device.config.scene_id) {

    if (device.config.type === 'scene') {
      ZWave.connection.activateScene(device.config.scene_id);
    } else {
      ZWave.connection.setNodeOn(device.config.node_id);
    }

    defer.resolve();

  } else {
    defer.reject({'status': 'failed', 'message': 'Missing node id'});
  }
  
  return defer.promise;
};

ZWave.off = function (device) {
  var defer = q.defer();

  log.info('ZWave.off(%s)', device);
  if (device.config.node_id) {
    ZWave.connection.setNodeOff(device.config.node_id);
    defer.resolve(); 
  } else {
    defer.reject({'status': 'failed', 'message': 'Missing device nodeid or level'});
  }
  
  return defer.promise;
};

ZWave.set_level = function (device, level) {
  var defer = q.defer();

  log.info('ZWave.off(%s, %s)', device, level);

  if (device.config.node_id && level !== undefined) {
    ZWave.setLevel(device.config.node_id, level);
    defer.resolve();
  } else {
    defer.reject({'status': 'failed', 'message': 'Missing device nodeid or level'});
  }
  
  return defer.promise;
};

ZWave.on_driver_ready = function (homeid) {
  log.info('Driver Ready', homeid);
  ZWave.connected = true;
  ZWave.scenes = ZWave.connection.getScenes();
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

    device.config.nodeinfo = nodeinfo;

    ZWave.delay_save(device);
  }, function (err) {
    log.error('Error looking up device: %s', err);
  });
};

ZWave.is_waiting = function (nodeid) {
  var waiting = ZWave.waiting.filter(function (waiting) {
    return (waiting.node_id === nodeid);
  });

  return (waiting.length > 0) ? waiting[0] : false;
};

ZWave.is_ready = function (nodeid) {
  return (ZWave.ready.indexOf(nodeid) >= 0);
};

ZWave.on_node_ready = function (nodeid, nodeinfo) {
  var waiting = ZWave.is_waiting(nodeid);

  if (!ZWave.is_ready(nodeid)) {
    ZWave.ready.push(nodeid);
  }

  ZWave.get_device(nodeid).then(function (device) {
    log.debug('Node ready', device.name || nodeid);

    device.config.nodeinfo = nodeinfo;

    if (waiting) {
      log.info('Found node waiting: %s', nodeid);
      waiting.defer.resolve(device);
      clearTimeout(waiting.timer);
    }

    ZWave.delay_save(device);

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

    //Set the values
    device.config.commandclasses = device.config.commandclasses || {};
    device.config.commandclasses[class_key] = device.config.commandclasses[class_key] || {};
    device.config.commandclasses[class_key][valueId.instance] = device.config.commandclasses[class_key][valueId.instance] || {};
    device.config.commandclasses[class_key][valueId.instance][valueId.label || valueId.index] = valueId;

    device.last_seen = new Date();
    ZWave.delay_save(device);
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

ZWave.parse_device = function (device) {
  device.capabilities = device.capabilities || [];

  if (device.config && device.config.commandclasses) {

    if (device.config.commandclasses.BATTERY && device.config.commandclasses.BATTERY['1']) {
      if (device.config.commandclasses.BATTERY['1']['Battery Level']) {
        device._battery = parseFloat(device.config.commandclasses.BATTERY['1']['Battery Level'].value);
        if (device.capabilities.indexOf('battery_sensor') === -1) {
          device.capabilities.push('battery_sensor');
        }
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
        if (device.capabilities.indexOf('temperature_sensor') === -1) {
          device.capabilities.push('temperature_sensor');
        }
      }
      if (device.config.commandclasses.SENSOR_MULTILEVEL['1'].Luminance) {
        device._lumens = parseFloat(device.config.commandclasses.SENSOR_MULTILEVEL['1'].Luminance.value);
        if (device.capabilities.indexOf('light_sensor') === -1) {
          device.capabilities.push('light_sensor');
        }
      }
      if (device.config.commandclasses.SENSOR_MULTILEVEL['1']['Relative Humidity']) {
        device._humidity = parseFloat(device.config.commandclasses.SENSOR_MULTILEVEL['1']['Relative Humidity'].value);
        if (device.capabilities.indexOf('humidity_sensor') === -1) {
          device.capabilities.push('humidity_sensor');
        }
      }
      if (device.config.commandclasses.SENSOR_MULTILEVEL['1'].Ultraviolet) {
        device._uv = parseFloat(device.config.commandclasses.SENSOR_MULTILEVEL['1'].Ultraviolet.value);
        if (device.capabilities.indexOf('uv_sensor') === -1) {
          device.capabilities.push('uv_sensor');
        }
      }
    }

    if (device.config.commandclasses.ALARM && device.config.commandclasses.ALARM['1']) {
      device._motion = (device.config.commandclasses.ALARM['1'].Burglar.value !== 0);
      if (device.capabilities.indexOf('motion_sensor') === -1) {
        device.capabilities.push('motion_sensor');
      }
    }
  }

  return device;
};

ZWave.save_pending = function (device) {
  log.info('Saving device:', device.name || device.config.node_id);

  device = ZWave.parse_device(device);

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

ZWave.add_node = function (security) {
  ZWave.connection.addNode(security);
};

ZWave.remove_node = function () {
  ZWave.connection.removeNode();
};

ZWave.set_name = function (nodeid, name) {
  ZWave.connection.setNodeName(nodeid, name);
};

ZWave.set_location = function (nodeid, location) {
  ZWave.connection.setNodeLocation(nodeid, location);
};

ZWave.set_value = function (nodeid, commandClass, instance, index, value) {
  var defer = q.defer();

  if (!ZWave.is_ready(nodeid)) {
    defer.resolve();
    return defer.promise;
  }

  if (!nodeid || !commandClass || !instance || !index || !value) {
    defer.reject({'status': 'failed', 'message': 'Missing required key/values'});
  } else {
    log.debug('Setting value: nodeid=%s, commandclass=%s, instance=%s, index=%s, value=%s', nodeid, commandClass, instance, index, value);
    ZWave.connection.setValue({ 'node_id': nodeid, 'class_id': commandClass, 'instance': instance, 'index': index}, value);
    defer.resolve();
  }

  return defer.promise;
};

ZWave.get_scenes = function () {
  var defer = q.defer();

  var scenes = ZWave.connection.getScenes();
  scenes.forEach(function (scene) {
    scene.values = ZWave.connection.sceneGetValues(scene.sceneid);
  });

  ZWave.scenes = scenes;

  defer.resolve(scenes);

  return defer.promise;
};

ZWave.create_scene = function (name) {
  var defer = q.defer();

  log.debug('Creating scene: %s', name);
  defer.resolve({'sceneid': ZWave.connection.createScene(name, undefined)});

  ZWave.get_scenes();

  return defer.promise;
};

ZWave.remove_scene = function (sceneid) {
  var defer = q.defer();


  log.debug('Removing scene: %s', sceneid);
  defer.resolve(ZWave.connection.removeScene(sceneid));

  ZWave.get_scenes();
  
  return defer.promise;
};

ZWave.get_scene = function (sceneid) {
  var defer = q.defer();

  log.debug('Looking up scene: %s', sceneid);

  var scenes = ZWave.scenes.filter(function (scene) {
    return (scene.sceneid === parseInt(sceneid));
  });

  if (scenes.length === 1) {
    defer.resolve(scenes[0]);
  } else {
    defer.reject({'status': 'failed', 'message': 'Scene not found', 'http_code': 404});
  }
  
  return defer.promise;
};

ZWave.add_scene_value = function (sceneid, nodeid, commandclass, instance, index, value) {
  var defer = q.defer();

  ZWave.get_scene(sceneid).then(function () {
    ZWave.connection.addSceneValue(sceneid, nodeid, commandclass, instance, index, value);
    defer.resolve();
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

ZWave.remove_scene_value = function (sceneid, nodeid, commandclass, instance, index, value) {
  var defer = q.defer();

  ZWave.get_scene(sceneid).then(function () {
    ZWave.connection.removeSceneValue(sceneid, nodeid, commandclass, instance, index, value);
    defer.resolve();
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

ZWave.pre_save = function (device) {
  var defer = q.defer(),
    value_defers = [];

  // Look for an existing device
  abode.devices.model.findOne({'provider': 'zwave', 'config.node_id': device.config.node_id}, function (err, orig) {
    if (err) {
      return defer.reject(err);
    }

    // If we didn't find an existing device, resolve our defer
    if (orig === undefined) {
      return defer.resolve();
    }


    //If we have a CONFIGURATION command class, start comparing
    if (device.config && device.config.commandclasses && device.config.commandclasses.CONFIGURATION) {

      //If the orig device does not have the the config command class, resolve our defer
      if (!orig.config || !orig.config.commandclasses || !orig.config.commandclasses.CONFIGURATION) {
        return defer.resolve();
      }

      // Iterate through each instance
      Object.keys(device.config.commandclasses.CONFIGURATION).forEach(function (instance) {

        //Check if instance exists in orig
        if (!orig.config.commandclasses.CONFIGURATION[instance]) {
          return;
        }

        Object.keys(device.config.commandclasses.CONFIGURATION[instance]).forEach(function (config) {
          var new_index = device.config.commandclasses.CONFIGURATION[instance][config];
          var org_index = orig.config.commandclasses.CONFIGURATION[instance][config];

          // If orig does not have the instance index, return
          if (org_index === undefined) {
            return;
          }

          // If device does not have the instance index value, return
          if (new_index.value === undefined) {
            return;
          }

          // If orig does not have the instance index value, return
          if (org_index.value === undefined) {
            return;
          }

          // If our instance index values match, return
          if (new_index.value === org_index.value) {
            return;
          }
          
          //var value_defer = ZWave.set_value(new_index.node_id, new_index.class_id, new_index.instance, new_index.index, new_index.value);

          //value_defers.push(value_defer);

          // Set the value
          console.log('Set value: %s = %s (was %s)', config, new_index.value, orig.config.commandclasses.CONFIGURATION[instance][config].value);
        });

      });

      // If we have any value sets, wait for them to finish
      if (value_defers.length > 0) {

        log.debug('Waiting for set_values');
        q.allSettled(value_defers).then(function () {
          defer.resolve();
        });

      // Otherwise, just resolve our defer
      } else {
        return defer.resolve();
      }

    }
  });

  return defer.promise;
};

module.exports = ZWave;