'use strict';

angular.module('auth', [])
.service('auth', function ($http, $state, $q) {
  var obj = {};

  return {
    get: function () {
      return obj;
    },
    check: function () {
      var defer = $q.defer();

      $http.get('/api/auth')
      .then(function () {
        defer.resolve();
      }, function () {
        defer.reject();
      });

      return defer.promise;
    },
    login: function (data) {
      var defer = $q.defer();

      $http.post('/api/auth', data)
      .then(function () {
        defer.resolve();
      }, function (response) {
        defer.reject(response.data);
      });

      return defer.promise;
    },
    logout: function () {
      var defer = $q.defer();

      $http.delete('/api/auth')
      .then(function () {
        defer.resolve();
      }, function (response) {
        defer.reject(response.data);
      });

      return defer.promise;
    }
  };
});
