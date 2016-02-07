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
.controller('insteonAdd', function ($scope, $http) {
  $scope.device = $scope.$parent.device;
  $scope.link_status = 'idle';
  $scope.device_types = [
    {
      'name': 'Dimmable Light',
      'capabilities': ['light', 'dimmer'],
      'link_mode': 'either',
    },
    {
      'name': 'On/Off Switch',
      'capabilities': ['light', 'onoff'],
      'link_mode': 'either',
    },
    {
      'name': 'Door Sensor',
      'capabilities': ['door', 'onoff'],
      'link_mode': 'responder',
    },
    {
      'name': 'Window Sensor',
      'capabilities': ['window', 'onoff'],
      'link_mode': 'responder',
    },
    {
      'name': 'Motion Sensor',
      'capabilities': ['motion_sensor', 'onoff'],
      'link_mode': 'responder',
    }
  ];

  $scope.changeType = function (t) {
    $scope.type = t;
  };

  $scope.start_linking = function () {
    $scope.link_status = 'linking';

    $http.post('api/insteon/linking/start', {'auto_add': false, 'type': $scope.type.link_mode}).then(function (response) {

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
