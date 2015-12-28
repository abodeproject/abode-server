var q = require('q');

var Pusher = function () {
  var defer = q.defer();
  defer.resolve();
  return defer.promise;
}

module.exports = Pusher;
