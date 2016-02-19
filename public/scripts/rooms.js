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

  var getRoom = function (room, source) {
    var defer = $q.defer();
    var source_uri = (source === undefined) ? '/api' : '/api/sources/' + source;

    $http({ url: source_uri + '/rooms/' + room }).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var getRoomScenes = function (room, source) {
    var defer = $q.defer();
    var source_uri = (source === undefined) ? '/api' : '/api/sources/' + source;

    $http({ url: source_uri + '/rooms/' + room + '/scenes'}).then(function (response) {

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

  var getRoomDevices = function (room, source) {
    var defer = $q.defer();
    var source_uri = (source === undefined) ? '/api' : '/api/sources/' + source;

    $http({ url: source_uri + '/rooms/' + room + '/devices'}).then(function (response) {

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

  var viewRoom = function (room, source) {

    return $uibModal.open({
      animation: true,
      templateUrl: 'views/rooms/rooms.view.html',
      size: 'lg',
      controller: function ($scope, $uibModalInstance, $interval, $timeout, $state, rooms, room, devices, scenes, source) {
        var intervals = [];
        var source_uri = (source === undefined) ? '/api' : '/api/sources/' + source;

        $scope.name = room.name;
        $scope.room = room;
        $scope.devices = [];
        $scope.scenes = [];
        $scope.cameras = [];
        $scope.open = devices.openDevice;
        $scope.filter_counts = {};
        $scope.on_counts = {};
        $scope.room_temperature = '?';
        $scope.source = source;

        var filters = {
          'light': ['light'],
          'motion_sensor': ['motion_sensor'],
          'window': ['window'],
          'door': ['door'],
          'temperature_sensor': ['conditioner', 'temperature_sensor', 'fan', 'humidity_sensor'],
        };


        $scope.filter = function (filter) {
          $scope.filter_condition = (filter !== $scope.filter_condition) ? filter : '';
        }

        $scope.check_filter = function (device) {

          if ($scope.filter_condition === '' || $scope.filter_condition === undefined) {
            return true;
          }

          return $scope.has_capability(device, filters[$scope.filter_condition]);
        };

        $scope.devices_on = function (c) {
          var devs = $scope.devices.filter(function (d) {
            return (d._on === true && d.capabilities.indexOf(c) !== 0);
          });

          return (devs.length > 0);
        };

        $scope.openScene = function (scene) {
          var modal = scenes.view(scene._id, source);
          modal.result.then(function(config) {
            if (config && config.recurse) {
              $uibModalInstance.close(config);
            }
          });
        };

        $scope.open = function (device) {
          var modal = devices.openDevice(device, source);
          modal.result.then(function(config) {
            if (config && config.recurse) {
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

          $scope.cameras = $scope.devices.filter(function (d) { return d.capabilities.indexOf('camera') !== -1});

          $scope.room_temperature = parseInt(temp / temp_count, 10) || ' ';

          Object.keys(filters).forEach(function (f) {


            var match = $scope.devices.filter(function (d) {
              return $scope.has_capability(d, filters[f]);
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

          $http.get(source_uri + '/rooms/' + $scope.room.name).then(function (response) {



            $scope.room = response.data;
            getRoomScenes(room.name, source).then(function (scenes) {
              $scope.scenes = scenes;
              $scope.processing = false;
              $scope.errors = false;
              $scope.filter_counts.scenes = $scope.scenes.length;
              $scope.on_counts.scenes = $scope.scenes.filter(function (d) { return d._on});
            }, function () {
              $scope.processing = false;
              $scope.errors = true;
            });

            getRoomDevices(room.name, source).then(function (devices) {
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
          return getRoom(room, source);
        },
        source: function () {
          return source;
        }
      },
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
    'removeDevice': removeRoomDevice,
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
.controller('roomsAdd', function ($scope, $state, notifier, rooms) {
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
      notifier.notify({'status': 'success', 'message': 'Room Added'});
      $scope.room = {};
    }, function (err) {
      notifier.notify({'status': 'failed', 'message': 'Failed to add Room', 'details': err});
      $scope.errors = err;
    });
  };
})
.controller('roomsEdit', function ($scope, $state, $uibModal, notifier, rooms, room, confirm) {
  $scope.room = room;
  $scope.alerts = [];
  $scope.devices = [];
  $scope.loading = false;
  $scope.section = 'general';

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
      notifier.notify({'status': 'success', 'message': 'Room Saved'});
    }, function (err) {
      notifier.notify({'status': 'failed', 'message': 'Failed to save Room', 'details': err});
      $scope.errors = err;
    });
  };

  $scope.remove = function () {
    confirm('Are you sure you want to remove this Room?').then(function () {
      rooms.remove(room._id).then(function () {
        notifier.notify({'status': 'success', 'message': 'Room Removed'});
        $state.go('index.rooms');
      }, function (err) {
        notifier.notify({'status': 'failed', 'message': 'Failed to remove Room', 'details': err});
        $scope.errors = err;
      });
    });
  };

  $scope.removeDevice = function (id) {

    confirm('Are you sure?').then(function () {
      rooms.removeDevice(room.name, id).then(function () {
        getDevices();
        notifier.notify({'status': 'success', 'message': 'Device removed from Room'});
      }, function (err) {
        notifier.notify({'status': 'failed', 'message': 'Failed to remove Device from Room', 'details': err});
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
        notifier.notify({'status': 'success', 'message': 'Device added to Room'});
      }, function () {
        notifier.notify({'status': 'failed', 'message': 'Failed to add Device to Room', 'details': err});
      });

    });
  };

})
.controller('room', function () {

})
.directive('roomCameras', function () {

  return {
    restrict: 'E',
    transclude: true,
    replace: true,
    scope: {
      'devices': '=',
      'source': '=',
    },
    templateUrl: 'views/rooms/rooms.cameras.html',
    controller: function ($scope, devices) {
      var source_uri = ($scope.source === undefined) ? '/api' : '/api/sources/' + $scope.source;
      var random = new Date();

      $scope.devices = $scope.devices || [];
      $scope.cameras = [];
      $scope.index = 0;


      var parseDevices = function () {
        var cameras = [];
        $scope.devices.forEach(function (device) {
          if (device.config.image_url) {
            var camera = {
              '_id': device._id,
              'name': device.name,
              'image': source_uri + '/devices/' + device._id + '/image?' + random.getTime()
            };

            if (device.config.video_url) {
              camera.video = source_uri + '/devices/' + device._id + '/video?live=true';
            }

            cameras.push(camera);
          }
        });

        $scope.cameras = cameras;
      };

      $scope.next = function () {
        if ($scope.index >= $scope.cameras.length - 1) {
          $scope.index = 0;
        } else {
          $scope.index += 1;
        }
      }
      $scope.previous = function () {
        if ($scope.index == 0) {
          $scope.index = $scope.cameras.length - 1;
        } else {
          $scope.index -= 1;
        }
      }

      $scope.reload = function (index) {
        random = new Date();
        var device = $scope.devices.filter(function (d) {return d._id === $scope.cameras[$scope.index]._id });

        if (device[0]) {
          $scope.cameras[$scope.index].image = source_uri + '/devices/' + device[0]._id + '/image?live=true&' + random.getTime()
        }
      };


      $scope.play = function () {
        var camera = $scope.cameras[$scope.index];
        var device = $scope.devices.filter(function (dev) {return dev._id === camera._id});

        devices.openCamera(device[0], $scope.source);
      }

      $scope.$watch('devices', function () {
        if ($scope.cameras.length !== 0 ) { return; }
        parseDevices()
      });

    }
  }
})
.directive('roomIcon', function () {

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
      'room': '@',
      'icon': '@',
      'tempType': '@',
      'interval': '@',
      'source': '@',
    },
    templateUrl: 'views/rooms/room.icon.html',
    controller: function ($scope, $interval, $timeout, rooms) {
      var roomTimeout,
        cycle_timeout,
        temp_maps = {},
        intervals = [],
        temp_index = -1;

      $scope.loading = false;
      $scope.devices = [];
      $scope.styles =  {};
      $scope.state = {
        'is_heat': false,
        'is_cool': false,
        'is_fan': false,
        'is_openclose': false,
        'is_light': false,
        'is_motion': false,
        'loading': false,
        'error': false,
      };
      $scope.temperature = '?';
      $scope.temperatures = [];
      $scope.interval = $scope.interval || 10;

      if ($scope.left !== undefined || $scope.right !== undefined || $scope.top !== undefined || $scope.bottom !== undefined) {
        $scope.styles.position = 'absolute;'
      }
      if ($scope.left) { $scope.styles.left = $scope.left + 'em'; }
      if ($scope.right) { $scope.styles.right = $scope.right + 'em'; }
      if ($scope.top) { $scope.styles.top = $scope.top + 'em'; }
      if ($scope.bottom) { $scope.styles.bottom = $scope.bottom + 'em'; }

      if ($scope.width) { $scope.styles.width = $scope.width + 'em'; }
      if ($scope.height) { $scope.styles.height = $scope.height + 'em'; }
      if ($scope.align) { $scope.styles['text-align'] = $scope.align; }
      if ($scope.size) { $scope.styles['font-size'] = $scope.size + 'em'; }

      if ($scope.icon) { $scope.show_icon = true}

      $scope.view = function () {
        rooms.view($scope.room, $scope.source);
      };

      temp_maps.cycle = function () {
        if (cycle_timeout !== undefined) {
          return;
        }

        var next = function () {
          temp_index += 1;
          if ($scope.temperatures.length <= temp_index) { temp_index = 0; }

          $scope.temperature = parseInt($scope.temperatures[temp_index], 10);
        }

        next();
        cycle_timeout = $interval(next, 4000);
      };

      temp_maps.average = function () {
        var total = $scope.temperatures.length;
        var sum = 0;

        $scope.temperatures.forEach(function (t) { sum += t; });

        $scope.temperature = parseInt(sum / total, 10);
      };

      temp_maps.high = function () {
        var high = 0;

        $scope.temperatures.forEach(function (temp) {
          if (temp > high) { high = temp; }
        });

        $scope.temperature = parseInt(high, 10);
      };

      temp_maps.low = function () {
        var low = 1000;

        $scope.temperatures.forEach(function (temp) {
          if (temp < low) { low = temp; }
        });

        $scope.temperature = parseInt(low, 10);
      };

      var check_state = function (capability, key, value) {
        var is_state = $scope.devices.filter(function (dev) {
          return (dev.capabilities.indexOf(capability) !== -1 && dev[key] === value);
        });

        return is_state.length;
      };

      var get_temps = function () {
        var temps = $scope.devices.filter(function (dev) {
          return (dev.capabilities.indexOf('temperature_sensor') !== -1);
        });

        temps = temps.map(function (d) {
          return d._temperature || 0;
        });

        return temps;
      }

      var getRoom = function () {
        $scope.state.loading = true;
        rooms.getDevices($scope.room, $scope.source).then(function (devices) {
          $scope.devices = devices;
          $scope.state.is_light = check_state('light', '_on', true);
          $scope.state.is_motion = check_state('motion_sensor', '_on', true);
          $scope.state.is_fan = check_state('fan', '_on', true);
          $scope.state.is_heat = check_state('conditioner', '_mode', 'HEAT');
          $scope.state.is_cool = check_state('conditioner', '_mode', 'COOL');
          $scope.state.is_openclose = check_state('openclose', '_on', true);

          if (temp_maps[$scope.tempType]) {
            $scope.temperatures = get_temps();
            temp_maps[$scope.tempType]();
          }

          $scope.state.loading = false;
          $scope.state.error = false;

          roomTimeout = $timeout(getRoom, 1000 * $scope.interval);
        }, function () {
          $scope.state.loading = false;
          $scope.state.error = true;
          roomTimeout = $timeout(getRoom, 1000 * $scope.interval);
        });
      };

      getRoom();

      $scope.$on('$destroy', function () {
        $timeout.cancel(roomTimeout);
        $interval.cancel(cycle_timeout);
        intervals.forEach($interval.cancel);
      });

    },
    replace: true,
  };

});
