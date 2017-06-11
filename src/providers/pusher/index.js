'use strict';

var q = require('q');

var Pusher = function () {
  var defer = q.defer();

  Pusher.enabled = true;
  defer.resolve();
  return defer.promise;
};

module.exports = Pusher;
