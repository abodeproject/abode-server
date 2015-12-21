'use strict';

angular.module('abodeMonitor', ['auth', 'datetime','background', 'weather', 'statuses', 'ui.router'])
  .config(function($stateProvider, $urlRouterProvider) {

    $urlRouterProvider.otherwise('/home');

    $stateProvider
    .state('home', {
      url: '/home',
      templateUrl: '/views/home.html',
      resolve: {
        check: function ($state, $q, auth) {
          var defer = $q.defer();

          auth.check(false).then(function () {
            defer.resolve();
          }, function () {
            $state.go('login');
            defer.reject();
          });

          return defer.promise;
        }
      },
      controller: function ($scope, $state, $interval, datetime) {
        $scope.is = datetime.get().is;
        $scope.goSettings = function () {
          $state.go('settings');
        };

        $interval(function () {
          $scope.is = datetime.get().is || {};
        }, 1000);

      }
    })
    .state('settings', {
      url: '/settings',
      templateUrl: '/views/settings.html',
      resolve: {
        check: function ($state, $q, auth) {
          var defer = $q.defer();

          auth.check(false).then(function () {
            defer.resolve();
          }, function () {
            $state.go('login');
            defer.reject();
          });

          return defer.promise;
        }
      },
      controller: function ($scope, $state, auth) {
        $scope.goHome = function () {
          $state.go('home');
        };

        $scope.logout = function () {
          auth.logout().then(function () {
            $state.go('login');
          });
        };
      }
    })
    .state('login', {
      url: '/login',
      title: 'Abode Login',
      templateUrl: '/views/login.html',
      controller: function ($scope, $state, auth) {
        $scope.user = {};

        $scope.login = function () {

          auth.login($scope.user).then(function () {
            $state.go('home');
          }, function (err) {
            $scope.error = err;
          });

        };

      }
    });
  })
  .controller('main', function(devices) {
    devices.start();
  })
  .directive('content', function () {
    return {
      restrict: 'E',
      transclude: true,
      scope: {
      },
      controller: function () {
      },
      template: '<div class="content" ng-transclude></div>',
      replace: true,
    };
  })
  .provider('devices', function () {
    var weather = {'foo': true};
    var time = {};
    var rooms = {};

    this.config = {};

    var parseWeather = function (response) {
      weather = response.data;
    };

    var parseTime = function (response) {
      time = response.data;
    };

    this.$get = function ($interval, $http) {

      return {
        'weather': function () { return weather; },
        'time': function () { return time; },
        'rooms': function () {return rooms;},
        'start': function () {
        },
        'add_rooms': function () {

        }
      };

    };

  });

