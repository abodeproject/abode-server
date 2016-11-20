'use strict';

var q = require('q'),
  notifications = require('../notifications'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {

  notifications.query().then(function (results) {
    res.send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/', function (req, res) {

  delete req.body.triggers;

  notifications.create(req.body).then(function (results) {
    res.status(201).send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/test_push', function (req, res) {

  notifications.push_notifications(req.body).then(function (results) {
    res.status(200).send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/action/:id', function (req, res) {

  notifications.secure_action(req.params.id).then(function (result) {
    res.status(result.http_code || 200).send(result);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.get('/active', function (req, res) {

  notifications.query({'active': true}).then(function (results) {

    var rendered = [];

    results.forEach(function (record) {
      rendered.push({'_id': record.id, 'name': record.name, 'message': record.render(), 'expires': record.expires, 'actions': record.actions, 'active_date': record.active_date});
    });

    res.status(200).send(rendered);

  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/inactive', function (req, res) {

  notifications.query({'active': false}).then(function (results) {
    res.send(results);
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/:id', function (req, res) {

  notifications.get(req.params.id).then(function (results) {
    res.send(results);
  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/:id/actions', function (req, res) {

  notifications.get(req.params.id).then(function (results) {
    res.send(results.actions);
  }, function (err) {
    res.status(404).send(err);
  });

});

router.post('/:id/actions', function (req, res) {

  notifications.get(req.params.id).then(function (record) {

    record.add_action(req.body).then(function (result) {
      res.status(200).send(result);
    }, function (err) {
      res.status(400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/:id/actions/:action_id', function (req, res) {

  notifications.get(req.params.id).then(function (record) {

    record.get_action(req.params.action_id).then(function (result) {
      res.status(204).send(req.body);
    }, function (err) {
      res.status(400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.put('/:id/actions/:action_id', function (req, res) {

  notifications.get(req.params.id).then(function (record) {

    record.update_action(req.params.action_id).then(function (result) {
      res.status(204).send(req.body);
    }, function (err) {
      res.status(400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.delete('/:id/actions/:action_id', function (req, res) {

  notifications.get(req.params.id).then(function (record) {

    record.delete_action(req.params.action_id).then(function (result) {
      res.status(204).send(req.body);
    }, function (err) {
      res.status(400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/:id/triggers', function (req, res) {

  notifications.get(req.params.id).then(function (result) {

    result.list_triggers().then(function (results) {
      res.send(results);
    }, function (err) {
      res.status(400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.post('/:id/triggers', function (req, res) {

  notifications.get(req.params.id).then(function (record) {

    record.add_trigger(req.body).then(function () {
      res.status(201).send();
    }, function (err) {
      res.status(400).send(err);
    });

  }, function (err) {
    res.status(404).send(err);
  });

});

router.get('/:id/triggers/:trigger_id', function (req, res) {

  notifications.get(req.params.id).then(function (results) {
    results.get_trigger(req.params.trigger_id).then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(404).send(err);
    });
  }, function (err) {
    res.status(404).send(err);
  });

});

router.delete('/:id/triggers/:trigger_id', function (req, res) {

  notifications.get(req.params.id).then(function (results) {
    results.delete_trigger(req.params.trigger_id).then(function (result) {
      res.status(204).send(result);
    }, function () {
      res.status(404).send(err);
    });
  }, function (err) {
    res.status(404).send(err);
  });

});

router.put('/:id', function (req, res) {

  delete req.body.triggers;
  delete req.body.active;
  delete req.body.active_vars;
  delete req.body.active_date;

  notifications.update(req.params.id, req.body).then(function (record) {
    res.status(200).send(record);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.post('/:id/activate', function (req, res) {

  notifications.activate(req.params.id, req.body).then(function (result) {

    res.status(200).send(result);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.post('/:id/deactivate', function (req, res) {

  notifications.deactivate(req.params.id).then(function (record) {
    res.status(200).send(record);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.post('/:id/render', function (req, res) {

  notifications.render(req.params.id).then(function (record) {
    res.status(200).send(record);
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.post('/:id/do_action/:actionid', function (req, res) {

  notifications.do_action(req.params.id, req.params.actionid).then(function (result) {
    res.send(result)
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

router.delete('/:id', function (req, res) {

  notifications.delete(req.params.id).then(function () {
    res.status(204).send();
  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });

});

module.exports = router;
