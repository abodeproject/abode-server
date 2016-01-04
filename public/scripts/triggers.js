'use strict';

angular.module('triggers', ['ui.router'])
.config(function($stateProvider, $urlRouterProvider) {
  $urlRouterProvider.when('/triggers', '/triggers/list');

  $stateProvider
  .state('index.triggers', {
    url: '/triggers',
    templateUrl: '/views/triggers/triggers.html',
  })
  .state('index.triggers.list', {
    url: '/list',
    templateUrl: '/views/triggers/triggers.list.html',
    controller: 'triggersList'
  })
  .state('index.triggers.add', {
    url: '/add',
    templateUrl: '/views/triggers/triggers.add.html',
    controller: 'triggersAdd'
  })
  .state('index.triggers.edit', {
    url: '/:name',
    templateUrl: '/views/triggers/triggers.edit.html',
    controller: 'triggersEdit',
    resolve: {
      'trigger': function ($stateParams, $state, triggers) {

        return triggers.get($stateParams.name);

      },
      'types': function (triggers) {

        return triggers.types();

      }
    }
  });
})
.service('triggers', function ($http, $q, $uibModal, confirm, devices, rooms) {
  var load = function () {
    var defer = $q.defer();

    $http.get('api/triggers').then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var getTypes = function () {
    var defer = $q.defer();

    $http.get('api/abode/triggers').then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var addTrigger = function (config) {
    var defer = $q.defer();

    $http.post('/api/triggers', config).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var getTrigger = function (trigger) {
    var defer = $q.defer();

    $http({ url: '/api/triggers/' + trigger }).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var saveTrigger = function (trigger) {
    var defer = $q.defer();

    $http.put('/api/triggers/' + trigger._id, trigger).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var removeTrigger = function (trigger) {
    var defer = $q.defer();

    $http.delete('/api/triggers/' + trigger).then(function () {
      defer.resolve();
    }, function () {
      defer.reject();
    });

    return defer.promise;
  };

  var removeAction = function (actions, index) {

    confirm('Are you sure you want to remove this Action?').then(function () {
      actions.splice(index, 1);
    });

  };

  var openAction = function (action, title) {

    return $uibModal.open({
      animation: true,
      templateUrl: 'views/triggers/triggers.action.html',
      size: 'lg',
      controller: function ($scope, $uibModalInstance, action, devices, rooms, title) {
        $scope.action = action;
        $scope.title = title;
        $scope.builder = {};
        $scope.type_args = [];
        $scope.devices = devices;
        $scope.rooms = rooms;

        var parser = function () {
          if (!action.name) { return; }
          var parts = action.name.split('.');
          if (parts.length === 3) {
            $scope.builder.type = parts[0];
            $scope.builder.item = parts[1];
            $scope.builder.action = parts[2];
          } else if (parts.length === 2) {
            $scope.builder.type = parts[0];
            $scope.builder.action = parts[1];
          }
        };

        parser();

        $scope.action_types = [
          {name: 'Device', value: 'devices', icon: 'glyphicon glyphicon-oil'},
          {name: 'Room', value: 'rooms', icon: 'glyphicon glyphicon-modal-window'},
          {name: 'Video', value: 'video', icon: 'icon-playvideo'},
          {name: 'Display', value: 'display', icon: 'icon-monitor'},
        ];

        $scope.type_actions = [
          {name: 'On', value: 'on', arguments: []},
          {name: 'Off', value: 'off', arguments: []},
          {name: 'Level', value: 'level', arguments: ['level']},
          {name: 'Mode', value: 'mode', arguments: ['mode']},
          {name: 'Temperature', value: 'set_point', arguments: ['temperature']},
          {name: 'Brightness', value: 'brightness', arguments: ['set_level']},
          {name: 'Play', value: 'play', arguments: ['url', 'duration']},
          {name: 'Stop', value: 'stop', arguments: []},
        ];

        $scope.change_action = function (type) {
          $scope.builder.action = type.value;
          $scope.type_args = type.arguments;
        };

        $scope.save = function () {
          $uibModalInstance.close($scope.action);
        };
        $scope.cancel = function () {
          $uibModalInstance.dismiss();
        };

      },
      resolve: {
        action: function () {
          return action;
        },
        devices: function () {
          return devices.load();
        },
        rooms: function () {
          return rooms.load();
        },
        title: function () {
          return title;
        },
      }
    });

  };

  var editAction = function (action) {
    console.log(action);
    var modal = openAction(action, 'Edit Action');
    modal.result.then(function (result) {
      action = result;
    });

  };

  var addAction = function (action) {
    var modal = openAction({}, 'Add Action');
    action = action || [];

    modal.result.then(function (result) {
      action.push(result);
    });
  };

  return {
    'load': load,
    'add': addTrigger,
    'get': getTrigger,
    'save': saveTrigger,
    'remove': removeTrigger,
    'editAction': editAction,
    'addAction': addAction,
    'removeAction': removeAction,
    'types': getTypes
  };
})
.controller('triggersList', function ($scope, $state, triggers) {
  $scope.triggers = [];
  $scope.loading = true;

  $scope.edit = function (trigger) {
    $state.go('index.triggers.edit', {name: trigger.name});
  };

  $scope.load = function () {
    triggers.load().then(function (triggers) {
      $scope.triggers = triggers;
      $scope.loading = false;
      $scope.error = false;
    }, function () {
      $scope.loading = false;
      $scope.error = true;
    });
  };



  $scope.load();
})
.controller('triggersEdit', function ($scope, $state, triggers, trigger, devices, confirm, types) {
  $scope.trigger = trigger;
  $scope.alerts = [];
  $scope.state = $state;
  $scope.trigger_types = types;
  $scope.devices = [];
  $scope.conditions = false;
  $scope.delay = ($scope.trigger.delay && $scope.trigger.delay.time > 0) ? true : false;
  $scope.duration = ($scope.trigger.duration && $scope.trigger.duration.time > 0) ? true : false;
  $scope.devices_loading = true;

  $scope.addAction = triggers.addAction;
  $scope.editAction = triggers.editAction;
  $scope.removeAction = triggers.removeAction;

  var getDevices = function () {
    $scope.devices_loading = true;
    devices.load().then(function (devices) {
      $scope.devices = devices;
      $scope.devices_loading = false;
    }, function () {
      $scope.devices = [];
      $scope.devices_loading = false;
    });
  };

  $scope.$watch('delay', function (type) {
    if (!type) {
      $scope.trigger.delay = {};
    }
  });

  $scope.$watch('duration', function (type) {
    if (!type) {
      $scope.trigger.duration = {'actions': [], 'triggers': []};
    }
  });

  $scope.$watch('trigger.match_type', function (type) {
    if (type === 'device' && $scope.devices.length === 0) {
      getDevices();
    }
  });

  $scope.changeType = function (type) {
    $scope.trigger.match_type = type;
    $scope.trigger.match = '';
  };


  $scope.match_types = [
    {name: 'None', value: '', icon: 'glyphicon glyphicon-ban-circle'},
    {name: 'Device', value: 'device', icon: 'glyphicon glyphicon-oil'},
    {name: 'Time', value: 'time', icon: 'icon-clockalt-timealt'},
    {name: 'Date', value: 'date', icon: 'icon-calendar'},
    {name: 'String', value: 'string', icon: 'icon-quote'},
    {name: 'Number', value: 'number', icon: 'icon-infinityalt'}
  ];

  $scope.closeAlert = function(index) {
    $scope.alerts.splice(index, 1);
  };

  $scope.save = function () {
    triggers.save($scope.trigger).then(function () {
      $scope.alerts = [{'type': 'success', 'msg': 'Trigger Saved'}];
    }, function (err) {
      $scope.alerts = [{'type': 'danger', 'msg': 'Failed to save Trigger'}];
      $scope.errors = err;
    });
  };

  $scope.remove = function () {
    confirm('Are you sure you want to remove this Trigger?').then(function () {
      triggers.remove(trigger._id).then(function () {
        $state.go('index.triggers');
      }, function (err) {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to remove Trigger'}];
        $scope.errors = err;
      });
    });
  };
})
.controller('room', function () {

});
