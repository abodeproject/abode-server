'use strict';

angular.module('abodeMonitor', ['auth', 'datetime','background', 'weather', 'statuses', 'climate', 'devices', 'rooms', 'triggers', 'settings', 'ui.router','ngTouch'])
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
  })
  .directive('stopEvent', function () {
    return {
      restrict: 'A',
      link: function (scope, element, attr) {
        element.bind('click', function (e) {
            e.stopPropagation();
        });
      }
    };
   })
  .service('confirm', function ($q, $uibModal) {
    return function (msg) {
      var defer = $q.defer();

      var modal = $uibModal.open({
        animation: true,
        templateUrl: 'views/confirm.html',
        size: 'sm',
        controller: function ($scope, $uibModalInstance) {
          $scope.msg = msg;

          $scope.no = function () {
            $uibModalInstance.dismiss();
          };

          $scope.yes = function () {
            $uibModalInstance.close();
          };

        }
      });

      modal.result.then(function () {
        defer.resolve();
      }, function () {
        defer.reject();
      });

      return defer.promise;
    }
  })
  .directive('toggle', function () {
    return {
      restrict: 'E',
      transclude: false,
      scope: {
        on: '@',
        off: '@',
        value: '=',
      },
      controller: function ($scope) {
        $scope.styles = {};
        $scope.value = ($scope.value === true) ? true : false;

        if (!$scope.on) { $scope.on = 'On'; }
        if (!$scope.off) { $scope.on = 'Off'; }

        var setStyles = function () {
          if ($scope.value) {
            $scope.styles.left = '1em';
          } else {
            $scope.styles.left = '0em';
          }
        };

        setStyles();

        $scope.styles = {
          'top': '0em',
          'bottom': '0em',
          'width': '1em',
          'background-color': '#eee',
          'box-sizing': 'border-box',
          'position': 'absolute',
          'transition': '.2s',
          'border-radius': '.1em',
        };

        $scope.toggle = function () {
          if ($scope.value) {
            $scope.value = false;
          } else {
            $scope.value = true;
          }
        };

        $scope.$watch('value', function () {
          setStyles();
        }, true);

      },
      template: '<div ng-click="toggle()" ng-class="{\'bg-success\': (value == true)}" style="border-radius: .1em; cursor: pointer; transition: .2s; position: relative; box-sizing: border-box; width: 2em; height: 1em; line-height: 1em; display:inline-block; border: 1px solid #aaa;"><div ng-style="styles"></div></div>',
      replace: true,
    };
  })
  .directive('epochduration', ['$compile', function () {
    return {
      restrict: 'E',
      replace: 'true',
      scope: {
        time: '='
      },
      template: '<div class="epochtime"><div class="epochtime-days"><button ng-click="increaseDay()"><i class="icon-pigpenv"></i></button><input type="text" ng-model="days"><button ng-click="decreaseDay()"><i class="icon-pigpens"></i></button></div><div class="epochtime-label">:</div><div class="epochtime-hours"><button ng-click="increaseHour()"><i class="icon-pigpenv"></i></button><input type="text" ng-model="hours"><button ng-click="decreaseHour()"><i class="icon-pigpens"></i></button></div><div class="epochtime-label">:</div><div class="epochtime-minutes"><button ng-click="increaseMinute()"><i class="icon-pigpenv"></i></button><input type="text" ng-model="minutes"><button ng-click="decreaseMinute()"><i class="icon-pigpens"></i></button></div></div>',
      link: function (scope) {
        scope.time = scope.time || 0;
        var dayWatch, timeWatch, hourWatch, minuteWatch, meridianWatch;

        var updateTime = function () {
          clearWatches();

          var d = 60 * 60 * 24 * scope.days;
          var h = 60 * 60 * scope.hours;
          var m = 60 * scope.minutes;

          scope.time = h + m + d;

          makeWatches();
        };

        var splitTime = function () {
          clearWatches();

          scope.time = scope.time || 0;
          scope.days =  parseInt(scope.time / (60 * 60 * 24));
          scope.hours =  parseInt(scope.time / 60 / 60);
          scope.minutes =  parseInt(scope.time % (60 * 60) / 60);

          makeWatches();
        };

        scope.increaseDay = function () {
          scope.days = parseInt(scope.days, 10);
          scope.days += 1;
        };

        scope.decreaseDay = function () {
          scope.days = parseInt(scope.days, 10);
          if (scope.days === 0) {
            scope.days = 0;
          } else {
            scope.days -= 1;
          }
        };

        scope.increaseHour = function () {
          scope.hours = parseInt(scope.hours, 10);
          if (scope.hours === 23) {
            scope.hours = 0;
            scope.increaseDay();
          } else {
            scope.hours += 1;
          }
        };

        scope.decreaseHour = function () {
          scope.hours = parseInt(scope.hours, 10);
          if (scope.hours === 0) {
            scope.hours = 23;
            scope.decreaseDay();
          } else {
            scope.hours -= 1;
          }
        };

        scope.increaseMinute = function () {
          scope.minutes = parseInt(scope.minutes, 10);
          if (scope.minutes === 59) {
            scope.minutes = 0;
            scope.increaseHour();
          } else {
            scope.minutes += 1;
          }
        };

        scope.decreaseMinute = function () {
          scope.minutes = parseInt(scope.minutes, 10);
          if (scope.minutes === 0) {
            scope.minutes = 0;
            scope.decreaseHour();
          } else {
            scope.minutes -= 1;
          }
        };

        var clearWatches = function () {
          if (dayWatch !== undefined) {
            dayWatch();
          }
          if (hourWatch !== undefined) {
            hourWatch();
          }
          if (minuteWatch !== undefined) {
            minuteWatch();
          }
          if (meridianWatch !== undefined) {
            meridianWatch();
          }
          if (timeWatch !== undefined) {
            timeWatch();
          }
        };

        var makeWatches = function () {
          dayWatch = scope.$watch('days', function (newVal, oldVal) {
            if (newVal !== oldVal) {
              updateTime();
            }
          });

          hourWatch = scope.$watch('hours', function (newVal, oldVal) {
            if (newVal !== oldVal) {
              updateTime();
            }
          });

          minuteWatch = scope.$watch('minutes', function (newVal, oldVal) {
            if (newVal !== oldVal) {
              updateTime();
            }
          });

          meridianWatch = scope.$watch('meridian', function (newVal, oldVal) {
            if (newVal !== oldVal) {
              updateTime();
            }
          });

          timeWatch = scope.$watch('time', function (newVal, oldVal) {
            if (newVal !== oldVal) {
              console.log('time change', newVal, oldVal);
              splitTime();
            }
          });
        };

        scope.changeMeridian = function () {
          scope.meridian = (scope.meridian === 'PM') ? 'AM' : 'PM';
        };


        splitTime();
      }
    };
  }])
  .directive('epochtime', ['$compile', function () {
    return {
      restrict: 'E',
      replace: 'true',
      scope: {
        time: '=',
        disabled: '@'
      },
      template: '<div class="epochtime"><div class="epochtime-hours"><button ng-click="increaseHour()"><i class="icon-pigpenv"></i></button><input type="text" ng-model="hours"><button ng-click="decreaseHour()"><i class="icon-pigpens"></i></button></div><div class="epochtime-label">:</div><div class="epochtime-minutes"><button ng-click="increaseMinute()"><i class="icon-pigpenv"></i></button><input type="text" ng-model="minutes"><button ng-click="decreaseMinute()"><i class="icon-pigpens"></i></button></div><div class="epochtime-meridian"><button ng-click="changeMeridian()">{{meridian}}</button></div></div>',
      link: function (scope) {
        scope.meridian = 'AM';
        var timeWatch, hourWatch, minuteWatch, meridianWatch;

        scope.$watch('disabled', function (newVal, oldVal) {
          if (newVal !== oldVal) {
            if (newVal === false) {
              clearWatches();
            } else {
              scope.time = (!isNaN(scope.time)) ? scope.time : 0;
              scope.meridian = 'AM';

              splitTime();
            }
          }
        });

        var updateTime = function () {
          clearWatches();

          var h = 60 * 60 * scope.hours;
          var m = 60 * scope.minutes;
          var o = (scope.meridian === 'PM') ? (60 * 60 * 12) : 0;

          scope.time = h + m + o;

          makeWatches();
        };

        var splitTime = function () {
          clearWatches();

          scope.hours =  parseInt(scope.time / 60 / 60);
          scope.minutes =  parseInt(scope.time % (60 * 60) / 60);
          scope.meridian = (scope.hours >= 12) ? 'PM' : 'AM';
          if (scope.meridian === 'PM') {
            scope.hours = scope.hours - 12;
          }

          makeWatches();
        };

        scope.increaseHour = function () {
          scope.hours = parseInt(scope.hours, 10);
          if (scope.hours === 12 && scope.meridian === 'AM') {
            scope.hours = 1;
            scope.meridian = 'PM';
          } else if (scope.hours === 12 && scope.meridian === 'PM') {
            scope.hours = 1;
            scope.meridian = 'AM';
          } else {
            scope.hours += 1;
          }
        };

        scope.decreaseHour = function () {
          scope.hours = parseInt(scope.hours, 10);
          if (scope.hours === 1 && scope.meridian === 'AM') {
            scope.hours = 12;
            scope.meridian = 'PM';
          } else if (scope.hours === 1 && scope.meridian === 'PM') {
            scope.hours =12;
            scope.meridian = 'AM';
          } else {
            scope.hours -= 1;
          }
        };

        scope.increaseMinute = function () {
          scope.minutes = parseInt(scope.minutes, 10);
          if (scope.minutes === 59) {
            scope.minutes = 0;
            scope.increaseHour();
          } else {
            scope.minutes += 1;
          }
        };

        scope.decreaseMinute = function () {
          scope.minutes = parseInt(scope.minutes, 10);
          if (scope.minutes === 0) {
            scope.minutes = 0;
            scope.decreaseHour();
          } else {
            scope.minutes -= 1;
          }
        };
        var clearWatches = function () {
          if (hourWatch !== undefined) {
            hourWatch();
          }
          if (minuteWatch !== undefined) {
            minuteWatch();
          }
          if (meridianWatch !== undefined) {
            meridianWatch();
          }
          if (timeWatch !== undefined) {
            timeWatch();
          }
        };

        var makeWatches = function () {
          hourWatch = scope.$watch('hours', function (newVal, oldVal) {
            if (newVal !== oldVal) {
              updateTime();
            }
          });

          minuteWatch = scope.$watch('minutes', function (newVal, oldVal) {
            if (newVal !== oldVal) {
              updateTime();
            }
          });

          meridianWatch = scope.$watch('meridian', function (newVal, oldVal) {
            if (newVal !== oldVal) {
              updateTime();
            }
          });

          timeWatch = scope.$watch('time', function (newVal, oldVal) {
            if (newVal !== oldVal) {
              splitTime();
            }
          });
        };

        scope.changeMeridian = function () {
          scope.meridian = (scope.meridian === 'PM') ? 'AM' : 'PM';
        };

        if (scope.disabled === 'false') {
          scope.time = (!isNaN(scope.time)) ? scope.time : 0;

          splitTime();
        }

      }
    };
  }]);

