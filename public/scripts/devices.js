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

  var load = function () {
    var defer = $q.defer();

    $http.get('api/devices').then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  return {
    get: getDevice,
    load: load,
    openDevice: function (device) {

      $uibModal.open({
        animation: true,
        templateUrl: 'views/device_view.html',
        size: 'sm',
        controller: function ($scope, $uibModalInstance, $interval, $timeout, devices, device) {
          var intervals = [];

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

          $scope.has_capability = function (capability) {
            var match = $scope.capabilities.filter(function (c) {

              return (c.name === capability);

            });

            return (match.length > 0);
          };

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

          var level_wait;

          $scope.level_up = function () {
            $scope.processing = true;
            $scope.errors = false;
            if (level_wait) {
              $timeout.cancel(level_wait);
            }
            if ($scope.device._level < 100){
              $scope.device._level += 1;
            }

            level_wait = $timeout($scope.set_level, 2000);
          };

          $scope.level_down = function () {
            $scope.processing = true;
            $scope.errors = false;
            if (level_wait) {
              $timeout.cancel(level_wait);
            }

            if ($scope.device._level > 0){
              $scope.device._level -= 1;
            }

            level_wait = $timeout($scope.set_level, 2000);
          };

          $scope.set_level = function (temp) {

            $scope.processing = true;
            $scope.errors = false;

            $http.post('/api/devices/' + $scope.device.name + '/level', [$scope.device._level]).then(function (response) {
              if (response.data.device) {
                $scope.device = response.data.device;
              }
              level_wait = undefined;
              $scope.processing = false;
              $scope.errors = false;
            }, function () {
              level_wait = undefined;
              $scope.processing = false;
              $scope.errors = true;
            });
          }

          var device_checker = function () {
            if (temp_wait || level_wait) {
              return;
            }
            getDevice($scope.device.name).then(function (response) {
              $scope.device = response;
            });
          }
          intervals.push($interval(device_checker, 2000));

          $scope.$on('$destroy', function () {
            intervals.forEach($interval.cancel);
          });
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
.controller('devicesList', function ($scope, $state, devices) {
  $scope.devices = [];
  $scope.loading = true;

  $scope.view = function (device) {
    devices.openDevice(device.name);
  };

  $scope.load = function () {
    devices.load().then(function (devices) {
      $scope.devices = devices;
      $scope.loading = false;
      $scope.error = false;
    }, function () {
      $scope.loading = false;
      $scope.error = true;
    });
  };



  $scope.load();
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
