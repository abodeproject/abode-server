'use strict';

var triggers = require('../triggers'),
  web = require('../web'),
  express = require('express'),
  router = express.Router();

router.get('/', function (req, res) {
  res.send(triggers.list());
  res.end();
});

router.post('/', web.isUnlocked, web.isJson, function (req, res) {
  delete req.body.notifications;

  triggers.create(req.body).then(function (response) {
    res.status(201).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.get('/:id', function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  res.send(triggers.get(req.params.id));
  res.end();
});

router.put('/:id', web.isUnlocked, web.isJson, function (req, res) {
  delete req.body.notifications;
  delete req.body.__v;

  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }

  Object.keys(req.body).forEach(function (key) {
    trigger[key] = req.body[key];
  });

  trigger._save().then(function (response) {
    res.status(204).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.delete('/:id', web.isUnlocked, function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  trigger.delete().then(function (response) {
    res.send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});



router.get('/:id/notifications', function (req, res) {

  var result = triggers.get(req.params.id);

  if (result) {

    result.list_notifications().then(function (results) {
      res.send(results);
    }, function (err) {
      res.status(400).send(err);
    });

  } else {
    res.status(404).send({'status': 'failed', 'message': 'Not Found'});
  }

});

router.post('/:id/notifications', web.isUnlocked, function (req, res) {

  var record = triggers.get(req.params.id);

  if (record) {

    record.add_notification(req.body).then(function () {
      res.status(201).send();
    }, function (err) {
      res.status(400).send(err);
    });

  } else {
    res.status(404).send({'status': 'failed', 'message': 'Not Found'});
  }

});

router.get('/:id/notifications/:notification_id', function (req, res) {

  var record = triggers.get(req.params.id);

  if (record) {

    record.get_notification(req.params.notification_id).then(function (result) {
      res.send(result);
    }, function (err) {
      res.status(404).send(err);
    });

  } else {
    res.status(404).send({'status': 'failed', 'message': 'Not Found'});
  }

});

router.delete('/:id/notifications/:notification_id', web.isUnlocked, function (req, res) {

  var record = triggers.get(req.params.id);

  if (record) {

    record.delete_notification(req.params.notification_id).then(function (result) {
      res.status(204).send(result);
    }, function (err) {
      res.status(404).send(err);
    });

  } else {
    res.status(404).send({'status': 'failed', 'message': 'Not Found'});
  }

});

router.post('/:id/check', web.isUnlocked, function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  trigger.check().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(400).send(err);
  });
});

router.post('/:id/enable', web.isUnlocked, function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  trigger.enable().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

router.post('/:id/disable', web.isUnlocked, function (req, res) {
  var trigger = triggers.get(req.params.id);
  if (!trigger) {
    res.status(404).send({'status': 'failed', 'message': 'Record not found'});
    return;
  }
  trigger.disable().then(function (response) {
    res.status(200).send(response);
  }, function (err) {
    res.status(422).send(err);
  });
});

module.exports = router;
