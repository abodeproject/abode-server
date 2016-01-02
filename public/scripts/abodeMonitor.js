'use strict';

angular.module('abodeMonitor', ['auth', 'datetime','background', 'weather', 'statuses', 'climate', 'devices', 'rooms', 'triggers', 'ui.router','ngTouch'])
  .config(function($stateProvider, $urlRouterProvider, $httpProvider) {

    $httpProvider.interceptors.push('abodeHttpInterceptor');
    $urlRouterProvider.when('', '/home');
    $urlRouterProvider.otherwise('/home');

    $stateProvider
    .state('index', {
      url: '',
      templateUrl: '/views/index.html',
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
      controller: function ($scope, $state) {
        $scope.goSettings = function () {
          $state.go('index.settings');
        };

      }
    })
    .state('index.home', {
      url: '/home',
      templateUrl: '/api/abode/views/home.html',
      controller: function ($scope, $state, $interval, datetime) {
        $scope.is = datetime.get().is;
        $scope.goSettings = function () {
          $state.go('index.settings');
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
        $scope.active = 'general';

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
            $state.go('index.home');
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

    $rootScope.$on('$stateChangeError', function () {
      console.log('state change error');
      console.dir(arguments);
    });

    $rootScope.$on('$stateNotFound', function () {
      console.log('state not found');
    });

    var connection_checker = function () {
      if ($rootScope.http_error) {
        $http.get('/api/auth').then(function () {
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
        if (request.url !== '/api/auth' && $rootScope.http_error) {
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
        if (rejection.status === 401 && rejection.config.url !== '/api/auth') {
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
        format: '@',
        top: '@',
        bottom: '@',
        left: '@',
        right: '@',
        height: '@',
        width: '@',
        align: '@',
        size: '@',
        background: '@',
        color: '@',
        shadow: '@',
        margin: '@'
      },
      controller: function ($scope) {
        $scope.styles = {};

        if ($scope.top) { $scope.styles.top = $scope.top + 'em'; }
        if ($scope.bottom) { $scope.styles.bottom = $scope.bottom + 'em'; }
        if ($scope.left) { $scope.styles.left = $scope.left + 'em'; }
        if ($scope.right) { $scope.styles.right = $scope.right + 'em'; }
        if ($scope.height) { $scope.styles.height = $scope.height + 'em'; }
        if ($scope.width) { $scope.styles.width = $scope.width + 'em'; }
        if ($scope.align) { $scope.styles['text-align'] = $scope.align; }
        if ($scope.size) { $scope.styles['font-size'] = $scope.size + 'em'; }
        if ($scope.background) { $scope.styles.background = $scope.background; }
        if ($scope.color) { $scope.styles.color = $scope.color; }
        if ($scope.shadow) { $scope.styles['text-shadow'] = $scope.shadow; }
        if ($scope.margin) { $scope.styles.margin = (isNaN($scope.margin)) ? $scope.margin : $scope.margin + 'em'; }

      },
      template: '<div class="content" ng-style="styles" ng-transclude></div>',
      replace: true,
    };
  });

