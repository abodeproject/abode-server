'use strict';

angular.module('background', [])
.directive('background', function () {

  return {
    restrict: 'E',
    transclude: true,
    scope: {
      format: '@',
      bgA: '@',
      bgB: '@',
      interval: '@',
      url: '@',
      refresh: '@',
    },
    controller: function ($scope, $interval, $timeout, $state) {

      var updater;

      $scope.interval = $scope.interval || 60;
      $scope.interval = ($scope.interval < 5) ? 5 : $scope.interval;
      $scope.refresh = ($scope.refresh === undefined || $scope.refresh === true) ? true : false;
      $scope.bgA = {};
      $scope.bgB = {};

      var bgStyles = [
        'bgA',
        'bgB',
      ];

      var next = 1;
      var previous = 0;
      var delay;

      var updateBackground = function () {

        if ($state.current.name != 'index.home') {
          return;
        }

        next = (next === 0) ? 1 : 0;
        previous = (next === 0) ? 1 : 0;


        var random = new Date();
        var uri = $scope.url;
          uri += ($scope.url.indexOf('?') > 0) ? '&' : '?';
          uri += random.getTime();


        if ($scope.refresh) {
          var img = new Image();

          var transition = function () {

          };

          img.onerror = function () {
            console.log('Error loading image:', uri);
            $timeout(updateBackground, 1000 * $scope.interval * 2);
          };

          img.onload = function () {
            $timeout.cancel(delay);
            $scope[bgStyles[next]]['background-image'] = 'url("' + uri + '")';
            $scope[bgStyles[previous]].transition = 'opacity 5s';
            $scope[bgStyles[previous]].opacity = 0;

            $timeout(function () {
              $scope[bgStyles[next]]['z-index'] = 2;
              $scope[bgStyles[previous]]['z-index'] = 1;
              $scope[bgStyles[previous]].transition = '';
              $scope[bgStyles[previous]].opacity = 1;
            }, (1000 * 4 ) );

            delay = $timeout(updateBackground, 1000 * $scope.interval);

          };
          img.src = uri;

        } else {
          $scope[bgStyles[next]]['background-image'] = 'url("' + uri + '")';
          $scope[bgStyles[next]].opacity = 1;
        }

      };

      //updater = $interval(updateBackground, (1000 * $scope.interval));
      updateBackground();

    },
    template: '<div style="z-index: 1; position: absolute; top: 0px; bottom: 0px; left: 0px; right: 0px;">  <div ng-style="bgA" class="background"></div><div ng-style="bgB" class="background"></div></div>',
    replace: true,
  };

});
