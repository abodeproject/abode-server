'use strict';

angular.module('triggers', ['ui.router'])
.config(function($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.when('/triggers', '/triggers/list');

  $stateProvider
  .state('index.triggers', {
    url: '/triggers',
    templateUrl: '/views/triggers/triggers.html',
  })
  .state('index.triggers.list', {
    url: '/list',
    templateUrl: '/views/triggers/triggers.list.html',
    controller: 'triggersList'
  })
  .state('index.triggers.add', {
    url: '/add',
    templateUrl: '/views/triggers/triggers.add.html',
    controller: 'triggersAdd'
  })
  .state('index.triggers.edit', {
    url: '/:name',
    templateUrl: '/views/triggers/triggers.edit.html',
    controller: 'triggersEdit'
  });
})
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
