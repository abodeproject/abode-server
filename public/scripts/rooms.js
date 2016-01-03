'use strict';

angular.module('rooms', ['ui.router'])
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
.service('rooms', function ($http, $q, $uibModal) {
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

  var getRoomDevices = function (room) {
    var defer = $q.defer();

    $http({ url: '/api/rooms/' + room + '/devices'}).then(function (response) {
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
      controller: function ($scope, $uibModalInstance, $interval, $timeout, $state, rooms, room) {
        var intervals = [];


        $scope.name = room.name;
        $scope.room = room;

        $scope.ok = function () {
          $uibModalInstance.close();
        };

        $scope.edit = function () {
          $uibModalInstance.close();
          $state.go('index.rooms.edit', {'name': room.name});
        };

        $scope.reload = function () {

          $scope.processing = true;
          $scope.errors = false;

          $http.get('/api/rooms/' + $scope.room.name).then(function (response) {
            $scope.room = response.data;
            $scope.processing = false;
            $scope.errors = false;
          }, function () {
            $scope.processing = false;
            $scope.errors = true;
          });

        };

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
      controller: function ($scope, $uibModalInstance, devices) {
        $scope.loading = true;
        $scope.devices = [];

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
