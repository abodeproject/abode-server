'use strict';

angular.module('settings', ['ui.router'])
.config(function($stateProvider, $urlRouterProvider) {

  $urlRouterProvider.when('/settings', '/settings/list');

  $stateProvider
  .state('index.settings', {
    url: '/settings',
    templateUrl: '/views/settings/settings.html',
    controller: 'settings',
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
  })
  .state('index.settings.home', {
    url: '/home',
    templateUrl: '/views/settings/settings.home.html',
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
.controller('settings', function ($scope, $state) {
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
});
