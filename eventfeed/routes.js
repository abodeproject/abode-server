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

router.get('/', function (req, res) {
  var filter = {};

  //If client does not want json, start an event feed
  //This is for legacy clients
  if (req.headers.accept !== 'application/json') {
    abode.eventfeed.initClient(req, res);
    abode.eventfeed.addClient(req, res);
    return;
  }

  //Otherwise allow filtering and return json
  if (req.query.last) {
    filter.timestamp =  {'$gt': req.query.last};
  }

  if (req.query.type) {
    filter['event.type'] =  req.query.type;
  }

  if (req.query.event) {
    filter['event.event'] =  req.query.event;
  }

  if (req.query.name) {
    filter['event.name'] =  req.query.name;
  }

  abode.eventfeed.query(filter).then(function (results) {
    res.send(results)
  }, function (err) {
    res.status(400).send(err);
  });

});

router.post('/', function (req, res) {

  abode.make_key().then(function (key) {
    res.send({'key': key}); 
  }, function (err) {
    res.status(400).send(err);
  });

});

router.get('/:key', function (req, res) {

  //Check our key for validity 
  abode.check_key(req.params.key).then(function () {

    //Initialize our client
    abode.initClient(req, res);

    //If a last parameter was specified send all events since last timestamp
    if (req.query.last) {
      abode.eventfeed.query({'timestamp': {'$gt': req.query.last}}).then(function (results) {

        //Send our previous events
        results.forEach(function (event) {
          res.write('id: ' + event.timestamp + '\n');
          res.write('data:' + JSON.stringify(event.event) + '\n\n'); // Note the extra newline
        });

        //Add our client to the event feed
        abode.eventfeed.addClient(req, res);
      }, function (err) {
        res.status(400).send(err);
      });

    } else {
      //Add our client to the event feed
      abode.eventfeed.addClient(req, res);
    }

  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });
});

module.exports = router;