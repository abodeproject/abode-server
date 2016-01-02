'use strict';

angular.module('rooms', ['ui.router'])
.config(function($stateProvider, $urlRouterProvider) {

  $urlRouterProvider.when('/rooms', '/rooms/list');

  $stateProvider
  .state('index.rooms', {
    url: '/rooms',
    templateUrl: '/views/rooms/rooms.html',
  })
  .state('index.rooms.list', {
    url: '/list',
    templateUrl: '/views/rooms/rooms.list.html',
    controller: 'roomsList'
  })
  .state('index.rooms.add', {
    url: '/add',
    templateUrl: '/views/rooms/rooms.add.html',
    controller: 'roomsAdd'
  })
  .state('index.rooms.edit', {
    url: '/:name',
    templateUrl: '/views/rooms.edit.html',
    controller: 'roomsEdit'
  });
})
.service('rooms', function ($http, $q) {
  var loadRooms = function () {
    var defer = $q.defer();

    $http.get('api/rooms').then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  return {
    'load': loadRooms
  };
})
.controller('roomsList', function ($scope, $state, rooms) {
  $scope.rooms = [];
  $scope.loading = true;

  $scope.viewRoom = function (room) {
    $state.go('index.rooms.view', {name: room.name});
  };

  $scope.load = function () {
    rooms.load().then(function (rooms) {
      $scope.rooms = rooms;
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
