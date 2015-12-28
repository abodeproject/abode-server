'use strict';

angular.module('devices', [])
.service('devices', function ($q, $http, $uibModal) {

  var getDevice = function (device) {
    var defer = $q.defer();

    $http({ url: '/devices/' + device }).then(function (response) {
      defer.resolve(response.data);
    }, function () {

    });

    return defer.promise;
  };

  return {
    get: getDevice,
    openDevice: function (device) {

      $uibModal.open({
        animation: true,
        templateUrl: 'views/device_view.html',
        size: 'sm',
        controller: function ($scope, $uibModalInstance, $interval, $timeout, devices, device) {
          $scope.device = angular.copy(device);
          $scope.capabilities = angular.copy(device.capabilities).map(function (c) {
            return {
              'name': c,
              'view': 'views/devices/capabilities/' + c + '.html'
            };

          });

          $scope.sensors = $scope.capabilities.filter(function (c) {

            return (c.name.indexOf('_sensor') > -1);

          });

          $scope.controls = $scope.capabilities.filter(function (c) {

            return (c.name.indexOf('_sensor') === -1);

          });

          $scope.name = device.name;

          $scope.ok = function () {
            $uibModalInstance.close();
          };

          $scope.toggle_onoff = function () {
            if ($scope.device._on) {
              $http.post('/devices/' + $scope.device.name + '/off');
            } else {
              $http.post('/devices/' + $scope.device.name + '/on');
            }
          };

          $scope.set_mode = function (mode) {
            $http.post('/devices/' + $scope.device.name + '/set_mode', [mode]);
          };

          var temp_wait;

          $scope.temp_up = function () {
            if (temp_wait) {
              $timeout.cancel(temp_wait);
            }
            $scope.device._set_point += 1;

            temp_wait = $timeout($scope.set_temp, 2000);
          };

          $scope.temp_down = function () {
            if (temp_wait) {
              $timeout.cancel(temp_wait);
            }
            $scope.device._set_point -= 1;

            temp_wait = $timeout($scope.set_temp, 2000);
          };

          $scope.set_temp = function (temp) {
            $http.post('/devices/' + $scope.device.name + '/set_point', [$scope.device._set_point]).then(function () {
              temp_wait = undefined;
            }, function () {
              temp_wait = undefined;
            });
          }

          $interval(function () {
            if (temp_wait) {
              return;
            }
            getDevice($scope.device.name).then(function (response) {
              $scope.device = response;
            });
          }, 2000);
        },
        resolve: {
          device: function () {
            return getDevice(device);
          }
        }
      });

    }
  };
})
.directive('device', function () {

  return {
    restrict: 'E',
    transclude: true,
    scope: {      device: '@'
    },
    controller: function ($scope, device) {

      $scope.device = device.get($scope.device);

    },
    template: '<div>{{device.name}}</div>',
    replace: true,
  };

});
