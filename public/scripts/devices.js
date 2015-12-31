'use strict';

angular.module('devices', [])
.service('devices', function ($q, $http, $uibModal) {

  var getDevice = function (device) {
    var defer = $q.defer();

    $http({ url: '/api/devices/' + device }).then(function (response) {
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
          $scope.processing = false;
          $scope.errors = false;
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

          $scope.reload = function () {

            $scope.processing = true;
            $scope.errors = false;

            if ($scope.device.active === false) {
              $http.get('/api/devices/' + $scope.device.name).then(function (response) {
                $scope.device = response.data;
                $scope.processing = false;
                $scope.errors = false;
              }, function () {
                $scope.processing = false;
                $scope.errors = true;
              });
            } else {
              $http.post('/api/devices/' + $scope.device.name + '/status').then(function (response) {
                if (response.data.device) {
                  $scope.device = response.data.device;
                }
                $scope.processing = false;
                $scope.errors = false;
              }, function () {
                $scope.processing = false;
                $scope.errors = true;
              });
            }

          };

          $scope.ok = function () {
            $uibModalInstance.close();
          };


          $scope.toggle_onoff = function () {

            $scope.processing = true;
            $scope.errors = false;

            if ($scope.device.active === false) {
              if ($scope.device._on) {
                $http.put('/api/devices/' + $scope.device.name, {'_on': false}).then(function () {
                  $scope.processing = false;
                  $scope.errors = false;
                }, function () {
                  $scope.processing = false;
                  $scope.errors = true;
                });
              } else {
                $http.put('/api/devices/' + $scope.device.name, {'_on': true}).then(function () {
                  $scope.processing = false;
                  $scope.errors = false;
                }, function () {
                  $scope.processing = false;
                  $scope.errors = true;
                });
              }
            } else {
              if ($scope.device._on) {
                $http.post('/api/devices/' + $scope.device.name + '/off').then(function () {
                  $scope.processing = false;
                  $scope.errors = false;
                }, function () {
                  $scope.processing = false;
                  $scope.errors = true;
                });
              } else {
                $http.post('/api/devices/' + $scope.device.name + '/on').then(function () {
                  $scope.processing = false;
                  $scope.errors = false;
                }, function () {
                  $scope.processing = false;
                  $scope.errors = true;
                });
              }
            }
          };

          $scope.set_mode = function (mode) {

            $scope.processing = true;
            $scope.errors = false;

            $http.post('/api/devices/' + $scope.device.name + '/set_mode', [mode]).then(function (response) {
              if (response.data.device) {
                $scope.device = response.data.device;
              }
              $scope.processing = false;
              $scope.errors = false;
            }, function () {
              $scope.processing = false;
              $scope.errors = true;
            });
          };

          var temp_wait;

          $scope.temp_up = function () {
            $scope.processing = true;
            $scope.errors = false;
            if (temp_wait) {
              $timeout.cancel(temp_wait);
            }
            $scope.device._set_point += 1;

            temp_wait = $timeout($scope.set_temp, 2000);
          };

          $scope.temp_down = function () {
            $scope.processing = true;
            $scope.errors = false;
            if (temp_wait) {
              $timeout.cancel(temp_wait);
            }
            $scope.device._set_point -= 1;

            temp_wait = $timeout($scope.set_temp, 2000);
          };

          $scope.set_temp = function (temp) {

            $scope.processing = true;
            $scope.errors = false;

            $http.post('/api/devices/' + $scope.device.name + '/set_point', [$scope.device._set_point]).then(function (response) {
              console.log(response.data.device);
              if (response.data.device) {
                $scope.device = response.data.device;
              }
              temp_wait = undefined;
              $scope.processing = false;
              $scope.errors = false;
            }, function () {
              temp_wait = undefined;
              $scope.processing = false;
              $scope.errors = true;
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
