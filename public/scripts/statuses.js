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

    $http({ url: '/api/rooms/' + room + '/devices' }).then(parseRoom(room), errorResponse(room));

  };

  var load = function () {
    if ($state.current.name !== 'index.home') {
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
      'left': '@',
      'right': '@',
      'top': '@',
      'bottom': '@',
      'width': '@',
      'height': '@',
      'align': '@',
      'size': '@',
      'background': '@',
    },
    controller: function ($scope) {
      $scope.styles =  {};

      if ($scope.left) { $scope.styles.left = $scope.left + 'em'; }
      if ($scope.right) { $scope.styles.right = $scope.right + 'em'; }
      if ($scope.top) { $scope.styles.top = $scope.top + 'em'; }
      if ($scope.bottom) { $scope.styles.bottom = $scope.bottom + 'em'; }
      if ($scope.width) { $scope.styles.width = $scope.width + 'em'; }
      if ($scope.height) { $scope.styles.height = $scope.height + 'em'; }
      if ($scope.align) { $scope.styles['text-align'] = $scope.align; }
      if ($scope.size) { $scope.styles['font-size'] = $scope.size + 'em'; }
      if ($scope.background) { $scope.styles.background = $scope.background; }

    },
    template: '<ul class="statuses" ng-style="styles" ng-transclude></ul>',
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
    controller: function ($scope, $interval, $uibModal, status, devices) {
      var intervals = [];
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
          controller: function ($scope, $uibModalInstance, $interval, room, status) {
            var intervals = [];
            $scope.devices = status.rooms[room];

            $scope.ok = function () {
              $uibModalInstance.close();
            };

            $scope.open = function (device) {
              devices.openDevice(device);
            };

            var getDevices = function () {
              var devices = status.rooms[room];
              if (devices.length > 0) {
                $scope.devices = devices;
              } else {
                console.dir(devices);
              }
            };

            getDevices();
            intervals.push($interval(getDevices, 5000));

            $scope.$on('destroy', function () {
              intervals.forEach($interval.cancel);
            });

          },
          resolve: {
            room: function () {
              return $scope.room;
            }
          }
        });
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

      intervals.push($interval(parseRoom, 1000));

      $scope.$on('$destroy', function () {
        intervals.forEach($interval.cancel);
      });
    },
    template: '<li><button class="status img-circle" ng-click="openDetails()"><div class="status-icon"><i class="fi-{{icon}}"></i></div><span class="img-circle status_badge bg-info" ng-class="{\'bg-danger\': alert}">{{alerting}}</span></button></li>',
    replace: true,
  };

});
