'use strict';

angular.module('insteon', [])
.service('insteon', function () {
  return {};
})
.controller('insteonSettings', function () {

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
