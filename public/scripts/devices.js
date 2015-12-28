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
        controller: function ($scope, $uibModalInstance, $interval, devices, device) {
          $scope.device = angular.copy(device);
          $scope.capabilities = angular.copy(device.capabilities).map(function (c) {
            return {
              'name': c,
              'view': 'views/devices/capabilities/' + c + '.html'
            };

          });

          $scope.name = device.name;

          $scope.ok = function () {
            $uibModalInstance.close();
          };

          $scope.toggle_onoff = function () {
            if ($scope.device._on) {
              $http.post('/devices/' + $scope.device.name + '/on');
            } else {
              $http.post('/devices/' + $scope.device.name + '/off');
            }
          };

          $interval(function () {
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
