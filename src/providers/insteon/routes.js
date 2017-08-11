'use strict';

var insteon = require('../insteon'),
  utils = require('./utils'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': insteon.enabled,
    'connected': insteon.modem.connected,
    'linking': insteon.linking,
    'polling': insteon.polling,
    'last_linked': insteon.last_linked,
    'sending': insteon.modem.sending,
    'send_queue': insteon.modem.send_queue.length,
    'reading': insteon.modem.reading,
    'read_queue': insteon.modem.read_queue.length,
    'last_sent': insteon.modem.last_sent,
    'expectation_queue': insteon.modem.expectations.length,
    'modem': insteon.modem_info,
    'config': insteon.config
  });

});

router.post('/enable', function (req, res) {

  insteon.enable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/disable', insteon.is_enabled, function (req, res) {

  insteon.disable().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/database', insteon.is_enabled, function (req, res) {

  res.status(200).send(insteon.database);

});

router.post('/load_database', insteon.is_enabled, function (req, res) {

  insteon.load_modem_database().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/get_im_info', insteon.is_enabled, function (req, res) {

  insteon.get_im_info().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/get_im_configuration', insteon.is_enabled, function (req, res) {

  insteon.get_im_configuration().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/start_all_linking', insteon.is_enabled, function (req, res) {

  insteon.start_all_linking(req.body).then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/start_all_linking/:group', insteon.is_enabled, function (req, res) {

  insteon.start_all_linking({'group': req.params.group, 'controller': req.body.controller}).then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/cancel_all_linking', insteon.is_enabled, function (req, res) {

  insteon.cancel_all_linking().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/get_first_all_link_record', insteon.is_enabled, function (req, res) {

  insteon.get_first_all_link_record().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/get_next_all_link_record', insteon.is_enabled, function (req, res) {

  insteon.get_next_all_link_record().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/led_on', insteon.is_enabled, function (req, res) {

  insteon.led_on().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/led_off', insteon.is_enabled, function (req, res) {

  insteon.led_off().then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/devices', insteon.is_enabled, function (req, res) {

  res.send(insteon.devices);

});

router.get('/devices/:device', insteon.is_enabled, insteon.request_device, function (req, res) {

    res.status(200).send({
      'name': req.device.name,
      'on': req.device.on,
      'level': req.device.level,
      'last_command': req.device.last_command,
      'last_seen': req.device.last_seen,
      'config': req.device.config
    });

});

router.post('/devices/:device/status', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.get_status()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/ping', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.ping()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/ping/:count', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.ping(req.params.count)
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/beep', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.beep()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/get_all_link_database_delta', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.get_all_link_database_delta()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/id_request', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.id_request()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/on', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.on()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/on_fast', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.on_fast()
  .then(function (result) {
    res.status(204).send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/start_brighten', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.start_brighten()
  .then(function (result) {
    res.status(204).send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/off', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.off()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/off_fast', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.off_fast()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/start_dim', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.start_dim()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/stop_change', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.stop_change()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/set_level/:level', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.set_level(parseInt(req.params.level, 10))
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/set_level/:level/:ramp_rate', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.set_level(parseInt(req.params.level, 10), parseInt(req.params.ramp_rate, 10))
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/get_status', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.get_status()
  .then(function (result) {
    res.send(result.response);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/exit_linking_mode', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.exit_linking_mode()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/enter_linking_mode', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.enter_linking_mode()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/enter_linking_mode/:group', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.enter_linking_mode(parseInt(req.params.group, 10))
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/enter_unlinking_mode', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.enter_unlinking_mode()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/enter_unlinking_mode/:group', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.enter_unlinking_mode(parseInt(req.params.group, 10))
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/set_button_tap', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.set_button_tap()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/product_data_request', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.product_data_request()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/device_text_string_request', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.device_text_string_request()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.get('/devices/:device/next_free_id', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.next_free_id()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/load_database', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.load_database()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.get('/devices/:device/database', insteon.is_enabled, insteon.request_device, function (req, res) {

  if (req.device.config.database_delta !== undefined) {
    res.send(req.device.config.database.filter(function (record) {
      return (record.flags.used);
    }));
  } else {
    res.status(400).send({'message': 'Device database not yet loaded'});
  }

});

router.post('/devices/:device/database', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.create_record(req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/devices/:device/database/:offset', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.get_record(req.params.offset).then(function (result) {
    res.send(result);
  }, function (err) {
    res.status(404).send(err);
  });

});

router.put('/devices/:device/database/:offset', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.update_record(req.params.offset, req.body).then(function (result) {
    res.send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.delete('/devices/:device/database/:offset', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.delete_record(req.params.offset).then(function (result) {
    res.send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/get_extended_data', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.get_extended_data()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/get_extended_data/:group', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.get_extended_data(parseInt(req.params.group, 10))
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/read_operating_flags', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.read_operating_flags()
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/read_operating_flags/:flag', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.read_operating_flags(parseInt(req.params.flag, 10))
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/set_extended_data', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.set_extended_data(req.body)
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/set_heartbeat_interval/:interval', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.set_heartbeat_interval(parseInt(req.params.interval, 10))
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/set_low_battery_level/:level', insteon.is_enabled, insteon.request_device, function (req, res) {

  req.device.set_low_battery_level(parseInt(req.params.level, 10))
  .then(function (result) {
    res.send(result);
  })
  .fail(function (err) {
    res.status(400).send(err);
  });

});


router.get('/scenes', insteon.is_enabled, function (req, res) {

  res.send(insteon.scenes);

  /*
  var i,
    scenes = [];

  for (i=1; i<=255; i++) {
    var name,
      matches = insteon.devices.filter(function (dev) {
        return (dev.config.address.toLowerCase() === '00.00.' + utils.toHex(i));
      });

    name = (matches.length > 0) ? matches[0].name : 'UNUSED (' + i + ')';
    scenes.push({
      'id': i,
      'address': '00.00.' + utils.toHex(i),
      'name': name,
      'used': matches.length > 0
    });
  }

  res.status(200).send(scenes);
  */
});

router.post('/scenes/:scene/members', insteon.is_enabled, insteon.request_scene, function (req, res) {

  req.scene.add_member(req.params.member, req.body)
    .then(function (result) {
      res.send(result);
    })
    .fail(function (err) {
      res.status(400).send(err);
    });

});

router.put('/scenes/:scene/members/:member', insteon.is_enabled, insteon.request_scene, function (req, res) {

  req.scene.update_member(req.params.member, req.body)
    .then(function (result) {
      res.send(result);
    })
    .fail(function (err) {
      res.status(400).send(err);
    });

});

router.delete('/scenes/:scene/members/:member', insteon.is_enabled, insteon.request_scene, function (req, res) {

  req.scene.delete_member(req.params.member, req.body)
    .then(function (result) {
      res.send(result);
    })
    .fail(function (err) {
      res.status(400).send(err);
    });

});

module.exports = router;
