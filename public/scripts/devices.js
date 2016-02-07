'use strict';

angular.module('devices', ['ui.router','ngResource'])
.config(function($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.when('/devices', '/devices/list');

  $stateProvider
  .state('index.devices', {
    url: '/devices',
    templateUrl: '/views/devices/devices.html',
  })
  .state('index.devices.list', {
    url: '/list',
    templateUrl: '/views/devices/devices.list.html',
    controller: 'devicesList'
  })
  .state('index.devices.add', {
    url: '/add',
    templateUrl: '/views/devices/devices.add.html',
    controller: 'devicesAdd',
    resolve: {
      'providers': function ($q, $http) {
        var defer = $q.defer();

        $http.get('api/abode/providers').then(function (response) {
          defer.resolve(response.data);
        }, function (err) {
          defer.reject(err);
        });

        return defer.promise;
      },
      'capabilities': function ($q, $http) {
        var defer = $q.defer();

        $http.get('api/abode/capabilities').then(function (response) {
          defer.resolve(response.data);
        }, function (err) {
          defer.reject(err);
        });

        return defer.promise;
      }
    }
  })
  .state('index.devices.edit', {
    url: '/:name',
    templateUrl: '/views/devices/devices.edit.html',
    controller: 'devicesEdit',
    resolve: {
      'device': function ($stateParams, $state, devices) {

        return devices.get($stateParams.name);

      },
      'providers': function ($q, $http) {
        var defer = $q.defer();

        $http.get('api/abode/providers').then(function (response) {
          defer.resolve(response.data);
        }, function (err) {
          defer.reject(err);
        });

        return defer.promise;
      },
      'capabilities': function ($q, $http) {
        var defer = $q.defer();

        $http.get('api/abode/capabilities').then(function (response) {
          defer.resolve(response.data);
        }, function (err) {
          defer.reject(err);
        });

        return defer.promise;
      }
    }
  });
})
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

  var openDevice =function (device) {

    return $uibModal.open({
      animation: true,
      templateUrl: 'views/devices/devices.view.html',
      size: 'sm',
      controller: function ($scope, $uibModalInstance, $interval, $timeout, $state, devices, device) {
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

        $scope.edit = function () {
          $uibModalInstance.close({'recurse': true});
          $state.go('index.devices.edit', {'name': device.name});
        };

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

        $scope.set_temp = function () {

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
        };

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

        $scope.set_level = function () {

          $scope.processing = true;
          $scope.errors = false;

          $http.post('/api/devices/' + $scope.device.name + '/set_level', [$scope.device._level]).then(function (response) {
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
        };

        var device_checker = function () {
          if (temp_wait || level_wait) {
            return;
          }
          getDevice($scope.device.name).then(function (response) {
            $scope.device = response;
          });
        };

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

  };

  var addDevice = function (config) {
    var defer = $q.defer();

    $http.post('/api/devices', config).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var saveDevice = function (device) {
    var defer = $q.defer();

    $http.put('/api/devices/' + device._id, device).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var removeDevice = function (device) {
    var defer = $q.defer();

    $http.delete('/api/devices/' + device).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var getDeviceRooms = function (device) {
    var defer = $q.defer();

    $http({ url: '/api/devices/' + device + '/rooms'}).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var addDeviceRoom = function (device, room) {
    var defer = $q.defer();

    $http.post('/api/devices/' + device + '/rooms', {'name': room}).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var removeDeviceRoom = function (device, room) {
    var defer = $q.defer();

    $http.delete('/api/devices/' + device + '/rooms/' + room).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  return {
    'load': load,
    'add': addDevice,
    'view': openDevice,
    'get': getDevice,
    'save': saveDevice,
    'remove': removeDevice,
    'getRooms': getDeviceRooms,
    'addRoom': addDeviceRoom,
    'removeRoom': removeDeviceRoom,
    'openDevice': openDevice
  };
})
.controller('devicesList', function ($scope, $state, devices) {
  $scope.devices = [];
  $scope.loading = true;

  $scope.view = function (device) {
    devices.openDevice(device.name);
  };

  $scope.edit = function (device) {
    $state.go('index.devices.edit', {'name': device.name});
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

  $scope.has_capability = function (device, cap) {
    return (device.capabilities.indexOf(cap) !== -1);
  };

  $scope.load();
})
.controller('devicesEdit', function ($scope, $state, $uibModal, devices, device, confirm, providers, capabilities) {
  $scope.providers = providers;
  $scope.capabilities = capabilities;
  $scope.device = device;
  $scope.alerts = [];
  $scope.rooms = [];
  $scope.loading = false;
  $scope.section = 'provider'
  $scope.provider_template = '/views/providers/' + device.provider + '/edit.html';

  if (!device) {
    $state.go('index.devices.list');
  }

  var getRooms = function () {
    $scope.loading = true;
    devices.getRooms(device.name).then(function(rooms) {
      $scope.rooms = rooms;
      $scope.loading = false;
    }, function () {
      $scope.loading = false;
    });
  };

  getRooms();

  $scope.back = function () {
    $state.go('index.devices');
  };

  $scope.closeAlert = function(index) {
    $scope.alerts.splice(index, 1);
  };

  $scope.save = function () {
    devices.save($scope.device).then(function () {
      $scope.alerts = [{'type': 'success', 'msg': 'Device Saved'}];
    }, function (err) {
      $scope.alerts = [{'type': 'danger', 'msg': 'Failed to save Device'}];
      $scope.errors = err;
    });
  };

  $scope.remove = function () {
    confirm('Are you sure you want to remove this Device?').then(function () {
      devices.remove(device._id).then(function () {
        $state.go('index.devices');
      }, function (err) {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to remove Device'}];
        $scope.errors = err;
      });
    });
  };

  $scope.removeRoom = function (id) {

    confirm('Are you sure?').then(function () {
      devices.removeRoom(device.name, id).then(function () {
        getRooms();
        $scope.alerts = [{'type': 'success', 'msg': 'Room removed from Device'}];
      }, function () {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to remove Room from Device'}];
      });
    });

  };

  $scope.addRoom = function () {
    var assign = $uibModal.open({
      animation: true,
      templateUrl: 'views/devices/assign.html',
      size: 'sm',
      resolve: {
        assigned: function () {
          return $scope.rooms.map(function (obj) {return obj.name; });
        }
      },
      controller: function ($scope, $uibModalInstance, rooms, assigned) {
        $scope.loading = true;
        $scope.rooms = [];
        $scope.assigned = assigned;

        $scope.cancel = function () {
          $uibModalInstance.dismiss();
        };

        $scope.select = function (room) {
          $uibModalInstance.close(room);
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

      }
    });

    assign.result.then(function (room) {

      devices.addRoom(device.name, room.name).then(function () {
        getRooms();
        $scope.alerts = [{'type': 'success', 'msg': 'Room added to Device'}];
      }, function () {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to add Room to Device'}];
      });

    });

  };

  $scope.toggle_capability = function (capability) {
    if ($scope.has_capability(capability)) {
      console.log('removing', capability);
      $scope.device.capabilities.splice($scope.device.capabilities.indexOf(capability), 1);
    } else {
      console.log('adding', capability);
      $scope.device.capabilities.push(capability);
    }
  };

  $scope.has_capability = function (capability) {
    return ($scope.device.capabilities.indexOf(capability) !== -1);
  };

})
.controller('devicesAdd', function ($scope, $state, devices, providers, capabilities) {
  $scope.device = {'capabilities': []};
  $scope.alerts = [];
  $scope.providers = providers;
  $scope.capabilities = capabilities;
  $scope.section = 'provider';
  $scope.provider_templates = {};

  $scope.providers.forEach(function (p) {
    $scope.provider_templates[p] = '/views/providers/' + p + '/add.html';
  });

  $scope.back = function () {
    $state.go('index.devices');
  };

  $scope.closeAlert = function(index) {
    $scope.alerts.splice(index, 1);
  };

  $scope.changeProvider = function (p) {
    $scope.device.provider = p;
    $scope.section = 'settings';
    $scope.provider_template = '/views/providers/' + p + '/add.html';
  };

  $scope.add = function () {
    devices.add($scope.device).then(function () {
      $scope.alerts = [{'type': 'success', 'msg': 'Device Added'}];
      $scope.device = {'capabilities': []};
      $scope.section = 'provider';
    }, function (err) {
      $scope.alerts = [{'type': 'danger', 'msg': 'Failed to add Device'}];
      $scope.errors = err;
    });
  };

  $scope.toggle_capability = function (capability) {
    if ($scope.has_capability(capability)) {
      console.log('removing', capability);
      $scope.device.capabilities.splice($scope.device.capabilities.indexOf(capability), 1);
    } else {
      console.log('adding', capability);
      $scope.device.capabilities.push(capability);
    }
  };

  $scope.has_capability = function (capability) {
    return ($scope.device.capabilities.indexOf(capability) !== -1);
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
