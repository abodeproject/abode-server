'use strict';

angular.module('weather', ['datetime'])
.service('weather', function ($interval, $timeout, $http) {
  var devices = {};
  var loader;

  var errorResponse = function (device) {

    return function (response) {
      console.log('Error getting weather for device %s: %s', device, response);
    };

  };

  var parseWeather = function (device) {

    return function (response) {
      devices[device] = response.data;
    };

  };

  var getWeather = function (device) {

    $http({ url: '/devices/' + device }).then(parseWeather(device), errorResponse(device));

  };

  var load = function () {
    Object.keys(devices).forEach(getWeather);
  };

  $interval(load, 1000 * 60);

  return {
    add_device: function (device) {

      if (devices[device] === undefined) {
        devices[device] = {};
      }

      if (loader !== undefined) {
        $timeout.cancel(loader);
      }

      loader = $timeout(load, 500);
    },
    get: function (device) {
      return devices[device];
    }
  };

})
.directive('weather', function () {

  return {
    restrict: 'E',
    transclude: true,
    scope: {
      type: '@',
      value: '@',
      device: '@',
      interval: '@',
    },
    controllerAs: 'weather',
    controller: function ($scope, $interval, $timeout, $http, $element, $transclude, weather, datetime) {
      $scope.interval = $scope.interval || 5;
      $scope.parsed = '?';
      $scope.time = {is: {day: true, night: false}};
      $scope.weather = {
        current: {},
        forecast: {},
      }
      weather.add_device($scope.device);

      $scope.icons = {
        'chanceflurries': 'snow',
        'chancerain': 'rain',
        'chancesleet': 'rain',
        'chancesnow': 'snow',
        'chancetstorms': 'thunderstorms',
        'clear': 'clear',
        'cloudy': 'cloudy',
        'flurries': 'partlycloudy',
        'fog': 'cloudy',
        'hazy': 'cloudy',
        'mostlycloudy': 'cloudy',
        'mostlysunny': 'partlycloudy',
        'partlycloudy': 'partlycloudy',
        'partlysunny': 'partlycloudy',
        'sleet': 'snow',
        'rain': 'rain',
        'snow': 'snow',
        'sunny': 'clear',
        'tstorms': 'thunderstorms',
        'unknown': 'unknown',
      };

      var parseValue = function (value, data) {

        var split = value.split('.'),
          obj = data;

        if (split.length === 0) {
          return '?';
        }


        split.forEach(function (v) {
          if (obj === undefined) {
            return;
          }

          if (obj[v] === undefined) {
            obj = undefined;
            return;
          }

          obj = obj[v];
        });

        return obj || '?';

      };

      var parseWeather = function () {
        $scope.time = datetime.get();
        var tod = ($scope.time.is.night) ? 'night' : 'day';

        var data = weather.get($scope.device);

        $scope.current = data._weather;
        $scope.forecast = data._forecast;
        $scope.moon = data._moon;
        $scope.alerts = data._alerts;

        if ($scope.type === 'icon') {
          var day = parseValue($scope.value, $scope);

          if (day.icon === undefined) {
            $scope.icon_class = 'day_unknown';
            $element[0].className = 'day_unknown';
            return;
          }

          var icon = $scope.icons[day.icon];
          if (icon === undefined) {
            $element[0].className = 'day_unknown';
            $scope.icon_class = 'day_unknown';
            return;
          }

          $element[0].className = tod + '_' + icon;
          $scope.icon_class = tod + '_' + icon;
          return;
        }

        $scope.parsed = parseValue($scope.value, $scope.weather);
      };

      $interval(parseWeather, (1000));
      $transclude($scope, function(transEl) {
        $element.append(transEl);
      });

      //getTime();
      //getWeather();
    },
    //template: '<div ng-class="icon_class" ng-transclude></div>',
    //replace: true,
  };

});
