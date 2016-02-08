'use strict';

angular.module('rooms', ['ui.router','ngResource'])
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
    templateUrl: '/views/rooms/rooms.edit.html',
    controller: 'roomsEdit',
    resolve: {
      'room': function ($stateParams, $state, rooms) {

        return rooms.get($stateParams.name);

      }
    }
  });
})
.service('rooms', function ($http, $q, $uibModal, $resource) {
  var model = $resource('/api/rooms/:id/:action', {id: '@_id'}, {
    'update': { method: 'PUT' },
    'get_temperature': { method: 'GET' , params: { action: 'get_temperature'}},
    'get_humidity': { method: 'GET' , params: { action: 'get_humidity'}},
    'get_lumacity': { method: 'GET' , params: { action: 'get_lumacity'}},
    'motion_on': { method: 'GET' , params: { action: 'motion_on'}},
    'motion_off': { method: 'GET' , params: { action: 'motion_off'}},
    'doors_open': { method: 'GET' , params: { action: 'doors_open'}},
    'doors_closed': { method: 'GET' , params: { action: 'doors_closed'}},
    'windows_open': { method: 'GET' , params: { action: 'windows_open'}},
    'windows_closed': { method: 'GET' , params: { action: 'windows_closed'}},
    'shades_open': { method: 'GET' , params: { action: 'shades_open'}},
    'shades_closed': { method: 'GET' , params: { action: 'shades_closed'}},
    'conditioning_on': { method: 'GET' , params: { action: 'conditioning_on'}},
    'conditioning_off': { method: 'GET' , params: { action: 'conditioning_off'}},
    'lights_on': { method: 'GET' , params: { action: 'lights_on'}},
    'lights_off': { method: 'GET' , params: { action: 'lights_off'}},
    'appliances_on': { method: 'GET' , params: { action: 'appliances_on'}},
    'appliances_off': { method: 'GET' , params: { action: 'appliances_off'}},
    'scenes_on': { method: 'GET' , params: { action: 'scenes_on'}},
    'scenes_off': { method: 'GET' , params: { action: 'scenes_off'}},
    'off': { method: 'POST' , params: { action: 'off'}},
    'on': { method: 'POST' , params: { action: 'on'}},
    'open': { method: 'POST' , params: { action: 'open'}},
    'close': { method: 'POST' , params: { action: 'close'}},
    'set_level': { method: 'POST' , params: { action: 'set_level'}},
    'set_mode': { method: 'POST' , params: { action: 'set_mode'}},
    'set_humidity': { method: 'POST' , params: { action: 'set_humidity'}},
    'set_point': { method: 'POST' , params: { action: 'set_point'}},
    'status': { method: 'POST' , params: { action: 'status'}},
    'play': { method: 'POST' , params: { action: 'play'}},
  });

  var test = model.get({'id': 'Living Room'});
  test.$promise.then(function (out) {
    console.dir(out);
    console.dir(out.$lights_on());
  });
  var loadRooms = function () {
    var defer = $q.defer();

    $http.get('api/rooms').then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var addRoom = function (config) {
    var defer = $q.defer();

    $http.post('/api/rooms', config).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var getRoom = function (room) {
    var defer = $q.defer();

    $http({ url: '/api/rooms/' + room }).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var getRoomScenes = function (room) {
    var defer = $q.defer();

    $http({ url: '/api/rooms/' + room + '/scenes'}).then(function (response) {

      response.data.forEach(function (scene) {
        if (scene._on === true) {
          scene.age = new Date() - new Date(scene.last_on);
        } else {
          scene.age = new Date() - new Date(scene.last_off);
        }

        if (!isNaN(scene.age)) {
          scene.age = scene.age / 1000;
        } else {
          scene.age = 0;
        }
      });

      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var getRoomDevices = function (room) {
    var defer = $q.defer();

    $http({ url: '/api/rooms/' + room + '/devices'}).then(function (response) {

      response.data.forEach(function (device) {
        if (device._on === true) {
          device.age = new Date() - new Date(device.last_on);
        } else {
          device.age = new Date() - new Date(device.last_off);
        }

        if (!isNaN(device.age)) {
          device.age = device.age / 1000;
        } else {
          device.age = 0;
        }
      });

      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var viewRoom = function (room) {

    return $uibModal.open({
      animation: true,
      templateUrl: 'views/rooms/rooms.view.html',
      size: 'lg',
      controller: function ($scope, $uibModalInstance, $interval, $timeout, $state, rooms, room, devices) {
        var intervals = [];

        $scope.name = room.name;
        $scope.room = room;
        $scope.devices = [];
        $scope.scenes = [];
        $scope.open = devices.openDevice;
        $scope.filter_counts = {};
        $scope.on_counts = {};
        $scope.room_temperature = '?';

        $scope.filter = function (filter) {
          $scope.filter_condition = (filter !== $scope.filter_condition) ? filter : '';
        }

        $scope.check_filter = function (device) {
          if ($scope.filter_condition === '') {
            return true;
          }
          return device.capabilities.indexOf($scope.filter_condition) !== -1;
        };

        $scope.devices_on = function (c) {
          var devs = $scope.devices.filter(function (d) {
            return (d._on === true && d.capabilities.indexOf(c) !== 0);
          });

          return (devs.length > 0);
        };

        $scope.open = function (device) {
          var modal = devices.openDevice(device);
          modal.result.then(function(config) {
            if (config.recurse) {
              $uibModalInstance.close(config);
            }
          });
        };

        $scope.ok = function () {
          $uibModalInstance.close();
        };

        $scope.edit = function () {
          $uibModalInstance.close({'recurse': true});
          $state.go('index.rooms.edit', {'name': room.name});
        };


        $scope.default_filter = function () {
          var filters = [
            'light',
            'motion_sensor',
            'window',
            'door',
            'conditioner'
          ];

          var temp = 0;
          var temp_count = 0;

          var temps = $scope.devices.filter(function (d) {
            if (d.capabilities.indexOf('temperature_sensor') !== -1) {
              if (d._temperature > 0) {
                temp += d._temperature ;
                temp_count += 1;
              }
              return true;
            }
            return false;
          });

          console.log(temp);
          $scope.room_temperature = parseInt(temp / temp_count, 10);

          filters.forEach(function (f) {


            var match = $scope.devices.filter(function (d) {
              return (d.capabilities.indexOf(f) !== -1);
            });

            $scope.filter_counts[f] = match.length;
            $scope.on_counts[f] = match.filter(function (d) {return d._on}).length;

            if ($scope.filter_condition !== undefined) return;

            if (match.length > 0) {
              $scope.filter_condition = f;
            }
          });

          if ($scope.filter_condition !== undefined) return;
          if ($scope.scenes.length > 0) {
            $scope.filter_condition = 'scenes';
          }
        }

        $scope.reload = function () {

          $scope.processing = true;
          $scope.errors = false;

          $http.get('/api/rooms/' + $scope.room.name).then(function (response) {



            $scope.room = response.data;
            getRoomScenes(room.name).then(function (scenes) {
              $scope.scenes = scenes;
              $scope.processing = false;
              $scope.errors = false;
              $scope.filter_counts.scenes = $scope.scenes.length;
              $scope.on_counts.scenes = $scope.scenes.filter(function (d) { return d._on});
            }, function () {
              $scope.processing = false;
              $scope.errors = true;
            });

            getRoomDevices(room.name).then(function (devices) {
              $scope.devices = devices;
              $scope.processing = false;
              $scope.errors = false;
              $scope.default_filter();

            }, function () {
              $scope.processing = false;
              $scope.errors = true;
            });
          }, function () {
            $scope.processing = false;
            $scope.errors = true;
          });

        };

        $scope.has_capability = function (device, cap) {
          var has = false;
          if (!(cap instanceof Array)) {
            cap = [cap];
          }

          cap.forEach(function (c) {
            has = (device.capabilities.indexOf(c) !== -1) ? true : has;
          });

          return has;
        };

        $scope.device_state = function (device, key, match, cap) {
          if (cap) {
            return (device[key] === match && $scope.has_capability(device, cap));
          } else {
            return (device[key] === match);
          }
        };

        $scope.reload();

        intervals.push($interval($scope.reload, 5000));

        $scope.$on('$destroy', function () {
          intervals.forEach($interval.cancel);
        });
      },
      resolve: {
        room: function () {
          return getRoom(room);
        }
      }
    });

  };

  var addRoomDevice = function (room, device) {
    var defer = $q.defer();

    $http.post('/api/rooms/' + room + '/devices', {'name': device}).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var removeRoomDevice = function (room, device) {
    var defer = $q.defer();

    $http.delete('/api/rooms/' + room + '/devices/' + device).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var saveRoom = function (room) {
    var defer = $q.defer();

    $http.put('/api/rooms/' + room._id, room).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var removeRoom = function (room) {
    var defer = $q.defer();

    $http.delete('/api/rooms/' + room).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  return {
    'load': loadRooms,
    'add': addRoom,
    'view': viewRoom,
    'get': getRoom,
    'save': saveRoom,
    'remove': removeRoom,
    'getDevices': getRoomDevices,
    'addDevice': addRoomDevice,
    'removeDevice': removeRoomDevice
  };
})
.controller('roomsList', function ($scope, $state, rooms) {
  $scope.rooms = [];
  $scope.loading = true;

  $scope.view = function (room) {
    rooms.view(room.name);
  };

  $scope.edit = function (room) {
    $state.go('index.rooms.edit', {'name': room.name});
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
.controller('roomsAdd', function ($scope, $state, rooms) {
  $scope.room = {};
  $scope.alerts = [];

  $scope.back = function () {
    $state.go('index.rooms');
  };

  $scope.closeAlert = function(index) {
    $scope.alerts.splice(index, 1);
  };

  $scope.add = function () {
    rooms.add($scope.room).then(function () {
      $scope.alerts = [{'type': 'success', 'msg': 'Room Added'}];
      $scope.room = {};
    }, function (err) {
      $scope.alerts = [{'type': 'danger', 'msg': 'Failed to add Room'}];
      $scope.errors = err;
    });
  };
})
.controller('roomsEdit', function ($scope, $state, $uibModal, rooms, room, confirm) {
  $scope.room = room;
  $scope.alerts = [];
  $scope.devices = [];
  $scope.loading = false;

  if (!room) {
    $state.go('index.rooms.list');
  }

  var getDevices = function () {
    $scope.loading = true;
    rooms.getDevices(room.name).then(function(devices) {
      $scope.devices = devices;
      $scope.loading = false;
    }, function () {
      $scope.loading = false;
    });
  };

  getDevices();

  $scope.back = function () {
    $state.go('index.rooms');
  };

  $scope.closeAlert = function(index) {
    $scope.alerts.splice(index, 1);
  };

  $scope.save = function () {
    rooms.save($scope.room).then(function () {
      $scope.alerts = [{'type': 'success', 'msg': 'Room Saved'}];
    }, function (err) {
      $scope.alerts = [{'type': 'danger', 'msg': 'Failed to save Room'}];
      $scope.errors = err;
    });
  };

  $scope.remove = function () {
    confirm('Are you sure you want to remove this Room?').then(function () {
      rooms.remove(room._id).then(function () {
        $state.go('index.rooms');
      }, function (err) {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to remove Room'}];
        $scope.errors = err;
      });
    });
  };

  $scope.removeDevice = function (id) {

    confirm('Are you sure?').then(function () {
      rooms.removeDevice(room.name, id).then(function () {
        getDevices();
        $scope.alerts = [{'type': 'success', 'msg': 'Device removed from Room'}];
      }, function () {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to remove Device from Room'}];
      });
    });

  };

  $scope.addDevice = function () {
    var assign = $uibModal.open({
      animation: true,
      templateUrl: 'views/rooms/assign.html',
      size: 'sm',
      resolve: {
        assigned: function () {
          return $scope.devices.map(function (obj) {return obj.name; });
        }
      },
      controller: function ($scope, $uibModalInstance, devices, assigned) {
        $scope.loading = true;
        $scope.devices = [];
        $scope.assigned = assigned;

        $scope.cancel = function () {
          $uibModalInstance.dismiss();
        };

        $scope.select = function (device) {
          $uibModalInstance.close(device);
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

      }
    });

    assign.result.then(function (device) {

      rooms.addDevice(room.name, device.name).then(function () {
        getDevices();
        $scope.alerts = [{'type': 'success', 'msg': 'Device added to Room'}];
      }, function () {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to add Device to Room'}];
      });

    });
  };

})
.controller('room', function () {

});
