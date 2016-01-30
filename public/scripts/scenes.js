'use strict';

angular.module('scenes', ['ui.router','ngResource'])
.config(function($stateProvider, $urlRouterProvider) {

  $urlRouterProvider.when('/scenes', '/scenes/list');

  $stateProvider
  .state('index.scenes', {
    url: '/scenes',
    templateUrl: '/views/scenes/scenes.html',
  })
  .state('index.scenes.list', {
    url: '/list',
    templateUrl: '/views/scenes/scenes.list.html',
    controller: 'scenesList'
  })
  .state('index.scenes.add', {
    url: '/add',
    templateUrl: '/views/scenes/scenes.add.html',
    controller: 'scenesAdd'
  })
  .state('index.scenes.edit', {
    url: '/:name',
    templateUrl: '/views/scenes/scenes.edit.html',
    controller: 'scenesEdit',
    resolve: {
      'scene': function ($stateParams, $state, $q, scenes) {
        var defer = $q.defer();

        scenes.get($stateParams.name).then(function (response) {
          defer.resolve(response);
        }, function (err) {
          defer.reject(err);
          $state.go('index.scenes');
        });

        return defer.promise;

      }
    }
  });
})
.service('scenes', function ($http, $q, $uibModal, $resource) {
  var model = $resource('/api/scenes/:id/:action', {id: '@_id'}, {
    'update': { method: 'PUT' },
  });

  var loadScenes = function () {
    var defer = $q.defer();

    $http.get('api/scenes').then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var addScene = function (config) {
    var defer = $q.defer();

    $http.post('/api/scenes', config).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var getScene = function (scene) {
    var defer = $q.defer();

    $http({ url: '/api/scenes/' + scene }).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var getSceneRooms = function (scene) {
    var defer = $q.defer();

    $http({ url: '/api/scenes/' + scene + '/rooms'}).then(function (response) {

      defer.resolve(response.data);

    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var viewScene = function (scene) {

    return $uibModal.open({
      animation: true,
      templateUrl: 'views/scenes/scenes.view.html',
      size: 'sm',
      controller: function ($scope, $uibModalInstance, $interval, $timeout, $state, scenes, scene) {
        var intervals = [];

        $scope.name = scene.name;
        $scope.scene = scene;
        $scope.processing = false;
        $scope.errors = false;

        $scope.ok = function () {
          $uibModalInstance.close();
        };

        $scope.edit = function () {
          $uibModalInstance.close({'recurse': true});
          $state.go('index.scenes.edit', {'name': scene.name});
        };

        $scope.toggle_onoff = function () {
          var action = 'off';
          if ($scope.scene._state === 'stopped') {
            action = 'on';
          }

          $http.post('/api/scenes/' + $scope.scene.name + '/' + action).then(function () {
            $scope.processing = false;
            $scope.errors = false;
            $scope.scene._state = 'pending';

          }, function () {
            $scope.processing = false;
            $scope.errors = true;
          });
        };

        $scope.reload = function () {
          if ($scope.processing) {
            return;
          }
          $scope.processing = true;
          $scope.errors = false;

          $http.get('/api/scenes/' + $scope.scene.name).then(function (response) {
            $scope.processing = false;
            $scope.errors = false;
            $scope.scene = response.data;

          }, function () {
            $scope.processing = false;
            $scope.errors = true;
          });

        };

        $scope.reload();

        intervals.push($interval($scope.reload, 5000));

        $scope.$on('$destroy', function () {
          intervals.forEach($interval.cancel);
        });
      },
      resolve: {
        scene: function () {
          return getScene(scene);
        }
      }
    });

  };

  var addSceneRoom = function (scene, room) {
    var defer = $q.defer();

    $http.post('/api/scenes/' + scene + '/rooms', {'name': room}).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var removeSceneRoom = function (scene, room) {
    var defer = $q.defer();

    $http.delete('/api/scenes/' + scene + '/rooms/' + room).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var saveScene = function (scene) {
    var defer = $q.defer();

    $http.put('/api/scenes/' + scene._id, scene).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var removeScene = function (scene) {
    var defer = $q.defer();

    $http.delete('/api/scenes/' + scene).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  return {
    'load': loadScenes,
    'add': addScene,
    'view': viewScene,
    'get': getScene,
    'save': saveScene,
    'remove': removeScene,
    'getRooms': getSceneRooms,
    'addRoom': addSceneRoom,
    'removeRoom': removeSceneRoom
  };
})
.controller('scenesList', function ($scope, $state, scenes) {
  $scope.scenes = [];
  $scope.loading = true;

  $scope.view = function (scene) {
    scenes.view(scene.name);
  };

  $scope.edit = function (scene) {
    $state.go('index.scenes.edit', {'name': scene.name});
  };

  $scope.load = function () {
    scenes.load().then(function (scenes) {
      $scope.scenes = scenes;
      $scope.loading = false;
      $scope.error = false;
    }, function () {
      $scope.loading = false;
      $scope.error = true;
    });
  };



  $scope.load();
})
.controller('scenesAdd', function ($scope, $state, scenes) {
  $scope.scene = {};
  $scope.alerts = [];

  $scope.back = function () {
    $state.go('index.scenes');
  };

  $scope.closeAlert = function(index) {
    $scope.alerts.splice(index, 1);
  };

  $scope.add = function () {
    scenes.add($scope.scene).then(function () {
      $scope.alerts = [{'type': 'success', 'msg': 'Scene Added'}];
      $scope.scene = {};
    }, function (err) {
      $scope.alerts = [{'type': 'danger', 'msg': 'Failed to add Scene'}];
      $scope.errors = err;
    });
  };
})
.controller('scenesEdit', function ($scope, $state, $uibModal, scenes, scene, confirm) {
  $scope.scene = scene;
  $scope.alerts = [];
  $scope.rooms = [];
  $scope.loading = false;

  if (!scene) {
    $state.go('index.scenes.list');
  }

  var getRooms = function () {
    $scope.loading = true;
    scenes.getRooms(scene.name).then(function(rooms) {
      $scope.rooms = rooms;
      $scope.loading = false;
    }, function () {
      $scope.loading = false;
    });
  };

  getRooms();

  $scope.back = function () {
    $state.go('index.scenes');
  };

  $scope.closeAlert = function(index) {
    $scope.alerts.splice(index, 1);
  };

  $scope.addStep = function () {
    $scope.scene._steps.push({
      'devices': [],
      'delay': 0,
      'wait': false,
    });
  };

  $scope.removeDevice = function(step, index) {
    step.devices.splice(index, 1);
  };

  $scope.editDevice = function (device) {var assign = $uibModal.open({
      animation: true,
      templateUrl: 'views/scenes/edit.device.html',
      size: 'sm',
      resolve: {
        selected: function () {
          return device;
        },
        device: function (devices) {
          return devices.get(device.device_id);
        }
      },
      controller: function ($scope, $uibModalInstance, devices, device, selected) {
        $scope.loading = true;
        $scope.device = device;
        $scope.selected = selected;


        $scope.capabilities = angular.copy(device.capabilities).map(function (c) {
          return {
            'name': c,
            'view': 'views/devices/capabilities/' + c + '.html'
          };

        });

        $scope.controls = $scope.capabilities.filter(function (c) {

          return (c.name.indexOf('_sensor') === -1);

        });

        $scope.cancel = function () {
          $uibModalInstance.dismiss();
        };

        $scope.add = function () {
          $scope.selected.name = $scope.device.name;
          $scope.selected.device_id = $scope.device._id;

          if ($scope.has_capability('fan')) {
            $scope.selected._on = $scope.device._on;
          }
          if ($scope.has_capability('display')) {
            $scope.selected._on = $scope.device._on;
            $scope.selected._level = $scope.device._level;
          }
          if ($scope.has_capability('light') && $scope.has_capability('dimmer')) {
            $scope.selected._on = $scope.device._on;
            $scope.selected._level = $scope.device._level;
          }
          if ($scope.has_capability('light') && !$scope.has_capability('dimmer')) {
            $scope.selected._on = $scope.device._on;
          }
          if ($scope.has_capability('conditioner')) {
            $scope.selected._mode = $scope.device._mode;
            $scope.selected._set_point = $scope.device._set_point;
          }

          $uibModalInstance.close($scope.selected);
        };

        $scope.has_capability = function (capability) {
          var match = $scope.capabilities.filter(function (c) {

            return (c.name === capability);

          });

          return (match.length > 0);
        };



        $scope.stages_up = function () {
          if (isNaN($scope.selected.stages)) {
            $scope.selected.stages = 0;
          }
          if ($scope.selected.stages < 100){
            $scope.selected.stages += 1;
          }

        };

        $scope.stages_down = function () {
          if (isNaN($scope.selected.stages)) {
            $scope.selected.stages = 0;
          }
          if ($scope.selected.stages > 0){
            $scope.selected.stages -= 1;
          }
        };


        $scope.toggle_onoff = function () {

          $scope.processing = true;
          $scope.errors = false;

          if ($scope.device._on) {
            $scope.device._on = false;
            $scope.device._level = 0;
          } else {
            $scope.device._on = true;
            $scope.device._level = 100;
          }
        };

        $scope.level_up = function () {
          if (isNaN($scope.device._level)) {
            $scope.device._level = 0;
          }
          if ($scope.device._level < 100){
            $scope.device._level += 1;
          }
          $scope.device._on = true;

        };

        $scope.level_down = function () {
          if (isNaN($scope.device._level)) {
            $scope.device._level = 0;
          }
          if ($scope.device._level > 0){
            $scope.device._level -= 1;
          }

          if ($scope.device._level === 0){
            $scope.device._on = false;
          }
        };

        $scope.set_mode = function (mode) {
          if (isNaN($scope.device._set_point)) {
            $scope.device._set_point = 58;
          }
          $scope.device._mode = mode;
        };

        $scope.temp_up = function () {
          if (isNaN($scope.device._set_point)) {
            $scope.device._set_point = 58;
          }
          $scope.device._set_point += 1;
        };

        $scope.temp_down = function () {
          if (isNaN($scope.device._set_point)) {
            $scope.device._set_point = 58;
          }
          $scope.device._set_point -= 1;
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

    assign.result.then(function (result) {
      device = result;

    });
  };

  $scope.addDevice = function (step) {
    var assign = $uibModal.open({
      animation: true,
      templateUrl: 'views/scenes/add.device.html',
      size: 'sm',
      resolve: {
        assigned: function () {

          return step.devices.map(function (obj) {return obj.name; });
        }
      },
      controller: function ($scope, $uibModalInstance, devices, assigned) {
        $scope.loading = true;
        $scope.devices = [];
        $scope.assigned = assigned;
        $scope.selected = {};


        $scope.cancel = function () {
          $uibModalInstance.dismiss();
        };

        $scope.selectDevice = function (device) {
          $scope.selected = {
            'stages': 0,
            'duration': 0
          };
          $scope.loading = true;

          devices.get(device.name).then(function(device) {
            $scope.loading = false;
            $scope.device = device;

            $scope.capabilities = angular.copy(device.capabilities).map(function (c) {
              return {
                'name': c,
                'view': 'views/devices/capabilities/' + c + '.html'
              };

            });

            $scope.controls = $scope.capabilities.filter(function (c) {

              return (c.name.indexOf('_sensor') === -1);

            });

          });

        };

        $scope.add = function () {
          $scope.selected.name = $scope.device.name;
          $scope.selected.device_id = $scope.device._id;

          if ($scope.has_capability('fan')) {
            $scope.selected._on = $scope.device._on;
          }
          if ($scope.has_capability('display')) {
            $scope.selected._on = $scope.device._on;
            $scope.selected._level = $scope.device._level;
          }
          if ($scope.has_capability('light') && $scope.has_capability('dimmer')) {
            $scope.selected._on = $scope.device._on;
            $scope.selected._level = $scope.device._level;
          }
          if ($scope.has_capability('light') && !$scope.has_capability('dimmer')) {
            $scope.selected._on = $scope.device._on;
          }
          if ($scope.has_capability('conditioner')) {
            $scope.selected._mode = $scope.device._mode;
            $scope.selected._set_point = $scope.device._set_point;
          }

          $uibModalInstance.close($scope.selected);
        };

        $scope.has_capability = function (capability) {
          var match = $scope.capabilities.filter(function (c) {

            return (c.name === capability);

          });

          return (match.length > 0);
        };



        $scope.stages_up = function () {
          if (isNaN($scope.selected.stages)) {
            $scope.selected.stages = 0;
          }
          if ($scope.selected.stages < 100){
            $scope.selected.stages += 1;
          }

        };

        $scope.stages_down = function () {
          if (isNaN($scope.selected.stages)) {
            $scope.selected.stages = 0;
          }
          if ($scope.selected.stages > 0){
            $scope.selected.stages -= 1;
          }
        };


        $scope.toggle_onoff = function () {

          $scope.processing = true;
          $scope.errors = false;

          if ($scope.device._on) {
            $scope.device._on = false;
            $scope.device._level = 0;
          } else {
            $scope.device._on = true;
            $scope.device._level = 100;
          }
        };

        $scope.level_up = function () {
          if (isNaN($scope.device._level)) {
            $scope.device._level = 0;
          }
          if ($scope.device._level < 100){
            $scope.device._level += 1;
          }
          $scope.device._on = true;

        };

        $scope.level_down = function () {
          if (isNaN($scope.device._level)) {
            $scope.device._level = 0;
          }
          if ($scope.device._level > 0){
            $scope.device._level -= 1;
          }

          if ($scope.device._level === 0){
            $scope.device._on = false;
          }
        };

        $scope.set_mode = function (mode) {
          if (isNaN($scope.device._set_point)) {
            $scope.device._set_point = 58;
          }
          $scope.device._mode = mode;
        };

        $scope.temp_up = function () {
          if (isNaN($scope.device._set_point)) {
            $scope.device._set_point = 58;
          }
          $scope.device._set_point += 1;
        };

        $scope.temp_down = function () {
          if (isNaN($scope.device._set_point)) {
            $scope.device._set_point = 58;
          }
          $scope.device._set_point -= 1;
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
      step.devices.push(device);

    });
  };

  $scope.removeStep = function (index) {
    $scope.scene._steps.splice(index, 1);
  };

  $scope.save = function () {
    scenes.save($scope.scene).then(function () {
      $scope.alerts = [{'type': 'success', 'msg': 'Scene Saved'}];
    }, function (err) {
      $scope.alerts = [{'type': 'danger', 'msg': 'Failed to save Scene'}];
      $scope.errors = err;
    });
  };

  $scope.remove = function () {
    confirm('Are you sure you want to remove this Scene?').then(function () {
      scenes.remove(scene._id).then(function () {
        $state.go('index.scenes');
      }, function (err) {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to remove Scene'}];
        $scope.errors = err;
      });
    });
  };

  $scope.removeRoom = function (id) {

    confirm('Are you sure?').then(function () {
      scenes.removeRoom(scene.name, id).then(function () {
        getRooms();
        $scope.alerts = [{'type': 'success', 'msg': 'Room removed from Scene'}];
      }, function () {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to remove Room from Scene'}];
      });
    });

  };

  $scope.addRoom = function () {
    var assign = $uibModal.open({
      animation: true,
      templateUrl: 'views/scenes/assign.html',
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

      scenes.addRoom(scene.name, room.name).then(function () {
        getRooms();
        $scope.alerts = [{'type': 'success', 'msg': 'Room added to Scene'}];
      }, function () {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to add Room to Scene'}];
      });

    });
  };

})
.controller('scene', function () {

});