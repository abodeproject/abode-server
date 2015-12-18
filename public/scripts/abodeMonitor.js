'use strict';

angular.module('abodeMonitor', ['datetime','background', 'weather', 'statuses'])
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

