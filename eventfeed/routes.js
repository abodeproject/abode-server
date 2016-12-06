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
  var options = {'sort': {'timestamp': -1}};

  //If a last query param is set, use that, otherwise limit results to 100
  if (req.query.last) {
    filter.timestamp =  {'$gt': req.query.last};
  } else {
    options.limit = 100;
  }

  if (req.query.limit) {
    options.limit = req.query.limit;
  }

  if (req.query.skip) {
    options.skip = req.query.skip;
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

  abode.eventfeed.query(filter, options).then(function (results) {
    res.set('record-total', results.length);
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

router.get('/clients', function (req, res) {

  res.send({'client_count': abode.evnetfeed.clients.length});

});

router.get('/:key', function (req, res) {

  //Check our key for validity 
  abode.check_key(req.params.key).then(function () {
  

    //If a last parameter was specified send all events since last timestamp
    if (req.query.last) {
      abode.eventfeed.query({'timestamp': {'$gt': req.query.last}}).then(function (results) {

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

        //Send our previous events
        results.forEach(function (event) {
          res.write('id: ' + event.timestamp + '\n');
          res.write('data:' + JSON.stringify(event.event) + '\n\n'); // Note the extra newline
        });

        abode.eventfeed.clients.push(res);

        req.on("close", function() {
          abode.eventfeed.clients.splice(abode.eventfeed.clients.indexOf(res), 1);
        });

      }, function (err) {
        res.status(400).send(err);
      });

    } else {

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
    
      abode.eventfeed.clients.push(res);

      req.on("close", function() {
        abode.eventfeed.clients.splice(abode.eventfeed.clients.indexOf(res), 1);
      });

    }

  }, function (err) {
    res.status(err.http_code || 400).send(err);
  });
});

module.exports = router;