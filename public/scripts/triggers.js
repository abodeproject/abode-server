'use strict';

angular.module('triggers', [])
.service('triggers', function ($http, $q) {
  var load = function () {
    var defer = $q.defer();

    $http.get('api/triggers').then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  return {
    'load': load
  };
})
.controller('triggersList', function ($scope, $state, triggers) {
  $scope.triggers = [];
  $scope.loading = true;

  $scope.view = function (room) {
    $state.go('index.triggers.view', {name: room.name});
  };

  $scope.load = function () {
    triggers.load().then(function (triggers) {
      $scope.triggers = triggers;
      $scope.loading = false;
      $scope.error = false;
    }, function () {
      $scope.loading = false;
      $scope.error = true;
    });
  };



  $scope.load();
})
.controller('room', function () {

});
