'use strict';

angular.module('insteon', [])
.config(function($stateProvider, $urlRouterProvider) {

  $stateProvider
  .state('index.settings.insteon', {
    url: '/settings',
    templateUrl: '/views/providers/insteon/settings.html',
    controller: 'insteonSettings',
    resolve: {
      config: function (insteon) {
        return insteon.get_config();
      }
    }
  })
})
.service('insteon', function (settings) {

  var get_config = function () {

    return settings.get_config('insteon');

  };

  var save_config = function (config) {

    return settings.save_config('insteon', config);

  };

  return {
    get_config: get_config,
    save: save_config
  };

})
.controller('insteonSettings', function ($scope, insteon, notifier, config) {

  $scope.config = config;
  $scope.devices = [
    '/dev/ttyUSB0',
    '/dev/ttyUSB1',
    '/dev/ttyUSB2',
    '/dev/ttyUSB3',
  ];

  $scope.save = function () {

    insteon.save($scope.config).then(function () {
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
.controller('insteonEdit', function () {
  $scope.device = $scope.$parent.device
})
.controller('insteonAdd', function ($scope, $http, $timeout) {
  $scope.device = $scope.$parent.device;
  $scope.link_status = 'idle';
  $scope.device_types = [
    {
      'name': 'Dimmable Light',
      'capabilities': ['light', 'dimmer'],
      'link_mode': 'responder',
      'active': true,
    },
    {
      'name': 'On/Off Switch',
      'capabilities': ['light', 'onoff'],
      'link_mode': 'responder',
      'active': true,
    },
    {
      'name': 'Door Sensor',
      'capabilities': ['door', 'onoff'],
      'link_mode': 'responder',
      'active': false,
    },
    {
      'name': 'Window Sensor',
      'capabilities': ['window', 'onoff'],
      'link_mode': 'responder',
      'active': false,
    },
    {
      'name': 'Motion Sensor',
      'capabilities': ['motion_sensor', 'onoff'],
      'link_mode': 'responder',
      'active': false,
    }
  ];

  $scope.changeType = function (t) {
    $scope.type = t;
    $scope.device.capabilities = t.capabilities;
    $scope.device.active = t.active;
  };

  $scope.get_last = function () {
    $http.get('api/insteon/linking/last').then(function (response) {
      $scope.device.config = response.data;
      $scope.link_status = 'idle';
    }, function (err) {
      $scope.error = err;
    });
  }
  $scope.check_linking = function () {
    $http.get('api/insteon/linking/status').then(function (response) {
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

    $http.post('api/insteon/linking/start', {'auto_add': false, 'type': $scope.type.link_mode}).then(function (response) {
      $timeout($scope.check_linking, 2000);
    }, function (err) {
      $scope.error = err;
      $scope.link_status = 'idle';
    });

  };

  $scope.cancel_linking = function () {

    $http.post('api/insteon/linking/stop').then(function (response) {
      $scope.link_status = 'idle';
    }, function (err) {
      $scope.link_status = 'linking';
    });

  };

});
