'use strict';


var q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('abode.triggers.conditions');

var abode = require('../abode');
var log,
  abode,
  orCheck,
  andCheck;

var lookupValue = function (key) {
  /*
  Given a dot separated string, lookup the method/property across providers
  */
  var keys,
    lookupObj = abode.providers;

  if (typeof(key) !== 'string') {
    return key;
  }

  //Split the key by a dot
  keys = key.split('.');
  switch (keys[0]) {
    case 'providers':
      lookupObj = abode.providers;
      break;
    case 'devices':
      lookupObj = abode.devices.by_name();
      break;
    case 'rooms':
      lookupObj = abode.rooms.by_name();
      break;
    default:
      return key;
  }

  //Shift the first item from the array of keys
  keys.shift();

  var scope = lookupObj;

  //Loop through each key and lookup against the providers (lookupObj)
  keys.forEach(function (key) {
    log.debug('Looking up key:', key);
    if (lookupObj !== undefined && lookupObj[key] !== undefined) {
      //If the key was found, set the lookupObj to that key
      scope = lookupObj;
      lookupObj = lookupObj[key];
    } else {
      //Otherwise set lookupObj to undef
      lookupObj = undefined;
    }
  });

  //If lookupObj is undefined, return undefined
  if (lookupObj === undefined) {
    return key;
  }

  //If the lookupObj has a handler property which is a function call and return the response
  if (lookupObj instanceof Function) {
    return lookupObj.apply(scope);

  //Otherwise return the value
  } else {
    return lookupObj;
  }
};

var conditionCheck = function (condition) {

  var key,
    value,
    validators,
    expanded = {},
    defer = q.defer();

  log.debug('Processing condition: %s %s %s', condition.key, condition.condition, condition.lookup);
  //Setup our validator functions
  validators = {
    'eq': function (left, right) { return (String(left) === String(right)); },
    'gt': function (left, right) { return (Number(left) > Number(right)); },
    'ge': function (left, right) { return (Number(left) >= Number(right)); },
    'lt': function (left, right) { return (Number(left) < Number(right)); },
    'le': function (left, right) { return (Number(left) <= Number(right)); },
    'ne': function (left, right) { return (String(left) !== String(right)); },
  };

  //Assign the condition check function
  expanded.check = validators[condition.condition];

  //Function to validate our key and value
  var validate = function () {
    //If we have any undefined, fail the condition
    if (expanded.key === undefined || expanded.check === undefined || expanded.value === undefined) {
      log.debug('Failed to expand condition:', expanded);
      return false;
    }

    var result = expanded.check(expanded.key, expanded.value);
    defer.resolve(result);
    log.debug('Expanded: %s %s %s is %s', expanded.key, condition.condition, expanded.value, result);
  };

  //Function to lookup our value
  var value_lookup = function () {
    log.debug('Looking up condition value: ', condition.lookup);
    value = lookupValue(condition.lookup);
    if (value && value.then && value.then instanceof Function) {
      value.then(function (value) {
        expanded.value = value;
        validate();
      }, function () {
        validate();
      });
    } else {
      expanded.value = value;
      validate();
    }
  };

  //Function to lookup our key
  var key_lookup = function () {
    log.debug('Looking up condition key: ', condition.key);
    key = lookupValue(condition.key);
    if (key && key.then && key.then instanceof Function) {
      key.then(function (key) {
        expanded.key = key;
        value_lookup();
      }, function () {
        value_lookup();
      });
    } else {
      expanded.key = key;
      value_lookup();
    }
  };

  //Start by looking up our key
  key_lookup();

  //Return our promise
  return defer.promise;
};

orCheck = function (conditions) {
  var condition_defers = [],
    defer = q.defer(),
    response = false;

  log.debug('Processing or conditions: ', conditions);
  conditions.forEach(function (condition) {
    var c_defer = q.defer();
    condition_defers.push(c_defer.promise);

    //Process any nested AND conditions
    if (condition.and instanceof Array) {
      andCheck(condition.and).then(function (r) {
        response = (r) ? true : response;
        c_defer.resolve();
      });
        return;
    }

    //Process any nested OR conditions
    if (condition.or instanceof Array) {
      orCheck(condition.or).then(function (r) {
        response = (r) ? true : response;
        c_defer.resolve();
      });
        return;
    }

    //Process the condition
    log.debug('Checking or condition: ', condition);
    conditionCheck(condition).then(function (r) {
      response = (r) ? true : response;
      c_defer.resolve();
    }, function () {
      log.debug('Failed to resolve condition: ', condition);
    });

  });

  //Once all our condition defers are complete, resolve with our response
  q.allSettled(condition_defers).then(function () {
    defer.resolve(response);
  });

  return defer.promise;
};

andCheck = function (conditions) {
  var condition_defers = [],
    defer = q.defer(),
    response = true;

  log.debug('Processing and conditions: ', conditions);
  conditions.forEach(function (condition) {
    var c_defer = q.defer();
    condition_defers.push(c_defer.promise);

    //Process any nested AND conditions
    if (condition.and instanceof Array) {
      andCheck(condition.and).then(function (r) {
        response = (r) ? r : false;
        c_defer.resolve();
      });
        return;
    }

    //Process any nested OR conditions
    if (condition.or instanceof Array) {
      orCheck(condition.or).then(function (r) {
        response = (r) ? r : false;
        c_defer.resolve();
      });
        return;
    }

    //Process the condition
    log.debug('Checking and condition: ', condition);
    conditionCheck(condition).then(function (r) {
      response = (r) ? r : false;
      c_defer.resolve();
    }, function () {
      log.debug('Failed to resolve condition: ', condition);
    });
  });

  //Once all our condition defers are complete, resolve with our response
  q.allSettled(condition_defers).then(function () {
    defer.resolve(response);
  });

  return defer.promise;
};

var checkConditions = function (conditions) {
  var defer = q.defer();

  log.debug('Checking conditions: ', conditions);
  //If no conditions passed, return true
  if (conditions === undefined || (conditions instanceof Array !== true) || conditions.length === 0) {
    defer.resolve(true);
    return defer.promise;
  }

  return orCheck(conditions);
};

module.exports = {
  'check': checkConditions
};
