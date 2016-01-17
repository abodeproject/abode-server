'use strict';

angular.module('triggers', ['ui.router','ngResource'])
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
    controller: 'triggersEdit',
    resolve: {
      'trigger': function () {

        return {'enabled': true};

      },
      'types': function (triggers) {

        return triggers.types();

      }
    }
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
        $scope.alerts = [];


        $scope.action_types = [
          {name: 'Device', value: 'devices', icon: 'glyphicon glyphicon-oil'},
          {name: 'Room', value: 'rooms', icon: 'glyphicon glyphicon-modal-window', capabilities: ['light', 'dimmer', 'conditioner']},
          {name: 'Video', value: 'video', icon: 'icon-playvideo', capabilities: ['video']},
          {name: 'Display', value: 'display', icon: 'icon-monitor', capabilities: ['display']},
        ];

        $scope.type_actions = [
          {name: 'On', value: 'on', arguments: [], capabilities: ['light', 'dimmer', 'display', 'fan', 'onoff']},
          {name: 'Off', value: 'off', arguments: [], capabilities: ['light', 'dimmer', 'display', 'fan', 'onoff']},
          {name: 'Level', value: 'set_level', arguments: ['level'], capabilities: ['dimmer']},
          {name: 'Mode', value: 'set_mode', arguments: ['mode'], capabilities: ['conditioner']},
          {name: 'Temperature', value: 'set_point', arguments: ['temperature'], capabilities: ['conditioner']},
          {name: 'Play', value: 'play', arguments: ['url', 'duration'], capabilities: ['video']},
          {name: 'Stop', value: 'stop', arguments: [], capabilities: ['video']},
        ];

        var get_type = function (t) {
          var matches = $scope.action_types.filter(function (i) {
            return (i.value === t);
          });

          if (matches.length === 1) {
            return matches[0];
          }
        };

        var get_action = function (t) {
          var matches = $scope.type_actions.filter(function (i) {
            return (i.value === t);
          });

          if (matches.length === 1) {
            return matches[0];
          }
        };

        var get_by = function (key, obj, match) {
          var matches = obj.filter(function (i) {
            return (i[key] === match);
          });

          if (matches.length === 1) {
            return matches[0];
          }
        };

        var parser = function () {
          if (!action.name) { return; }
          var parts = action.name.split('.');
          if (parts.length === 3) {
            if (parts[0] === 'devices') {
              $scope.builder.item = get_by('name', $scope.devices, parts[1]);
            } else if (parts[0] === 'rooms') {
              $scope.builder.item = get_by('name', $scope.rooms, parts[1]);
            } else {
              $scope.builder.item = parts[1];
            }
            $scope.builder.type = parts[0];
            $scope.builder.action = parts[2];
          } else if (parts.length === 2) {
            $scope.builder.type = parts[0];
            $scope.builder.action = parts[1];
          }

          var a = get_action($scope.builder.action);
          $scope.type_args = a.arguments;

          var a_count = -1;

          a.arguments.forEach(function (a) {
            a_count += 1;
            if (a_count < $scope.action.args.length) {
              $scope.builder[a] = $scope.action.args[a_count];
            }
          });
        };

        parser();

        $scope.changeType = function (t) {
          $scope.builder.type = t;
          $scope.builder.item = undefined;
          $scope.builder.action = undefined;
        };
        $scope.changeItem = function (i) {
          $scope.builder.item = i;
          $scope.builder.action = undefined;
        };

        $scope.change_action = function (type) {
          $scope.builder.action = type.value;
          $scope.type_args = type.arguments;
        };

        $scope.has_capability = function (c) {
          var capabilities = [];
          var type = get_type($scope.builder.type);

          if (type && type.capabilities) {
            capabilities = type.capabilities;
          } else if (type && type.value === 'devices' && $scope.builder.item) {
            capabilities = $scope.builder.item.capabilities || [];
          }

          var has = false;

          capabilities.forEach(function (capability) {
            if (c.indexOf(capability) !== -1) {
              has = true;
            }
          });

          return has;
        };

        $scope.save = function () {
          var name = [];

          var isEmpty = function(val){
              return (val === undefined || val === null || val === '') ? true : false;
          };

          if (!$scope.builder.type) {
            $scope.alerts.push({'type': 'danger', 'msg': 'Missing action type'});
            return;
          }
          name.push($scope.builder.type);

          if ($scope.builder.item) {
            name.push($scope.builder.item.name);
          }

          if (!$scope.builder.action) {
            $scope.alerts.push({'type': 'danger', 'msg': 'Missing action'});
            return;
          }
          name.push($scope.builder.action);

          var a = get_action($scope.builder.action);
          if (!a) {
            $scope.alerts.push({'type': 'danger', 'msg': 'Invalid action'});
            return;
          }

          $scope.action.args = [];

          a.arguments.forEach(function (a) {
            var v = $scope.builder[a];

            if (isEmpty(v)) {
              $scope.alerts.push({'type': 'danger', 'msg': 'Missing argument: ' + a});
            } else {
              $scope.action.args.push(v);
            }
          });


          $scope.action.name = name.join('.');
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
    var modal = openAction(action, 'Edit Action');
    modal.result.then(function (result) {
      action = result;
    });

  };

  var addAction = function (action) {
    var modal = openAction({'arguments': []}, 'Add Action');
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
.controller('triggersList', function ($scope, $state, triggers, confirm) {
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

  $scope.remove = function (trigger) {
    confirm('Are you sure you want to remove this Trigger?').then(function () {
      triggers.remove(trigger._id).then(function () {
        $scope.load();
      }, function (err) {
        $scope.alerts = [{'type': 'danger', 'msg': 'Failed to remove Trigger'}];
        $scope.errors = err;
      });
    });
  };


  $scope.load();
})
.controller('triggersEdit', function ($scope, $state, triggers, trigger, devices, rooms, confirm, types) {
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

  $scope.match_types = [
    {name: 'None', value: '', icon: 'glyphicon glyphicon-ban-circle'},
    {name: 'Device', value: 'device', icon: 'glyphicon glyphicon-oil'},
    {name: 'Room', value: 'room', icon: 'glyphicon glyphicon-modal-window'},
    {name: 'Time', value: 'time', icon: 'icon-clockalt-timealt'},
    {name: 'Date', value: 'date', icon: 'icon-calendar'},
    {name: 'String', value: 'string', icon: 'icon-quote'},
    {name: 'Number', value: 'number', icon: 'icon-infinityalt'}
  ];

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

  var getRooms = function () {
    $scope.rooms_loading = true;
    rooms.load().then(function (rooms) {
      $scope.rooms = rooms;
      $scope.rooms_loading = false;
    }, function () {
      $scope.rooms = [];
      $scope.rooms_loading = false;
    });
  };

  getDevices();
  getRooms();

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
    if (type === 'rooms' && $scope.devices.length === 0) {
      getRooms();
    }
  });

  $scope.changeType = function (type) {
    $scope.trigger.match_type = type;
    $scope.trigger.match = '';
  };

  $scope.changeDevice = function (device) {
    trigger.match = device.name;
  };

  $scope.changeRoom = function (room) {
    trigger.match = room.name;
  };

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

  $scope.add = function () {
    triggers.add($scope.trigger).then(function () {
      $scope.trigger = {'enabled': true};
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
