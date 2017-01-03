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

router.get('/upnp', function (req, res) {
  abode.detect_upnp('abode:server').then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.post('/import_ca', web.isUnlocked, function (req, res) {
  abode.import_ca(req.body.url).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err)
  })
});

router.get('/detect_devices', function (req, res) {
  abode.detect_upnp('abode:device').then(function (result) {
    res.status(200).send(result);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.get('/config', web.isUnlocked, function (req, res) {
  var config = extend({}, abode.config);
  config.save_needed = abode.save_needed;

  res.status(200).send(config);
});

router.put('/config', web.isUnlocked, web.isJson, function (req, res) {

  abode.update_config(req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/config/:section', web.isUnlocked, function (req, res) {

  res.status(200).send(abode.config[req.params.section]);

});

router.put('/config/:section', web.isUnlocked, web.isJson, function (req, res) {

  abode.update_config(req.body, req.params.section).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/save', web.isUnlocked, function (req, res) {
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

  if (req.params.view.indexOf('.html') === -1) {
    req.params.view += '.html';
  }
  abode.get_view(req.params.view).then(function (view) {
    res.status(200).send(view);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.put('/views/:view', web.isUnlocked, function (req, res) {

  if (req.params.view.indexOf('.html') === -1) {
    req.params.view += '.html';
  }

  var write_view = function (content) {
    abode.write_view(req.params.view, content).then(function (response) {
      res.status(200).send(response);
    }, function (err) {
      res.status(400).send(err);
    });
  }

  if (!req.body) {

    abode.read_view().then(write_view, function (err) {
      res.status(400).send(err);
    });

  } else {
    console.log('getting default view');
    write_view(req.body);
  }

});

router.delete('/views/:view', web.isUnlocked, function (req, res) {

  abode.delete_view(req.params.view).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/status/', function (req, res) {

  var level,
    display,
    status = {};

  status.name = abode.config.name;
  status.url = abode.config.url;
  status.ssl_url = abode.config.ssl_url;
  status.mode = abode.config.mode;
  status.capabilities = [];
  status.ca_url = abode.config.ca_url;

  if (abode.providers && abode.providers.display) {
    display = abode.providers.display;
    status._on = display.power;
    status.capabilities.push('client');
    status.capabilities.push('browser');
    status.capabilities.push('display');
    status.capabilities.push('onoff');
    status._level = display.brightness;
    status.capabilities.push('dimmer');
  }

  if (abode.providers && abode.providers.video) {
    status.capabilities.push('video');
  }

  fs.readFile('/dev/shm/sensors.json', function (err, data) {
    if (err) {
      log.debug('Could not read sensor file: ', err.message || err);
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

    if (status.capabilities.length === 0) {
      delete status.capabilities;
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

  exec('/usr/bin/sudo -n /sbin/shutdown -r now', b_handler);
});

router.post('/shutdown', function (req, res) {
  var b_handler = function (err, stdout, stderr) {
    if (err) {
      res.status(400).send({'status': 'failed', 'message': stdout, 'error': stderr});
      return;
    }


    res.send({'status': 'success'});
  };

  exec('/usr/bin/sudo -n /sbin/shutdown -h now', b_handler);
});


router.get('/events', function (req, res) {
  abode.eventfeed.initClient(req, res);
  abode.eventfeed.addClient(req, res);
});

router.all('/sources/:source/:uri', function (req, res) {
  res.send(req.params);
});

router.post('/reboot', function (req, res) {
  res.send(req.params);
});

module.exports = router;
