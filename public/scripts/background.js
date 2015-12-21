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
      interval: '@'
    },
    controller: function ($scope, $interval, $timeout, $state) {

      var updater;

      $scope.interval = $scope.interval || 60;
      $scope.bgA = {};
      $scope.bgB = {};

      var bgStyles = [
        'bgA',
        'bgB',
      ];

      var next = 1;
      var previous = 0;

      var updateBackground = function () {
        if ($state.current.name !== 'home') {
          $interval.cancel(updater);
          return;
        }

        next = (next === 0) ? 1 : 0;
        previous = (next === 0) ? 1 : 0;


        var random = new Date();
        var uri = 'images/day.jpg?' + random.getTime();

        $scope[bgStyles[next]]['background-image'] = 'url("' + uri + '")';
        $scope[bgStyles[previous]].transition = 'opacity 5s';
        $scope[bgStyles[previous]].opacity = 0;

        $timeout(function () {
          $scope[bgStyles[next]]['z-index'] = 2;
          $scope[bgStyles[previous]]['z-index'] = 1;
          $scope[bgStyles[previous]].transition = '';
          $scope[bgStyles[previous]].opacity = 1;
        }, (1000 * 7 ) );

      };

      updater = $interval(updateBackground, (1000 * $scope.interval));
      updateBackground();

    },
    template: '<div style="z-index: 1; position: absolute; top: 0px; bottom: 0px; left: 0px; right: 0px;">  <div ng-style="bgA" class="background"></div><div ng-style="bgB" class="background"></div></div>',
    replace: true,
  };

});
