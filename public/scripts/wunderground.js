'use strict';

angular.module('wunderground', [])
.config(function($stateProvider, $urlRouterProvider) {

  $stateProvider
  .state('index.settings.wunderground', {
    url: '/wunderground',
    templateUrl: '/views/providers/wunderground/settings.html',
    controller: 'wundergroundSettings',
    resolve: {
      config: function (wunderground) {
        return wunderground.get_config();
      }
    }
  })
})
.service('wunderground', function ($q, settings) {

  var get_config = function () {

    return settings.get_config('wunderground');

  };

  var save_config = function (config) {

    return settings.save_config('wunderground', config);

  };

  return {
    get_config: get_config,
    save: save_config
  };

})
.controller('wundergroundSettings', function ($scope, wunderground, notifier, config) {
  $scope.config = config;
  $scope.status = 'idle';

  $scope.save = function () {

    wunderground.save($scope.config).then(function () {
      $scope.status = 'saved';

      notifier.notify({
        'status': 'success',
        'message': 'Wunderground Settings Saved'
      });

    }, function (err) {
      notifier.notify({
        'status': 'failed',
        'message': 'Wunderground Settings Failed to Saved',
        'details': err
      });
    });

  };
})
.controller('wundergroundEdit', function ($scope) {
  $scope.device = $scope.$parent.device

})
.controller('wundergroundAdd', function ($scope) {
  $scope.device = $scope.$parent.device
  $scope.device.capabilities = ['weather','temperature_sensor', 'humidity_sensor'];
});
