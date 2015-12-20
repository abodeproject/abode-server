'use strict';

angular.module('statuses', ['ui.bootstrap'])
.service('status', function ($interval, $timeout, $http) {
  var rooms = {};
  var loader;

  console.log('statuses');

  var errorResponse = function (room) {

    return function (response) {
      console.log('Error getting devices for room %s: %s', room, response);
    };

  };

  var parseRoom = function (room) {

    return function (response) {
      rooms[room] = response.data;
    };

  };

  var getRoom = function (room) {

    $http({ url: '/rooms/' + room + '/devices' }).then(parseRoom(room), errorResponse(room));

  };

  var load = function () {
    Object.keys(rooms).forEach(getRoom);
  };

  $interval(load, 10000);

  return {
    add_room: function (room) {

      if (rooms[room] === undefined) {
        rooms[room] = [];
      }

      if (loader !== undefined) {
        $timeout.cancel(loader);
      }

      loader = $timeout(load, 500);
    },
    get: function (room) {
      return rooms[room] || [];
    }
  };
})
.directive('statuses', function () {

  return {
    restrict: 'E',
    transclude: true,
    scope: {
    },
    controller: function () {

    },
    template: '<div ng-transclude></div>',
    replace: true,
  };

})
.directive('status', function () {

  return {
    restrict: 'E',
    transclude: true,
    scope: {
      room: '@',
      icon: '@',
      state: '@',
      interval: '@'
    },
    controller: function ($scope, $interval, status) {
      status.add_room($scope.room);

      $scope.interval = $scope.interval || 2;
      $scope.state = $scope.state || '_on';
      $scope.alerting = 0;
      $scope.popup_template = 'roomDevices.html';
      $scope.devices = [];

      var parseRoom = function () {
        var data = status.get($scope.room) || [];

        var alert = false,
          alerting = 0;

        data.forEach(function (room) {
          if (room[$scope.state] === true) {
            alert = true;
            alerting += 1;
          }
        });

        $scope.alert = alert;
        $scope.alerting = alerting;
        $scope.devices = data;
      };

      $interval(parseRoom, (1000));
    },
    template: '<button class="status {{icon}}" popover-placement="top" uib-popover-template="popup_template"><span class="status_badge" ng-class="{status_alert: alert}">{{alerting}}</span></button>',
    replace: true,
  };

});
