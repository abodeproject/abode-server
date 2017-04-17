'use strict';

var insteon = require('../insteon'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  res.send({
    'enabled': insteon.config.enabled,
    'connected': insteon.modem.connected,
    'linking': insteon.linking,
    'last_linked': insteon.last_linked,
    'sending': insteon.modem.sending,
    'send_queue': insteon.modem.send_queue.length,
    'reading': insteon.modem.reading,
    'read_queue': insteon.modem.read_queue.length,
    'expectation_queue': insteon.modem.expectations.length,
    'config': insteon.config,
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

router.get('/devices/:device', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {
    res.send(device);
  }, function (err) {
    res.status(404).send(err);
  });
  

});

router.post('/devices/:device/ping', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {

    device.ping().then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(400).send(err);
    });
    
  }, function (err) {
    res.status(404).send(err);
  });
  
});

router.post('/devices/:device/beep', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {

    device.beep().then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(400).send(err);
    });
    
  }, function (err) {
    res.status(404).send(err);
  });

});

router.post('/devices/:device/get_all_link_database_delta', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {

    device.get_all_link_database_delta().then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(400).send(err);
    });
    
  }, function (err) {
    res.status(404).send(err);
  });

});

router.post('/devices/:device/product_data_request', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {

    device.product_data_request().then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(400).send(err);
    });
    
  }, function (err) {
    res.status(404).send(err);
  });

});

router.post('/devices/:device/on', insteon.is_enabled, function (req, res) {

  insteon.on({'config': {'address': req.params.device}}).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/on_fast', insteon.is_enabled, function (req, res) {

  insteon.on_fast({'config': {'address': req.params.device}}).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/start_brighten', insteon.is_enabled, function (req, res) {

  insteon.start_brighten({'config': {'address': req.params.device}}).then(function () {
  	res.status(204).send();
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/off', insteon.is_enabled, function (req, res) {

  insteon.off({'config': {'address': req.params.device}}).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/off_fast', insteon.is_enabled, function (req, res) {

  insteon.off_fast({'config': {'address': req.params.device}}).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/start_dim', insteon.is_enabled, function (req, res) {

  insteon.start_dim({'config': {'address': req.params.device}}).then(function () {
  	res.status(204).send();
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/stop_change', insteon.is_enabled, function (req, res) {

  insteon.stop_change({'config': {'address': req.params.device}}).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/set_level/:level', insteon.is_enabled, function (req, res) {

  insteon.set_level({'config': {'address': req.params.device}}, parseInt(req.params.level, 10)).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/set_level/:level/:rate', insteon.is_enabled, function (req, res) {

  insteon.set_level({'config': {'address': req.params.device}}, parseInt(req.params.level, 10), parseInt(req.params.rate, 10)).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/get_status', insteon.is_enabled, function (req, res) {

  insteon.get_status({'config': {'address': req.params.device}}).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/enter_linking_mode', insteon.is_enabled, function (req, res) {

  insteon.enter_linking_mode({'config': {'address': req.params.device}}).then(function () {
  	res.status(204).send();
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/enter_unlinking_mode', insteon.is_enabled, function (req, res) {

  insteon.enter_unlinking_mode({'config': {'address': req.params.device}}).then(function () {
  	res.status(204).send();
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/set_button_tap', insteon.is_enabled, function (req, res) {

  insteon.set_button_tap({'config': {'address': req.params.device}}).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/product_data_request', insteon.is_enabled, function (req, res) {

  insteon.product_data_request({'config': {'address': req.params.device}}).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.post('/devices/:device/device_text_string_request', insteon.is_enabled, function (req, res) {

  insteon.device_text_string_request({'config': {'address': req.params.device}}).then(function (result) {
  	res.status(200).send(result);
  }, function (err) {
  	res.status(400).send(err);
  });

});

router.get('/devices/:device/all_link_database', insteon.is_enabled, function (req, res) {

  insteon.read_all_link_database({'config': {'address': req.params.device}}).then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/load_database', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {

    device.load_database(req.params.offset).then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(400).send(err);
    });
    
  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/devices/:device/database', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {

    if (device.config.database_delta !== undefined) {
      res.send(device.config.database.filter(function (record) {
        return (record.flags.used);
      }));
    } else {
      res.status(400).send({'message': 'Device database not yet loaded'});
    }
    
  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/devices/:device/database/:offset', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {

    device.get_record(req.params.offset).then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(400).send(err);
    });
    
  }, function (err) {
    res.status(404).send(err);
  });

});

router.delete('/devices/:device/database/:offset', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {

    device.delete_record(req.params.offset).then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(400).send(err);
    });
    
  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/devices/:device/all_link_database/:offset', insteon.is_enabled, function (req, res) {

  insteon.get_device(req.params.device).then(function (device) {

    device.read_all_link_database(req.params.offset).then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(400).send(err);
    });
    
  }, function (err) {
    res.status(404).send(err);
  });

});

router.delete('/devices/:device/all_link_database/:offset', insteon.is_enabled, function (req, res) {

  insteon.delete_all_link_database({'config': {'address': req.params.device}}, req.params.offset).then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});


router.put('/devices/:device/all_link_database/:offset', insteon.is_enabled, function (req, res) {

  insteon.write_all_link_database({'config': {'address': req.params.device}}, req.params.offset, req.body).then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/devices/:device/get_extended_data', insteon.is_enabled, function (req, res) {

  insteon.get_extended_data({'config': {'address': req.params.device}}).then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });

});


module.exports = router;
