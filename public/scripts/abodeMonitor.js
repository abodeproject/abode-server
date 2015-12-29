'use strict';

angular.module('abodeMonitor', ['auth', 'datetime','background', 'weather', 'statuses', 'climate', 'devices', 'ui.router','ngTouch'])
  .config(function($stateProvider, $urlRouterProvider, $httpProvider) {

    $httpProvider.interceptors.push('abodeHttpInterceptor');
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
    .state('rooms', {
      url: '/rooms',
      title: 'Abode Rooms',
      templateUrl: '/views/rooms.html',
      controller: function () {

      }
    })
    .state('devices', {
      url: '/devices',
      title: 'Abode Devices',
      templateUrl: '/views/devices.html',
      controller: function () {

      }
    })
    .state('triggers', {
      url: '/triggers',
      title: 'Abode Triggers',
      templateUrl: '/views/triggers.html',
      controller: function () {

      }
    })
    .state('logout', {
      url: '/logout',
      title: 'Abode Logout',
      templateUrl: '/views/logout.html',
      controller: function ($scope, $state, auth) {
        $scope.logout = function () {
          auth.logout();
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
  .controller('main', function($rootScope, $scope, $http, $interval) {
    $scope.anav_visible = false;

    $scope.anav_hide = function () {
      $scope.anav_visible = false;
    };
    $scope.anav_show = function () {
      $scope.anav_visible = true;
    };

    $rootScope.$on('$stateChangeStart', function () {
      $scope.anav_hide();
    });

    var connection_checker = function () {
      if ($rootScope.http_error) {
        $http.get('./auth').then(function () {
          return;
        });
      }
    };

    $interval(connection_checker, 1000 * 5);
  })
  .factory('abodeHttpInterceptor', function ($rootScope, $q, $interval) {
    $rootScope.http_error = false;

    return {
      request: function (request) {
        if (request.url !== './auth' && $rootScope.http_error) {
          return $q.reject(request);
        }
        $rootScope.http_processing = true;
        return request;
      },
      requestError: function (rejection) {
        $rootScope.http_processing = false;
        return $q.reject(rejection);
      },
      response: function (response) {
        $rootScope.http_processing = false;
        $rootScope.http_error = false;
        return response;
      },
      responseError: function (rejection) {
        if (rejection.status === 401 && rejection.config.url !== './auth') {
          $rootScope.authorized = false;
        } else if ( [-1, 503].indexOf(rejection.status) >= 0 ) {
          $rootScope.http_error = true;
        }
        $rootScope.http_processing = false;
        return $q.reject(rejection);
      }
    };
  })
  .directive('content', function () {
    return {
      restrict: 'E',
      transclude: true,
      scope: {
        'margin': '@'
      },
      controller: function ($scope) {
        $scope.styles = {};

        if ($scope.margin !== undefined) { $scope.styles.margin = $scope.margin + 'em'; }
      },
      template: '<div class="content" ng-style="styles" ng-transclude></div>',
      replace: true,
    };
  });

