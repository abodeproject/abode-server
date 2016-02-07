'use strict';

angular.module('settings', ['ui.router'])
.config(function($stateProvider, $urlRouterProvider) {

  $urlRouterProvider.when('/settings', '/settings/list');

  $stateProvider
  .state('index.settings', {
    url: '/settings',
    templateUrl: '/views/settings/settings.html',
    controller: 'settings',
    resolve: {
      config: function (settings) {
        return settings.get_config();
      }
    }
  })
  .state('index.settings.list', {
    url: '/list',
    templateUrl: '/views/settings/settings.list.html',
    controller: function ($scope) {
      $scope.settings = [
        {'name': 'General', 'route': 'index.settings.general'},
        {'name': 'Home', 'route': 'index.settings.home'},
        {'name': 'Sources', 'route': 'index.settings.sources'},
        {'name': 'Sensors', 'route': 'index.settings.sensors'},
        {'name': 'Providers', 'route': 'index.settings.providers'},
        {'name': 'Display', 'route': 'index.settings.display'},
        {'name': 'Networking', 'route': 'index.settings.networking'},
        {'name': 'Advanced', 'route': 'index.settings.advanced'}
      ];
    }
  })
  .state('index.settings.general', {
    url: '/general',
    templateUrl: '/views/settings/settings.general.html',
    controller: 'settings',
    resolve: {
      config: function (settings) {
        return settings.get_config();
      }
    }
  })
  .state('index.settings.home', {
    url: '/home',
    templateUrl: '/views/settings/settings.home.html',
    controller: 'homeSettings',
    resolve: {
      view: function (settings) {
        return settings.get_view();
      }
    }
  })
  .state('index.settings.sources', {
    url: '/sources',
    templateUrl: '/views/settings/settings.sources.html',
  })
  .state('index.settings.sensors', {
    url: '/sensors',
    templateUrl: '/views/settings/settings.sensors.html',
  })
  .state('index.settings.providers', {
    url: '/providers',
    templateUrl: '/views/settings/settings.providers.html',
  })
  .state('index.settings.display', {
    url: '/display',
    templateUrl: '/views/settings/settings.display.html',
  })
  .state('index.settings.networking', {
    url: '/networking',
    templateUrl: '/views/settings/settings.networking.html',
  })
  .state('index.settings.advanced', {
    url: '/advanced',
    templateUrl: '/views/settings/settings.advanced.html',
  });
})
.service('settings', function ($q, $http) {

  var get_config = function (provider) {
    var defer = $q.defer();

    var url = (provider) ? '/api/abode/config/' + provider : '/api/abode/config'

    $http.get(url).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var save_config = function (provider, config) {
    var defer = $q.defer();


    var url = (provider) ? '/api/abode/config/' + provider : '/api/abode/config'

    $http.put(url, config).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  };

  var write_config = function () {
    var defer = $q.defer();

    $http.post('/api/abode/save').then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  }

  var get_view = function () {
    var defer = $q.defer();

    $http.get('/api/abode/views/home.html').then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  }

  var save_view = function (view) {
    var defer = $q.defer();

    $http.put('/api/abode/views/home.html', view, {headers: {'Content-Type': 'text/plain'}}).then(function (response) {
      defer.resolve(response.data);
    }, function (err) {
      defer.reject(err);
    });

    return defer.promise;
  }

  return {
    get_config: get_config,
    save_config: save_config,
    write_config: write_config,
    get_view: get_view,
    save_view: save_view,
  };

})
.controller('homeSettings', function ($scope, $state, settings, notifier, view) {
  $scope.view = view;

  $scope.saveView = function () {

    settings.save_view($scope.view).then(function () {

      notifier.notify({
        'status': 'success',
        'message': 'Home Template Saved'
      });

    }, function (err) {
      notifier.notify({
        'status': 'failed',
        'message': 'Failed to Save Home Template',
        'details': err
      });
    });

  }
})
.controller('settings', function ($scope, $state, settings, notifier, config) {
  $scope.config = config;
  $scope.state = $state;
  $scope.reload = function () {
    document.location.reload();
  };

  $scope.sensors = [
    {'name': 'Temperature/Humidity', 'route': 'index.settings.general'},
    {'name': 'Light', 'route': 'index.settings.home'},
    {'name': 'Motion', 'route': 'index.settings.sources'},
  ];

  $scope.providers = [
    {'name': 'Insteon', 'route': 'index.settings.insteon'},
    {'name': 'Rad', 'route': 'index.settings.rad'},
    {'name': 'Wunderground', 'route': 'index.settings.wunderground'},
    {'name': 'IFTTT', 'route': 'index.settings.ifttt'},
    {'name': 'RadioThermostat', 'route': 'index.settings.radiothermostat'},
    {'name': 'Video', 'route': 'index.settings.video'},
  ];

  $scope.sources = [
    {'name': 'Muir', 'route': 'index.settings.insteon'},
  ];

  $scope.providerSettings = function (p) {
    $state.go(p);
  };

  $scope.save = function () {

    settings.save_config(undefined, $scope.config).then(function () {

      notifier.notify({
        'status': 'success',
        'message': 'Settings Saved'
      });

    }, function (err) {
      notifier.notify({
        'status': 'failed',
        'message': 'Settings Failed to Save',
        'details': err
      });
    });

  };

  $scope.write_config = function () {
    settings.write_config().then(function () {

      notifier.notify({
        'status': 'success',
        'message': 'Config Saved'
      });

    }, function (err) {

      notifier.notify({
        'status': 'failed',
        'message': 'Failed to Save Config',
        'details': err
      });

    });
  };
});
