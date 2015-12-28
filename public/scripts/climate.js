'use strict';

angular.module('climate', ['ui.bootstrap'])
.service('climate', function ($interval, $timeout, $http, $state) {
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
.directive('climate', function () {

  return {
    restrict: 'E',
    transclude: true,
    scope: {
      room: '@',
      stat: '@',
      mode: '@',
      show_cool: '@',
      show_heat: '@',
      show_fan: '@',
      interval: '@',
      top: '@',
      bottom: '@',
      left: '@',
      right: '@',
      height: '@',
      width: '@'
    },
    controller: function ($scope, $interval, $uibModal, climate, devices) {
      climate.add_room($scope.room);

      $scope.interval = $scope.interval || 2;
      $scope.devices = [];
      $scope.value = '';
      $scope.styles = {
        'right': '1em',
        'bottom': '1em'
      };
      $scope.is_fan = false;
      $scope.is_cool = false;
      $scope.is_heat = false;

      $scope.openDetails = function () {
        $uibModal.open({
          animation: $scope.animationsEnabled,
          templateUrl: 'climateDevices.html',
          size: 'lg',
          controller: function ($scope, $uibModalInstance, $timeout, room, climate) {
            $scope.devices = climate.rooms[room];

            $scope.open = function (device) {
              devices.openDevice(device);
            };

            $scope.has_capability = function (device, cap) {
              return (device.capabilities.indexOf(cap) !== -1);
            };

            var getDevices = function () {
              var devices = climate.rooms[room];
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

      var parseRoom = function () {
        var data = climate.rooms[$scope.room] || [];

        var alert = false,
          alerting = 0;

          var fan = false;
          var cool = false;
          var heat = false;

        data.forEach(function (device) {
          if (device.capabilities.indexOf('temperature_sensor') !== -1) {
            $scope.value = Math.floor(device[$scope.stat]);
          }
          if (device.capabilities.indexOf('fan') !== -1) {
            fan = (device._on === true) ? true : fan;
          }
          if (device.capabilities.indexOf('conditioner') !== -1 && device._mode === 'COOL') {
            cool = true;
          }
          if (device.capabilities.indexOf('conditioner') !== -1 && device._mode === 'HEAT') {
            heat = true;
          }

        });

        $scope.is_fan = (fan) ? true : false;
        $scope.is_cool = (cool) ? true : false;
        $scope.is_heat = (heat) ? true : false;
        $scope.devices = data;
      };

      $interval(parseRoom, (1000));
    },
    template: '<button ng-click="openDetails()" class="img-circle climate" ng-style="styles"><div class="climate-value">{{value}}&deg;</div><div class="climate-fan bg-success img-circle" ng-show="is_fan"><i class="icon-fan"></i></div><div class="bg-info climate-cool img-circle" ng-show="is_cool"><i class="icon-snow"></i></div><div class="bg-danger climate-heat img-circle" ng-show="is_heat"><i class="icon-fire"></i></div></button>',
    replace: true,
  };

});
