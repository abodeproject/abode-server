'use strict';

var fs = require('fs'),
  ini = require('ini'),
  web = require('../web'),
  abode = require('../abode'),
  express = require('express'),
  logger = require('log4js'),
  log = logger.getLogger('abode'),
  extend = require('util')._extend,
  exec = require('child_process').exec,
  router = express.Router();


router.get('/config', function (req, res) {
  var config = extend({}, abode.config);
  config.save_needed = abode.save_needed;

  res.status(200).send(config);
});

router.put('/config', web.isJson, function (req, res) {

  abode.update_config(req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/config/:section', function (req, res) {

  res.status(200).send(abode.config[req.params.section]);

});

router.put('/config/:section', web.isJson, function (req, res) {

  abode.update_config(req.body, req.params.section).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/save', function (req, res) {
  abode.write_config().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.get('/views', function (req, res) {

  abode.list_views().then(function (views) {
    res.status(200).send(views);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/views/:view', function (req, res) {

  abode.get_view(req.params.view).then(function (view) {
    res.status(200).send(view);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.put('/views/:view', function (req, res) {

  abode.write_view(req.params.view, req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.delete('/views/:view', function (req, res) {

  abode.delete_view(req.params.view).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/status/', function (req, res) {

  var level,
    status = {},
    display = abode.providers.display;


  status._on = display.power;
  status.capabilities = [
    'display',
    'video',
    'onoff',
  ];

  if (abode.providers.display.power && display.max_brightness && display.brightness) {
    level = Math.round((display.brightness / display.max_brightness) * 100);
    status._level = level;
    status.capabilities.push('dimmer');
  }

  fs.readFile('/dev/shm/sensors.json', function (err, data) {
    if (err) {
      log.error('Could not read sensor file: ', err);
      res.status(200).send(status);

      return;
    }

    data = JSON.parse(data) || {};

    if (data._temperature !== undefined) {
      status.capabilities.push('temperature_sensor');
      status._temperature = data._temperature;
    }

    if (data._humidity !== undefined) {
      status.capabilities.push('humidity_sensor');
      status._humidity = data._humidity;
    }

    if (data._lumens !== undefined) {
      status.capabilities.push('light_sensor');
      status._lumens = data._lumens;
    }

    res.status(200).send(status);
  });

});

router.get('/providers', function (req, res) {
  res.send(abode.providers._providers);
});

router.get('/capabilities', function (req, res) {
  res.send(abode.devices.capabilities);
});

router.get('/triggers', function (req, res) {
  res.send(abode.triggers.types);
});

router.post('/restart', function (req, res) {
  var b_handler = function (err, stdout, stderr) {
    if (err) {
      res.status(400).send({'status': 'failed', 'message': stdout, 'error': stderr});
      return;
    }


    res.send({'status': 'success'});
  };

  exec('/usr/bin/pkill chromium', b_handler);
});

router.post('/reboot', function (req, res) {
  var b_handler = function (err, stdout, stderr) {
    if (err) {
      res.status(400).send({'status': 'failed', 'message': stdout, 'error': stderr});
      return;
    }


    res.send({'status': 'success'});
  };

  exec('/usr/bin/sudo /sbin/shutdown -r now', b_handler);
});

router.post('/shutdown', function (req, res) {
  var b_handler = function (err, stdout, stderr) {
    if (err) {
      res.status(400).send({'status': 'failed', 'message': stdout, 'error': stderr});
      return;
    }


    res.send({'status': 'success'});
  };

  exec('/usr/bin/sudo /sbin/shutdown -h now', b_handler);
});

router.all('/sources/:source/:uri', function (req, res) {
  res.send(req.params);
});

router.post('/reboot', function (req, res) {
  res.send(req.params);
});

router.get('/events', function (req, res) {

  // set timeout as high as possible
  req.socket.setTimeout(0);

  // send headers for event-stream connection
  // see spec for more information
  res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
  });
  res.write('\n');


  // push this res object to our global variable
  abode.clients.push(res);

  req.on("close", function() {
    var toRemove;
    for (var j =0 ; j < abode.clients.length ; j++) {
        if (abode.clients[j] == res) {
            toRemove =j;
            break;
        }
    }
    abode.clients.splice(j,1);
    console.log(abode.clients.length);
  });
});

module.exports = router;
