'use strict';

angular.module('statuses', ['ui.bootstrap'])
.service('status', function ($interval, $timeout, $http, $state) {
  var rooms = {};
  var loader;
  var updater;

  var errorResponse = function (room) {

    return function (response) {
      //console.log('Error getting devices for room %s: %s', room, response);
      return;
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
    if ($state.current.name !== 'home') {
      $interval.cancel(updater);
      return;
    }

    Object.keys(rooms).forEach(getRoom);

  };

  updater = $interval(load, 10000);

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
    rooms: rooms,
    get: function (room) {
      return rooms[room] || [];
    }
  };
})
.filter('ageHumanReadable', function ($q) {


  var secondsToString = function (seconds) {
    var numyears = Math.floor(seconds / 31536000);
    var numdays = Math.floor((seconds % 31536000) / 86400);
    var numhours = Math.floor(((seconds % 31536000) % 86400) / 3600);
    var numminutes = Math.floor((((seconds % 31536000) % 86400) % 3600) / 60);
    var numseconds = Math.floor((((seconds % 31536000) % 86400) % 3600) % 60);
    numyears = (numyears === 0) ? '' : numyears + ' years ';
    numdays = (numdays === 0) ? '' : numdays + ' days ';
    numhours = (numhours === 0) ? '' : numhours + ' hours ';
    numminutes = (numminutes === 0) ? '' : numminutes + ' min ';
    numseconds = (numseconds === 0) ? '' : numseconds + ' sec ';

    return numyears + numdays + numhours + numminutes + numseconds;

  };

  return function (input) {
    return (!isNaN(input)) ? secondsToString(input): '&nbsp;';
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
    controller: function ($scope, $interval, $uibModal, status) {
      status.add_room($scope.room);

      $scope.interval = $scope.interval || 2;
      $scope.state = $scope.state || '_on';
      $scope.alerting = 0;
      $scope.popup_template = 'roomDevices.html';
      $scope.devices = [];


      $scope.openDetails = function () {
        $uibModal.open({
          animation: $scope.animationsEnabled,
          templateUrl: 'roomDevices.html',
          size: 'lg',
          controller: function ($scope, $uibModalInstance, $timeout, room, status) {
            $scope.devices = status.rooms[room];

            var getDevices = function () {
              var devices = status.rooms[room];
              if (devices.length > 0) {
                $scope.devices = devices;
              } else {
                console.dir(devices);
              }
              $timeout(getDevices, 5000);
            };

            getDevices();
            $scope.ok = function () {
              $uibModalInstance.close();
            };

          },
          resolve: {
            room: function () {
              return $scope.room;
            }
          }
        });
      };


      var secondsToString = function (seconds) {
        var numyears = Math.floor(seconds / 31536000);
        var numdays = Math.floor((seconds % 31536000) / 86400);
        var numhours = Math.floor(((seconds % 31536000) % 86400) / 3600);
        var numminutes = Math.floor((((seconds % 31536000) % 86400) % 3600) / 60);
        var numseconds = Math.floor((((seconds % 31536000) % 86400) % 3600) % 60);
        numyears = (numyears === 0) ? '' : numyears + ' years ';
        numdays = (numdays === 0) ? '' : numdays + ' days ';
        numhours = (numhours === 0) ? '' : numhours + ' hours ';
        numminutes = (numminutes === 0) ? '' : numminutes + ' min ';
        numseconds = (numseconds === 0) ? '' : numseconds + ' sec ';

        return numyears + numdays + numhours + numminutes + numseconds;

      };



      var parseRoom = function () {
        var data = status.rooms[$scope.room] || [];

        var alert = false,
          alerting = 0;

        data.forEach(function (room) {
          if (room[$scope.state] === true) {
            room.age = new Date() - new Date(room.last_on);
            alert = true;
            alerting += 1;
          } else {
            room.age = new Date() - new Date(room.last_off);
          }

          if (!isNaN(room.age)) {
            room.age = room.age / 1000;
          } else {
            room.age = 0;
          }
        });

        $scope.alert = alert;
        $scope.alerting = alerting;
        $scope.devices = data;
      };

      $interval(parseRoom, (1000));
    },
    template: '<button class="status {{icon}}" ng-click="openDetails()"><span class="status_badge" ng-class="{status_alert: alert}">{{alerting}}</span></button>',
    replace: true,
  };

});
