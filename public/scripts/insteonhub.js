'use strict';

angular.module('insteonhub', [])
.config(function($stateProvider, $urlRouterProvider) {

  $stateProvider
  .state('index.settings.insteonhub', {
    url: '/insteonhub',
    templateUrl: '/views/providers/insteonhub/settings.html',
    controller: 'insteonHubSettings',
    resolve: {
      config: function (insteonhub) {
        return insteonhub.get_config();
      }
    }
  })
})
.service('insteonhub', function (settings) {

  var get_config = function () {

    return settings.get_config('insteonhub');

  };

  var save_config = function (config) {

    return settings.save_config('insteonhub', config);

  };

  return {
    get_config: get_config,
    save: save_config
  };

})
.controller('insteonHubSettings', function ($scope, insteonhub, notifier, config) {

  $scope.config = config;
  $scope.devices = [
    '/dev/ttyUSB0',
    '/dev/ttyUSB1',
    '/dev/ttyUSB2',
    '/dev/ttyUSB3',
  ];

  $scope.save = function () {

    insteonhub.save($scope.config).then(function () {
      $scope.status = 'saved';

      notifier.notify({
        'status': 'success',
        'message': 'Insteon Settings Saved'
      });

    }, function (err) {
      notifier.notify({
        'status': 'failed',
        'message': 'Insteon Settings Failed to Saved',
        'details': err
      });
    });

  };

})
.controller('insteonhubEdit', function () {
  $scope.device = $scope.$parent.device
})
.controller('insteonhubAdd', function ($scope, $http, $timeout) {
  $scope.device = $scope.$parent.device;
  $scope.loading = false;
  $scope.device_types = [
    {
      'name': 'Device',
      'capabilities': ['light', 'dimmer'],
      'active': true,
      'type': 'devices'
    },
    {
      'name': 'Scene',
      'capabilities': ['onoff'],
      'active': true,
      'type': 'scenes'
    },
    {
      'name': 'Room',
      'capabilities': ['onoff'],
      'active': false,
      'type': 'room'
    },
  ];

  $scope.changeType = function (t) {
    $scope.type = t;
    $scope.device.capabilities = t.capabilities;
    $scope.device.active = t.active;

    $scope.loading = true;
    $http.get('api/insteonhub/' + t.type).then(function (response) {
      $scope.devices = response.data;
      $scope.loading = false;
    }, function (err) {
      $scope.error = err;
      $scope.loading = false;
    });
  };

  $scope.selectDevice = function (d) {
    $scope.device.name = d.DeviceName;
    $scope.device.config = {
      'type': 'device',
      'DeviceID': d.DeviceID
    }
  };

  $scope.selectScene = function (d) {
    $scope.device.name = d.SceneName;
    $scope.device.config = {
      'type': 'scene',
      'SceneID': d.SceneID
    }
  };

  $scope.get_last = function () {
    $http.get('api/insteonhub/linking/last').then(function (response) {
      $scope.device.config = response.data;
      $scope.link_status = 'idle';
    }, function (err) {
      $scope.error = err;
    });
  }
  $scope.check_linking = function () {
    $http.get('api/insteonhub/linking/status').then(function (response) {
      if (!response.data.linking) {
        $scope.link_status = 'idle';
        $scope.get_last();

      } else {
        $timeout($scope.check_linking, 2000);
      }
    }, function (err) {
      $scope.error = err;
    });
  };

  $scope.start_linking = function () {
    $scope.link_status = 'linking';

    $http.post('api/insteonhub/linking/start', {'auto_add': false, 'type': $scope.type.link_mode}).then(function (response) {
      $timeout($scope.check_linking, 2000);
    }, function (err) {
      $scope.error = err;
      $scope.link_status = 'idle';
    });

  };

  $scope.cancel_linking = function () {

    $http.post('api/insteonhub/linking/stop').then(function (response) {
      $scope.link_status = 'idle';
    }, function (err) {
      $scope.link_status = 'linking';
    });

  };

});
