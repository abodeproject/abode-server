'use strict';

angular.module('wunderground', [])
.service('wunderground', function () {
  return {};
})
.controller('wundergroundSettings', function () {

})
.controller('wundergroundEdit', function ($scope) {
  $scope.device = $scope.$parent.device

})
.controller('wundergroundAdd', function ($scope) {
  $scope.device = $scope.$parent.device
  $scope.device.capabilities = ['weather','temperature_sensor', 'humidity_sensor'];
});
