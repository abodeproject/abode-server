
var Q = require('q'),
  Message = require('./message'),
  logger = require('log4js'),
  log = logger.getLogger('insteon.scene');

var Scene = function (insteon, config, name) {
  'use strict';

  var self = this;

  self.name = name;
  self.id = parseInt(config.address.split('.')[2], 16);
  self.config = Object.assign({}, config);
  self.insteon = insteon;
  self.title = self.name + ' (' + self.config.address + ')';

  var matches = self.insteon.scenes.filter(function (scene) {
    return (scene.config.address === config.address);
  });

  if (matches.length === 0) {
    self.insteon.scenes.push(self);
  } else {
    matches[0].update();
  }
};

Scene.prototype.update = function () {
  return this.insteon.update(this);
};

Scene.prototype.add_member = function (member, config) {
  'use strict';

  var self = this,
    link_timer,
    scene_member,
    wait_for_link,
    defer = Q.defer();

  // Remove modem from linking mode
  var cleanup_modem = function () {
    var defer = Q.defer();

    log.info('Cleaning up modem linking');
    self.insteon.cancel_all_linking().fin(defer.resolve);

    return defer.promise;
  };

  //Remove device from linking mode
  var cleanup_device = function () {
    var defer = Q.defer();

    log.info('Cleaning up device linking');
    if (scene_member) {
      scene_member.exit_linking_mode().fin(defer.resolve);
    } else {
      defer.resolve();
    }

    return defer.promise;
  };

  // Cleanup everything
  var cleanup = function () {
    var defer = Q.defer();

    log.info('Starting cleanup');

    if (wait_for_link) {
      self.insteon.modem.removeListener('MESSAGE', wait_for_link);
    }

    cleanup_modem()
      .then(cleanup_device)
      .then(function () {
        defer.resolve();
      });

    return defer.promise;
  }

  var success = function () {

    log.info('Successfully added member to scene %s: %s', self.config.address, config.address);
    self.update();
    cleanup().then(defer.resolve);
  };

  var failure = function (msg) {
    log.error(msg);
    self.update();
    cleanup().then(defer.reject);
  };

  wait_for_link = function (message) {
    setTimeout(function () {
      clearTimeout(link_timer);
      success();
    }, 2000);
  };

  var device_linking = function () {
    self.insteon.modem.on('linked', wait_for_link);

    log.info('Putting device into linking mode: %s:%s', config.address, config.button);
    scene_member.enter_linking_mode(config.button).then(function () {
      link_timer = setTimeout(failure.bind(undefined, 'Timeout waiting for linking: %s', config.address), 10 * 1000);

    }, failure.bind(undefined, 'Failed to put scene member into linking mode'));
  };

  var modem_linking = function (device) {
    scene_member = device;

    log.info('Putting modem into linking mode: %s', self.config.address);
    self.insteon.start_all_linking({'group': self.id, 'controller': true}).then(device_linking, failure.bind(undefined, 'Failed to put modem in linking mode'));
  };

  var get_device = function () {
    log.info('Getting scene member: %s', config.address);
    self.insteon.get_device(config.address).then(modem_linking, failure.bind(undefined, 'Failed to get scene member: ' + config.address));
  }

  get_device();

  return defer.promise;
};

Scene.prototype.update_member = function (member, config) {
  'use strict';

  var self = this,
    scene_member,
    defer = Q.defer();


  var success = function () {

    log.info('Successfully updated member in scene %s: %s', self.config.address, config.address);
    self.update();
    defer.resolve();
  };

  var failure = function (msg) {
    log.error(msg);
    self.update();
    defer.reject();
  };

  var find_record = function (database) {
      log.info('Scene member database loaded: %s', member);

      var matches = database.filter(function (record) {
        return (record.controller)
      });
      failure();
  };

  var device_database = function (device) {
    scene_member = device;

    scene_member.load_database().then(find_record, failure.bind(undefined, 'Failed load database: ' + member))
  };

  var get_device = function () {
    log.info('Getting scene member: %s', config.address);
    self.insteon.get_device(member).then(device_database, failure.bind(undefined, 'Failed to get scene member: ' + member));
  }

  get_device();

  return defer.promise;
};

Scene.prototype.delete_member = function (member, config) {
  'use strict';

  var self = this,
    link_timer,
    scene_member,
    wait_for_unlink,
    defer = Q.defer();

  // Remove modem from linking mode
  var cleanup_modem = function () {
    var defer = Q.defer();

    log.info('Cleaning up modem linking');
    self.insteon.cancel_all_linking().fin(defer.resolve);

    return defer.promise;
  };

  //Remove device from linking mode
  var cleanup_device = function () {
    var defer = Q.defer();

    log.info('Cleaning up device linking');
    if (scene_member) {
      scene_member.exit_linking_mode().fin(defer.resolve);
    } else {
      defer.resolve();
    }

    return defer.promise;
  };

  // Cleanup everything
  var cleanup = function () {
    var defer = Q.defer();

    log.info('Starting cleanup');

    if (wait_for_unlink) {
      self.insteon.modem.removeListener('MESSAGE', wait_for_unlink);
    }

    cleanup_modem()
      .then(cleanup_device)
      .then(function () {
        defer.resolve();
      });

    return defer.promise;
  }

  var success = function () {

    log.info('Successfully added member to scene %s: %s', self.config.address, config.address);
    self.update();
    cleanup().then(defer.resolve);
  };

  var failure = function (msg) {
    log.error(msg);
    self.update();
    cleanup().then(defer.reject);
  };

  wait_for_unlink = function (message) {
    setTimeout(function () {
      clearTimeout(link_timer);
      success();
    }, 2000);
  };

  var device_linking = function () {
    self.insteon.modem.on('linked', wait_for_unlink);

    log.info('Putting device into unlinking mode: %s:%s', member, config.button);
    scene_member.enter_unlinking_mode(config.button).then(function () {
      link_timer = setTimeout(failure.bind(undefined, 'Timeout waiting for unlinking: %s', member), 10 * 1000);

    }, failure.bind(undefined, 'Failed to put scene member into unlinking mode'));
  };

  var modem_linking = function (device) {
    scene_member = device;

    log.info('Putting modem into unlinking mode: %s', self.config.address);
    self.insteon.start_all_linking(self.id, {'controller': 'delete'}).then(device_linking, failure.bind(undefined, 'Failed to put modem in unlinking mode'));
  };

  var get_device = function () {
    log.info('Getting scene member: %s', config.address);
    self.insteon.get_device(member).then(modem_linking, failure.bind(undefined, 'Failed to get scene member: ' + member));
  }

  get_device();

  return defer.promise;
};

module.exports = Scene;
