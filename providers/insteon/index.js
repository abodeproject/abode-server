'use strict';

var q = require('q');
var routes;
var merge = require('merge');
var abode = require('../../abode');
var logger = require('log4js'),
  log = logger.getLogger('insteon');

var Insteon = function () {
  var defer = q.defer(),
    modem_log = logger.getLogger('insteon.modem');

  routes = require('./routes');

  abode.web.server.use('/api/insteon', routes);

  //Set our configuration options
  Insteon.config = abode.config.insteon || {};
  Insteon.config.enabled = (Insteon.config.enabled === false) ? false : true;
  Insteon.config.serial_device = Insteon.config.serial_device || '/dev/ttyUSB0';
  Insteon.config.serial_baudrate = Insteon.config.serial_baudrate || 19200;
  Insteon.config.serial_databits = Insteon.config.serial_databits || 8;
  Insteon.config.serial_stopbits = Insteon.config.serial_stopbits || 1;
  Insteon.config.serial_parity = Insteon.config.serial_parity || 0;
  Insteon.config.serial_flowcontrol = Insteon.config.serial_flowcontrol || 0;
  Insteon.config.timeout = Insteon.config.timeout || 1000;
  Insteon.config.queue_timeout = Insteon.config.queue_timeout || 5000;
  Insteon.config.delay = Insteon.config.delay || 400;
  Insteon.config.retries = Insteon.config.retries || 3;
  Insteon.config.debug = (Insteon.config.debug !== undefined) ? Insteon.config.debug : abode.config.debug;
  Insteon.config.modem_debug = (Insteon.config.modem_debug !== undefined) ? Insteon.config.modem_debug : Insteon.config.debug;
  Insteon.config.poller_delay = (Insteon.config.poller_delay !== undefined) ? Insteon.config.poller_delay : 5;

  //Set our log level
  if (Insteon.config.modem_debug) {
    modem_log.setLevel('DEBUG');

  } else {
    modem_log.setLevel('INFO');
  }

  //Include some dependencies
  Insteon.actions = require('./actions')(undefined, Insteon);
  Insteon.modem = require('./modem');

  if (Insteon.config.enabled === true) {
    //Initialize the Insteon Modem
    Insteon.modem(Insteon).then(function () {

      //Start our queue handler
      Insteon.queueInterval = setInterval(Insteon.queue_handler, 100);

      //Resolve the provider defer
      log.debug('Insteon provider initialized');
      defer.resolve();

    }, function (err) {
      //Reject our provider defer with the error
      log.error('Insteon provider failed to initialize');
      defer.reject(err);

    });


    abode.events.on('ABODE_STARTED', function () {
      setTimeout(Insteon.poller, 1000);
    });

  } else {
    log.warn('Not starting Insteon.  Not enabled');
    defer.resolve();
  }

  return defer.promise;
};

// Set an initial false value for our processor. This will be true
// when we are processing a command in the send queue.
Insteon.processing = false;
Insteon.linking = false;


Insteon.triggers = [
  {'name': 'INSTEON_ON'},
  {'name': 'INSTEON_OFF'}
];

Insteon.poller = function () {
  var diff,
    finish,
    index = -1,
    start = new Date(),
    devices = abode.devices.get_by_provider('insteon');

  log.info('Starting poller (%s devices)', devices.length);

  var done = function () {
    finish = new Date();

    diff = (finish - start) / 1000;
    log.info('Finished polling devices in %s seconds.', diff);
    setTimeout(Insteon.poller, Insteon.config.poller_delay * 60 * 1000);
  };

  var wait = function () {
    setTimeout(next, 5 * 1000);
  };

  var next = function () {
    index += 1;

    if (index >= devices.length) {
      done();
      return;
    }

    var device = devices[index];

    if (device.active !== false) {
      log.debug('Getting status of device: %s', device.name);
      device.status().then(wait, wait);
    } else {
      next();
    }
  };

  next();
};

// Give a device name, return the Insteon device address
Insteon.lookupByName = function (name) {

  var devs;

  //Lookup our devices by name
  devs = Insteon.devices().filter(function (item) {
    return (item.name === name);
  });

  //If no device returned, return undefined
  if (devs.length === 0) {
    return;
  }

  //Return the device address
  return devs[0].config.address;

};

// Given an Insteon device address in either a buffer object
// or string, return the name of the device
Insteon.lookupByAddr = function (addr) {
  var devs;

  //If we got a buffer, ensure it size is 3
  if (addr instanceof Buffer) {
    if (addr.length !== 3) {
      throw 'Invalid address buffer size';
    }

    //Convert the buffer to an address
    addr = Insteon.modem.bufferToAddr(addr);
  }

  //Ensure we have an address as a string
  if (typeof addr !== 'string') {
    throw 'Invalid address, should be string';
  }

  //Lookup our devices with the address
  devs = Insteon.devices().filter(function (item) {
    return (item.config.address === addr);
  });

  //If no device found, return undefined
  if (devs.length === 0) {
    return;
  }

  //Return the device name
  return devs[0].name;

};

Insteon.getDevice = function (addr) {
  var devs;

  //If we got a buffer, ensure it size is 3
  if (addr instanceof Buffer) {
    if (addr.length !== 3) {
      throw 'Invalid address buffer size';
    }

    //Convert the buffer to an address
    addr = Insteon.modem.bufferToAddr(addr);
  }

  //Ensure we have an address as a string
  if (typeof addr !== 'string') {
    throw 'Invalid address, should be string';
  }

  //Lookup our devices with the address
  devs = Insteon.devices().filter(function (item) {
    return (item.config.address === addr);
  });

  //If no device found, return undefined
  if (devs.length === 0) {
    return;
  }

  //Return the device
  return devs[0];
};

// Return an array of Insteon devices
Insteon.devices = function () {
  return abode.devices.get_by_provider('insteon');
};

// Send a command to a device with the given arguments.  We will try as many
// teims as configured in Insteon.config.retries
Insteon.command = function (command, device, args) {
  var tries = 0,
    defer = q.defer();

  device = device || {'name': 'MODEM'};

  //Build our handler arguments, device should be the first argument
  args = args || [];
  args.unshift(device.name);

  // Function to call for each attempt
  var attempt = function () {
    tries += 1;

    // Send our command and resolve or reject the promise
    log.debug('Sending %s command to device %s (attempt %s/%s)', command, device.name, tries, Insteon.config.retries);
    Insteon.actions[command].handler.apply(this, args).settled.then(function (response) {

      //Resolve our promise with the response
      defer.resolve(response);

    }, function () {

      // Check if we have more attempts
      if (tries >= Insteon.config.retries) {

        // Reject our promise with max retries
        defer.reject({'status': 'failed', 'message': 'Max retries reached, giving up'});

      } else {

        // Wait the configured ms, then try again
        log.debug('Failed to send command, retrying in ' + Insteon.config.delay + 'ms');
        setTimeout(attempt, Insteon.config.delay);

      }

    });
  };

  //Make our first attempt
  attempt();

  //Return our promise
  return defer.promise;
};

Insteon._queue = [];

// Process commands in the queue
Insteon.queue_handler = function () {

  // If we have items in the queue and we are not processing anything
  // work on the next queue ditem
  if (Insteon._queue.length > 0 && Insteon.processing === false) {

    //Pull the next item out of the queue
    var item = Insteon._queue.shift();

    //Set the processing flag
    Insteon.processing = true;

    //Run the command
    Insteon.command(item.cmd, item.device, item.args).then(function (response) {
      //Unset the processing flag
      Insteon.processing = false;

      //Resolve our initial command defer
      item.defer.resolve(response);
      clearTimeout(item.timeout);

    }, function (err) {

      //Unset the processing flag
      Insteon.processing = false;

      //Reject our initial command defer
      item.defer.reject(err);

    });
  }

};

// Add a command to the queue
Insteon.queue = function (cmd, device, args) {
  var msg,
    defer = q.defer();

  //Ensure the device is an Insteon device
  if (device !== undefined && device.provider !== 'insteon') {
    msg = 'Unknown Insteon device: ' + device.name;
    log.error(msg);
    defer.reject({'status': 'failed', 'msg': msg});
    return defer.promise;
  }

  var queue_timeout = setTimeout(function () {
    log.error('Timeout waiting for %s command to complete for device %s', cmd, device.name);
    defer.reject({'status': 'failed', 'message': 'Timeout waiting for queued item'});

  }, Insteon.config.queue_timeout);

  //Add the command the queue with our defer
  Insteon._queue.push({'defer': defer, 'cmd': cmd, 'device': device, 'args': args, 'timeout': queue_timeout});

  //Return our promise
  return defer.promise;

};

Insteon.on = function (device) {
  var defer = q.defer();

  //Add the command to the queue
  Insteon.queue('LIGHT_ON', device).then(function () {

    log.debug('Successfully sent LIGHT_ON to ' + device.name);

    //Resolve our defer with the correct _on and _level values
    defer.resolve({'response': true, 'update': {'_on': true, '_level': 100, 'last_on': new Date()}});

  }, function (err) {
    log.error('Failed to send LIGHT_ON to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;

};

Insteon.off = function (device) {
  var defer = q.defer();

  //Add the command to the queue
  Insteon.queue('LIGHT_OFF', device).then(function () {

    log.debug('Successfully sent LIGH_OFF to ' + device.name);

    //Resolve our defer with the correct _on and _level values
    defer.resolve({'response': true, 'update': {'_on': false, '_level': 0, 'last_off': new Date()}});

  }, function (err) {
    log.debug('Failed to send LIGH_OFF to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.set_level = function (device, level, rate) {
  var cmd,
    defer = q.defer();

  //Add the command to the queue
  if (rate) {
    cmd = Insteon.queue('LIGHT_LEVEL_RATE', device, [level, rate]);
  } else {
    cmd = Insteon.queue('LIGHT_LEVEL', device, [level]);
  }
  cmd.then(function () {

    if (rate) {
      log.debug('Successfully sent LIGHT_LEVEL_RAMP to ' + device.name);
    } else {
      log.debug('Successfully sent LIGHT_LEVEL to ' + device.name);
    }

    //Resolve our defer with the correct _on and _level values
    var state = (level > 0) ? true : false;
    var update = {'_on': state, '_level': level};

    if (state) {
      update.last_on = new Date();
    }
    if (!state) {
      update.last_off = new Date();
    }
    defer.resolve({'response': true, 'update': update});

  }, function (err) {
    log.debug('Failed to send LIGHT_LEVEL to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;

};

Insteon.temperature = function (device) {
  var defer = q.defer();

  //Add the command to the queue
  Insteon.queue('THERMOSTAT_TEMPERATURE', device).then(function (msg) {

    log.debug('Successfully sent THERMOSTAT_TEMPERATURE to ' + device.name);

    //Resolve our defer with the correct _on and _level values
    defer.resolve({'response': msg});

  }, function (err) {
    log.debug('Failed to send THERMOSTAT_TEMPERATURE to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.set_mode = function (device, mode) {
  var defer = q.defer();


  var cmds = {
    'HEAT': 'THERMOSTAT_HEAT_ON',
    'COOL': 'THERMOSTAT_COOL_ON',
    'OFF': 'THERMOSTAT_ALL_OFF',
  };

  var cmd = cmds[mode];

  if (cmd === undefined) {
    defer.reject({'status': 'failed', 'message': 'Unknown mode: ' + mode});
    return defer.promise;
  }


  //Add the command to the queue
  Insteon.queue(cmd, device).then(function (msg) {

    log.debug('Successfully sent ' + cmd + ' to ' + device.name);

    //Resolve our defer with the correct _on and _level values
    defer.resolve({'response': msg});

  }, function (err) {
    log.debug('Failed to send ' + cmd + ' to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.mode = function (device) {
  var defer = q.defer();

  //Add the command to the queue
  Insteon.queue('THERMOSTAT_MODE', device).then(function (msg) {

    log.debug('Successfully sent THERMOSTAT_MODE to ' + device.name);

    //Resolve our defer with the correct _on and _level values
    defer.resolve({'response': msg});

  }, function (err) {
    log.debug('Failed to send THERMOSTAT_MODE to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.is_open = Insteon.is_on = function (device) {
  var defer = q.defer();

  Insteon.device_status(device).then(function (state) {
    defer.resolve({'update': {'_level': state, '_on': (state > 0) ? true : false}, 'response': (state > 0) ? true : false});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.is_closed = Insteon.is_off = function (device) {
  var defer = q.defer();

  Insteon.device_status(device).then(function (state) {
    defer.resolve({'update': {'_level': state, '_on': (state > 0) ? true : false}, 'response': (state > 0) ? false : true});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.device_status = function (device, sensor) {
  var defer = q.defer();

  //Add the command to the queue
  Insteon.queue('LIGHT_STATUS', device, [sensor]).then(function (message) {
    if (message.length === 2) {
      defer.resolve(message[1].message.cmd_2);
    } else {
      defer.reject({'status': 'failed', 'message': 'Failed to get status'});
    }

  }, function (err) {
    log.debug('Failed to send LIGHT_STATUS to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.sensor_status = function (device, sensor) {
  var defer = q.defer();

  //Add the command to the queue
  Insteon.queue('SENSOR_STATUS', device, [sensor]).then(function (message) {
    if (message.length === 2) {
      console.log(message[1].message.cmd_2);
      defer.resolve(message[1].message.cmd_2);
    } else {
      defer.reject({'status': 'failed', 'message': 'Failed to get sensor status'});
    }

  }, function (err) {
    log.debug('Failed to send SENSOR_STATUS to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.get_status = function (device) {
  var cmd,
    defer = q.defer();

//  if (device.capabilities && device.capabilities.indexOf('sensor') >= 0) {
//    cmd = Insteon.sensor_status(device);
//  } else {
    cmd = Insteon.device_status(device);
//  }

  cmd.then(function (state) {
    defer.resolve({'update': {'_level': parseInt((state / 255) * 100, 10), '_on': (state > 0) ? true : false}, 'response': {'_level': parseInt((state / 255) * 100, 10), '_on': (state > 0) ? true : false}});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};


Insteon.level = function (device) {
  var defer = q.defer();

  Insteon.queue('LIGHT_STATUS', device).then(function (response) {
    log.debug('Successfully sent LIGHT_STATUS to ' + device.name);

    if (response.length === 2 && response[1].message && response[1].message.cmd_2) {
      var state,
        level = response[1].message.cmd_2;

      level = (level/ 255) * 100;
      state = (level > 0) ? true : false;

      defer.resolve({'response': true, 'update': {'_on': state, '_level': parseInt(level, 10)}});

    } else {
      defer.reject({'status': 'failed', 'message': 'Unexpected response received'});
    }

  }, function (err) {
    log.debug('Failed to send LIGHT_STATUS to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.get_records = function () {
  var last_record,
    records = [],
    defer = q.defer();

  //Process the records
  var complete = function () {
    log.info(records);
    defer.resolve();
  };

  //Get the next record
  var get_record = function () {
    //Send the command to get the next record
    Insteon.queue('GET_NEXT_ALL_LINK_RECORD').then(function (response) {

      var record = response.pop().message;

      if (last_record === JSON.stringify(record)) {
        complete();
      } else {
        log.debug('Record read: ' + record.addr);
        records.push(record);
        last_record = JSON.stringify(record);
        get_record();
      }
    }, function () {
      complete();
    });
  };

  //Reset the record index
  Insteon.queue('GET_FIRST_ALL_LINK_RECORD').then(function () {
    //Start pulling records
    get_record();
  }, function () {

  });
};

Insteon.get_device_config = function (device) {
  var defer = q.defer();

  //Add the command to the queue
  Insteon.queue('PRODUCT_DATA_REQUEST', device).then(function (response) {

    log.debug('Successfully sent PRODUCT_DATA_REQUEST to ' + device.name);

    if (response.length === 3) {
      var product_data = response.pop().message,
        user_data = product_data.user_data,
        data = {};

        data.product_key_msb = user_data.readUInt8(1);
        data.product_key_2msb = user_data.readUInt8(2);
        data.product_key_lsb = user_data.readUInt8(3);
        data.device_category = Insteon.modem.tohex(user_data.readUInt8(4));
        data.device_subcategory = Insteon.modem.tohex(user_data.readUInt8(5));

        defer.resolve({'response': true, 'update': {'config': merge(device.config, data)}});

    } else {
      defer.reject({'status': 'failed', 'message': 'Unexpected response received'});
    }

  }, function (err) {
    log.debug('Failed to send PRODUCT_DATA_REQUEST to ' + device.name);
    defer.reject(err);
  });

  return defer.promise;

};

Insteon.start_linking = function (type, auto_add) {  //Reset the record index
  var defer = q.defer();

  type = type || 'controller';

  Insteon.auto_add = (auto_add !== undefined) ? auto_add : true;

  var types = {
    'controller': 0x01,
    'responder': 0x00,
    'either': 0x03
  };

  if (types[type] === undefined) {
    defer.reject({'status': 'failed', 'message': 'Invalid link type'});
    return defer.promise;
  }

  if (Insteon.linking === false) {

    Insteon.queue('START_ALL_LINKING', undefined, [types[type]]).then(function () {
      log.info('Started %s linking mode', type);
      Insteon.link_timer = setTimeout(Insteon.stop_linking, (4 * 60 * 1000));
      Insteon.linking = true;
      defer.resolve({'status': 'success', 'message': 'Linking mode started'});
    }, function (err) {
      defer.reject(err);
    });

  } else {
    log.warn('Already in linking mode');
    defer.reject({'status': 'failed', 'message': 'Already in linking mode'});
  }
  return defer.promise;
};

Insteon.stop_linking = function () {  //Reset the record index
  var defer = q.defer();


  clearTimeout(Insteon.link_timer);
  Insteon.link_timer = undefined;
  Insteon.linking = false;

  Insteon.queue('CANCEL_ALL_LINKING').then(function () {
    log.info('Stopped linking mode');
    defer.resolve({'status': 'success', 'message': 'Cancelled linking mode'});
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

Insteon.link_complete = function (message) {
  var defer = q.defer();

  log.info('Link Complete');

  clearTimeout(Insteon.link_timer);
  Insteon.link_timer = undefined;
  Insteon.linking = false;

  var device = Insteon.getDevice(message.address);

  if (device === undefined) {

    log.info({
      'name': 'New Device',
      'capabilities': message.capabilities,
      'provider': 'insteon',
      'config': message
    });

    if (Insteon.auto_add) {

      abode.devices.create({
        'name': 'New Device',
        'capabilities': message.capabilities,
        'provider': 'insteon',
        'config': message
      }).then(function (device) {
        Insteon.last_device = device;
        log.info('Successfully added new device: ', message.address);
        defer.resolve();
      }, function (err) {
        log.error(err);
        defer.reject(err);
      });

    } else {
      log.info('Device linked but auto_add is disabled: ', message.address);
      Insteon.last_device = {
        'capabilities': message.capabilities,
        'provider': 'insteon',
        'config': message
      };

      defer.resolve();
      return defer.promise;

    }
  } else {

    Insteon.last_device = device;
    device.config = merge(device.config, message);

    device._save().then(function () {
      log.info('Successfully saved existing device: ', message.address);
      defer.resolve();
    }, function (err) {
      log.error(err);
      defer.reject(err);
    });

  }

  return defer.promise;
};

module.exports = Insteon;
