'use strict';

angular.module('datetime', [])
.service('datetime', function ($interval, $http, $state) {

  var obj = {};
  var updater;

  var parseDetails = function (response) {
    obj.time = response.data.time;
    obj.is = response.data.is;
  };

  var getDetails = function () {
    if ($state.current.name !== 'home') {
      $interval.cancel(updater);
      return;
    }
    $http({ url: '/time' }).then(parseDetails);
  };

  var updateTime = function () {
    obj.date = new Date();
  };

  updateTime();
  getDetails();

  $interval(updateTime, 200);
  updater = $interval(getDetails, 1000 * 60);

  return {
    get: function () {
      return obj;
    }
  };
})
.directive('datetime', function () {

  return {
    restrict: 'E',
    transclude: true,
    scope: {
      format: '@'
    },
    controller: function ($scope, $filter, $interval, datetime) {
      $scope.now = datetime.get();
      $scope.format = $scope.format || 'short';
      $scope.interval = $scope.interval || 1;

      $interval(function () {
        $scope.formatted = $filter('date')($scope.now.date, $scope.format);
      }, $scope.interval * 1000);

    },
    template: '<div>{{formatted}}</div>',
    replace: true,
  };

});
