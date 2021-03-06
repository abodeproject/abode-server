'use strict';


var q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('triggers.conditions');

var abode = require('../abode');
var log,
  abode,
  orCheck,
  andCheck;

var lookupKey = function (object, key) {
  var parts = key.split('.');
  var lookupObj = object;
  object = undefined;

  parts.forEach(function (part) {
    log.debug('Looking up part:', part);
    if (lookupObj === undefined) {
      return;
    }
    if (lookupObj[part]) {
      lookupObj = lookupObj[part];
    } else {
      log.debug('Failed to lookup part:', part);
      lookupObj = undefined;
    }
  });


  if (lookupObj === undefined) {
    return key;
  }

  return lookupObj;
};

var lookupValue = function (type, object, key) {
  /*
  Given a dot separated string, lookup the method/property across providers
  */
  var scope,
    lookupObj;

  switch (type) {
    case 'devices':
      lookupObj = abode.devices.by_name();
      break;
    case 'rooms':
      lookupObj = abode.rooms.by_name();
      break;
    case 'scenes':
      lookupObj = abode.scenes.by_name();
      break;
    case 'pins':
      lookupObj = abode.auth.pins_by_name();
      break;
    case 'timeofday':
      return Number(key);
    case 'string':
      return String(key);
    case 'number':
      return Number(key);
    case 'boolean':
      return (key === 'true' || key === true || key === 1);
    default:
      var parts = type.split('.');
      lookupObj = abode.providers;
      object = undefined;

      parts.forEach(function (part) {
        log.debug('Looking up part:', part);
        if (lookupObj === undefined) {
          return;
        }
        if (lookupObj[part]) {
          lookupObj = lookupObj[part];
        } else {
          log.debug('Failed to lookup part:', part);
          lookupObj = undefined;
        }
      });


      if (lookupObj === undefined) {
        return key;
      }
  }

  if (object !== undefined) {
    log.debug('Object lookup:', object);
    scope = lookupObj[object];
    lookupObj = lookupObj[object];

    if (lookupObj === undefined) {
      return undefined;
    }

    lookupObj = lookupKey(scope, key);
  } else {

    scope = lookupObj;
    lookupObj = lookupKey(scope, key);
  }


  //If the lookupObj has a handler property which is a function call and return the response
  if (lookupObj instanceof Function) {
    return lookupObj.apply(scope);

  //Otherwise return the value
  } else {
    return lookupObj;
  }
};

/*
var lookupValue = function (key) {
  /*
  Given a dot separated string, lookup the method/property across providers
  */
/*
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
      log.debug('Found key:', lookupObj[key]);
      //If the key was found, set the lookupObj to that key
      scope = lookupObj;
      lookupObj = lookupObj[key];
    } else {
      log.debug('Could not find key:', key, lookupObj);
      //Otherwise set lookupObj to undef
      lookupObj = undefined;
    }
  });

  //If lookupObj is undefined, return undefined
  if (lookupObj === undefined) {
    return;
  }

  //If the lookupObj has a handler property which is a function call and return the response
  if (lookupObj instanceof Function) {
    return lookupObj.apply(scope);

  //Otherwise return the value
  } else {
    return lookupObj;
  }
};
*/

var conditionCheck = function (condition) {

  var key,
    value,
    validators,
    expanded = {},
    defer = q.defer();

  log.debug('Processing condition: %s %s %s', condition.left_type, condition.condition, condition.right_type);
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
      defer.reject();
      return false;
    }

    var left_condition = [];
    var right_condition = [];
    if (condition.left_type !== undefined) {left_condition.push(condition.left_type);}
    if (condition.left_object !== undefined) {left_condition.push(condition.left_object);}
    if (condition.left_key !== undefined) {left_condition.push(condition.left_key);}
    if (condition.right_type !== undefined) {right_condition.push(condition.right_type);}
    if (condition.right_object !== undefined) {right_condition.push(condition.right_object);}
    if (condition.right_key !== undefined) {right_condition.push(condition.right_key);}
    left_condition = left_condition.join('.');
    right_condition = right_condition.join('.');

    var result = expanded.check(expanded.key, expanded.value);
    var message = left_condition + ' (' + expanded.key + ') ' + condition.condition + ' ' +  right_condition + ' (' + expanded.value + ')';
    defer.resolve({'message': message, 'matches': result});
    log.debug('Expanded: %s (%s) %s %s (%s) is %s', left_condition, expanded.key, condition.condition, right_condition, expanded.value, result);
  };

  //Function to lookup our value
  var value_lookup = function () {
    log.debug('Looking up condition value: ', condition.right_type, condition.right_object, condition.right_key);
    value = lookupValue(condition.right_type, condition.right_object, condition.right_key);
    //value = lookupValue(condition.lookup);
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
    log.debug('Looking up condition key: ', condition.left_type, condition.left_object, condition.left_key);
    key = lookupValue(condition.left_type, condition.left_object, condition.left_key);
    //key = lookupValue(condition.key);
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

  log.debug('Processing OR conditions: ', conditions);
  conditions.forEach(function (condition) {
    var c_defer = q.defer();
    condition_defers.push(c_defer.promise);

    //Process any nested AND conditions
    if (condition.and instanceof Array && condition.and.length > 0) {
      andCheck(condition.and).then(function (r) {
        response = (r.matches) ? true : response;
        r.name = condition.name;
        c_defer.resolve(r);
      }, function (err) { c_defer.reject(err); });
        return;
    }

    //Process any nested OR conditions
    if (condition.or instanceof Array && condition.or.length > 0) {
      orCheck(condition.or).then(function (r) {
        response = (r.matches) ? true : response;
        r.name = condition.name;
        c_defer.resolve(r);
      }, function (err) { c_defer.reject(err); });
        return;
    }

    //Process the condition
    log.debug('Checking OR condition: ', condition);
    conditionCheck(condition).then(function (r) {
      response = (r.matches) ? true : response;
      c_defer.resolve(r);
    }, function (err) {
      log.debug('Failed to resolve condition: ', condition);
      c_defer.reject(err);
    });

  });

  //Once all our condition defers are complete, resolve with our response
  q.allSettled(condition_defers).then(function (conditions) {
    defer.resolve({'message': 'Matches Any', 'conditions': conditions, 'matches': response});
  });

  return defer.promise;
};

andCheck = function (conditions) {
  var condition_defers = [],
    defer = q.defer(),
    response = true;

  log.debug('Processing AND conditions: ', conditions);
  conditions.forEach(function (condition) {
    log.debug('Processing condition: ', condition);
    var c_defer = q.defer();
    condition_defers.push(c_defer.promise);

    //Process any nested AND conditions
    if (condition.and instanceof Array && condition.and.length > 0) {
      andCheck(condition.and).then(function (r) {
        response = (r.matches === false) ? false : response;
        r.name = condition.name;
        c_defer.resolve(r);
      }, function (err) { response = false; c_defer.reject(err); });
        return;
    }

    //Process any nested OR conditions
    if (condition.or instanceof Array && condition.or.length > 0) {
      orCheck(condition.or).then(function (r) {
        response = (r.matches === false) ? false : response;
        r.name = condition.name;
        c_defer.resolve(r);
      }, function (err) { response = false; c_defer.reject(err); });
        return;
    }

    //Process the condition
    log.debug('Checking AND condition: ', condition);
    conditionCheck(condition).then(function (r) {
      response = (r.matches === false) ? false : response;
      c_defer.resolve(r);
    }, function (err) {
      response = false;
      log.debug('Failed to resolve condition: ', condition);
      c_defer.reject(err);
    });
  });

  //Once all our condition defers are complete, resolve with our response
  q.allSettled(condition_defers).then(function (conditions) {
    defer.resolve({'message': 'Matches All', 'conditions': conditions, 'matches': response});
  });

  return defer.promise;
};

var checkConditions = function (conditions, match_all) {
  var defer = q.defer();

  log.debug('Checking conditions: ', conditions);
  //If no conditions passed, return true
  if (conditions === undefined || (conditions instanceof Array !== true) || conditions.length === 0) {
    log.debug('No conditions to check');
    defer.resolve({'matches': true, 'message': 'No conditions to check'});
    return defer.promise;
  }

  if (match_all === true) {
    return andCheck(conditions);
  }

  return orCheck(conditions);
};

module.exports = {
  'check': checkConditions
};
