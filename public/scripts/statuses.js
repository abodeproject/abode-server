'use strict';

angular.module('statuses', [])
.directive('statuses', function () {

  return {
    restrict: 'E',
    transclude: true,
    scope: {
    },
    controller: function () {

    },
    template: '<div ng-transclude></div>',
    replace: true,
  };

})
.directive('status', function () {

  return {
    restrict: 'E',
    transclude: true,
    scope: {
      room: '@',
      icon: '@',
      state: '@'
    },
    controller: function () {

    },
    template: '<div class="{{icon}}"></div>',
    replace: true,
  };

});
