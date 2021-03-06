'use strict';

var web = require('../web'),
  auth = require('../auth'),
  abode = require('../abode'),
  express = require('express'),
  router = express.Router();

/**
 * @api {get} /auth Get Status
 * @apiGroup Auth
 */
router.get('/', function (req, res) {
  if (req.auth) {
    res.status(200).send({'user': req.auth.user, 'authorized': true, 'client_token': req.auth.client_token, 'expires': req.auth.expires, 'status': req.auth.status});
  } else {
    res.status(401).send({'authorized': false});
  }
});

/**
 * @api {post} /auth/login Login
 * @apiGroup Auth
 *
 * @apiParam {String} username
 * @apiParam {String} password
 * @apiParamExample {json} Login Example
 *   {
 *     "username": "john",
 *     "password": "secret",
 *   }
 *
 * @apiSuccess {String} status Authentication Status
 * @apiSuccess {String} username   Name of the authenticated user
 * @apiSuccess {String} auth_token  Auth token for the user
 * @apiSuccess {String} client_token  Client token for the user
 */

router.post('/login', web.isJson, function (req, res) {
  var methods;

  req.body.ip = req.client_ip;
  req.body.agent = req.headers['user-agent'];

  if (req.body.password) {
    methods = ['password'];
  }

  auth.new_login(req.body, methods).then(function (response) {
    res.status(response.http_code || 200).send(response);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});


/**
 * @api {post} /auth Logout
 * @apiGroup Auth
 */
router.post('/logout', function (req, res) {

  if (req.token) {
    req.token.remove(function () {

      res.send({'status': 'success', 'message': 'You have been logged out'});

    }, function (err) {
      res.status(400).send(err);
    });
  } else {
    res.status(401).send({'status': 'unauthenticated'});
  }

});

/**
 * @api {get} /devices Devices
 * @apiGroup Auth
 * @apiDescription List all devices of capability 'client' which can be used to assign to a token
 *
 * @apiSuccess {String} array Array of devices
 * @apiSuccess {String} array._id Device id
 * @apiSuccess {String} array.name Device name
 * @apiSuccessExample {json} Device Assignment
 * [
 *   {
 *     "_id": "5814e91e5cf0d15927ffaf8d",
 *     "name": "Phone",
 *   }
 * ]
 *
 */

router.get('/devices', web.isUnlocked, function (req, res) {

  auth.devices().then(function (results) {
    res.send(results);
  }, function (err) {
    res.status(err.http_code || 400);
    delete err.http_code;
    res.send(err);
  });

});


/**
 * @api {post} /assign Assign
 * @apiGroup Auth
 * @apiDescription Assigns a device to a token and unassigns the requested device
 * from any tokens using requested device.  Any tokens previously assigned get
 * set to the unassigned status.
 *
 * @apiParam {String} _id
 * @apiParamExample {json} Device Assignment
 *   {
 *     "_id": "5814e91e5cf0d15927ffaf8d",
 *   }
 *
 * @apiSuccess {String} status Assignment Status
 * @apiSuccess {String} message Message describing the status
 */
router.post('/assign', web.isUnlocked, function (req, res) {
  req.body.config = req.body.config || {};

  req.token.assign_device(req.body._id, req.body.config.address).then(function (response) {
    res.send(response);
  }, function (err) {
    res.status(err.http_code || 400);
    delete err.http_code;
    res.send(err);
  });

});

/**
 * @api {get} /check Check
 * @apiGroup Auth
 * @apiDescription Assigns a device to a token and unassigns the requested device
 * from any tokens using requested device.  Any tokens previously assigned get
 * set to the unassigned status.
 *
 * @apiHeader {String} client_token
 * @apiHeader {String} auth_token
 *
 * @apiSuccessExample {json} Auth Status
 *   {
 *     "status": "active",
 *   }
 *
 * @apiSuccess {String} status Current status of the token which was used for the request
 */
router.get('/check', function (req, res) {

  if (req.token && req.token.status === 'active') {
    res.send({'status': 'active', 'token': req.token, 'identity': req.identity, 'device': req.device});
  } else if (req.token !== undefined) {
    res.status(403).send({'status': req.token.status});
  } else {
    res.status(401).send({'status': 'unauthenticated'});
  }

});

/**
 * @api {get} /device Get assigned device
 * @apiGroup Auth
 * @apiDescription Gets the currently assigned device for the token used in the request
 *
 * @apiSuccess {String} _id
 * @apiSuccess {String} name
 *
 * @apiSuccessExample {json} Assigned Device
 *   {
 *     "_id": "5814e91e5cf0d15927ffaf8d",
 *     "name": "Phone",
 *   }
 *
 */
router.get('/device', function (req, res) {

  if (req.token.status === 'active') {

    req.token.get_device().then(function (response) {
      res.send(response);
    }, function (err) {
      res.status(err.http_code || 400);
      delete err.http_code;
      res.send(err);
    });

  } else if (req.token.status === 'nodevice' || req.token.status === 'unassigned') {
    res.status(404).send({'status': req.token.status});
  } else if (req.token) {
    res.status(403).send({'status': req.token.status});
  } else {
    res.status(401).send({'status': 'unauthenticated'});
  }

});

router.put('/device', web.isUnlocked, function (req, res) {

  if (req.token.status === 'active') {

    req.device.set_state(req.body).then(function () {
      res.status(200).send(req.device);
      abode.devices.load();
    }, function (err) {
      res.status(422).send(err);
    });

  } else if (req.token.status === 'nodevice' || req.token.status === 'unassigned') {
    res.status(404).send({'status': req.token.status});
  } else if (req.token) {
    res.status(403).send({'status': req.token.status});
  } else {
    res.status(401).send({'status': 'unauthenticated'});
  }

});

/**
 * @api {get} /device Get assigned device
 * @apiGroup Auth
 * @apiDescription Gets the currently assigned device for the token used in the request
 *
 * @apiSuccess {String} _id
 * @apiSuccess {String} name
 *
 * @apiSuccessExample {json} Assigned Device
 *   {
 *     "_id": "5814e91e5cf0d15927ffaf8d",
 *     "name": "Phone",
 *   }
 *
 */
router.post('/device/set_interface', web.isUnlocked, function (req, res) {

  if (req.token.status === 'active' && req.body.interface) {

    req.token.get_device().then(function (device) {

      device.config = device.config || {};
      device.config.interface = req.body.interface;

      device.markModified('config');
      device._save(undefined, {'skip_pre': true}).then(function (result) {
        res.send(result);
      }, function (err) {
        res.status(400).send(err);
      });

    }, function (err) {
      res.status(err.http_code || 400);
      delete err.http_code;
      res.send(err);
    });

  } else if (req.token.status === 'nodevice' || req.token.status === 'unassigned') {
    res.status(404).send({'status': req.token.status});
  } else if (req.token) {
    res.status(403).send({'status': req.token.status});
  } else if (req.token && !req.body.interface) {
    res.status(400).send({'status': 'failed', 'message': 'No interface specified'});
  } else {
    res.status(401).send({'status': 'unauthenticated'});
  }

});


/**
 * @api {post} /device Create and assign a device
 * @apiGroup Auth
 * @apiDescription Gets the currently assigned device for the token used in the request
 *
 * @apiSuccess {String} _id
 * @apiSuccess {String} name
 *
 * @apiSuccessExample {json} Assigned Device
 *   {
 *     "_id": "5814e91e5cf0d15927ffaf8d",
 *     "name": "Phone",
 *   }
 *
 */
router.post('/devices', web.isUnlocked, web.isJson, function (req, res) {

  req.token.create_device(req.body).then(function (result) {
    res.send(result);
  }, function (err) {
    res.status(err.http_code || 400);
    delete err.http_code;
    res.send(err);
  });

});


/**
 * @api {get} /auth/pins Get Pins
 * @apiGroup Auth
 */
router.post('/check_pin', web.isJson, function (req, res) {

  auth.check_pin(req.body.pin).then(function (results) {
    res.status(200).send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

/**
 * @api {get} /auth/pins Get Pins
 * @apiGroup Auth
 */
router.get('/pins', web.isUnlocked, function (req, res) {

  auth.query_pins().then(function (results) {
    res.status(200).send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

/**
 * @api {get} /auth/pins Get Pins
 * @apiGroup Auth
 */
router.post('/pins', web.isUnlocked, web.isJson, function (req, res) {

  auth.create_pin(req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

/**
 * @api {get} /auth/pins Get Pins
 * @apiGroup Auth
 */
router.get('/pins/:id', web.isUnlocked, function (req, res) {

  auth.get_pin(req.params.id).then(function (pin) {
    res.status(200).send(pin);
  }, function (err) {
    res.status(404).send(err);
  });

});

/**
 * @api {get} /auth/pins Get Pins
 * @apiGroup Auth
 */
router.put('/pins/:id', web.isUnlocked, function (req, res) {

  auth.update_pin(req.params.id, req.body).then(function (response) {

    res.status(204).send(response);

  }, function (err) {
    res.status(err.code || 400).send(err);
  });

});

/**
 * @api {get} /auth/pins Get Pins
 * @apiGroup Auth
 */
router.delete('/pins/:id', web.isUnlocked, function (req, res) {

  auth.delete_pin(req.params.id).then(function (response) {

    res.status(200).send(response);

  }, function (err) {
    res.status(err.code || 400).send(err);
  });

});

/**
 * @api {post} /auth/pins/:pin/enable Get Pins
 * @apiGroup Auth
 */
router.post('/pins/:id/enable', web.isUnlocked, function (req, res) {

  auth.enable_pin(req.params.id).then(function (response) {

    res.status(200).send(response);

  }, function (err) {
    res.status(err.code || 400).send(err);
  });

});

/**
 * @api {post} /auth/pins/:pin/disable Get Pins
 * @apiGroup Auth
 */
router.post('/pins/:id/disable', web.isUnlocked, function (req, res) {

  auth.disable_pin(req.params.id).then(function (response) {

    res.status(200).send(response);

  }, function (err) {
    res.status(err.code || 400).send(err);
  });

});

router.get('/users', web.isUnlocked, function (req, res) {

  auth.list().then(function (results) {
    res.status(200).send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/users', web.isUnlocked, web.isJson, function (req, res) {

  auth.create(req.body).then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/users/:id', web.isUnlocked, function (req, res) {

  auth.get(req.params.id).then(function (user) {
    res.status(200).send(user);
  }, function (err) {
    res.status(404).send(err);
  });

});

router.put('/users/:id', web.isUnlocked, web.isJson, function (req, res) {

  delete req.body.user;
  
  auth.update(req.params.id, req.body).then(function (response) {

    res.status(204).send(response);

  }, function (err) {
    res.status(err.code || 400).send(err);
  });

});

router.delete('/users/:id', web.isUnlocked, function (req, res) {

  auth.get(req.params.id).then(function (user) {

    if (req.auth && req.auth.user === user.user) {
      res.status(400).send({'status': 'failed', 'message': 'Cannot delete self'});
      return;
    }

    auth.delete(req.params.id).then(function (response) {

      res.status(204).send(response);

    }, function (err) {
      res.status(err.code || 400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/users/:id/tokens', web.isUnlocked, function (req, res) {

  auth.get(req.params.id).then(function (user) {

    auth.list_tokens({'user': user.user}).then(function (results) {
     res.status(200).send(results);
    }, function (err) {
      res.status(400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/users/:id/tokens/:tokenid', web.isUnlocked, function (req, res) {

  auth.get(req.params.id).then(function (user) {

    auth.get_token(req.params.tokenid, user.user).then(function (results) {
     res.status(200).send(results);
    }, function (err) {
      res.status(400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.delete('/users/:id/tokens/:tokenid', web.isUnlocked, function (req, res) {

  auth.get(req.params.id).then(function (user) {

    auth.delete_token(req.params.tokenid, user.user).then(function (results) {
     res.status(204).send(results);
    }, function (err) {
      res.status(400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/tokens', web.isUnlocked, function (req, res) {

  auth.list_tokens().then(function (results) {
    res.status(200).send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/tokens/:id', web.isUnlocked, function (req, res) {

  auth.get_token(req.params.id).then(function (record) {
    res.status(200).send(record);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.delete('/tokens/:id', web.isUnlocked, function (req, res) {

  auth.delete_token(req.params.id).then(function () {
    res.status(204).send();
  }, function (err) {
    res.status(400).send(err);
  });

});

module.exports = router;
