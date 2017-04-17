
var q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('insteon');

var Device = function (insteon, config, name) {
    var self = this;

    self.name = name;
    self.config = Object.assign({}, config);
    self.insteon = insteon;
    self.config.database = self.config.database || {};

    var matches = self.insteon.devices.filter(function (device) {
        return (device.config.address === config.address);
    });

    if (matches.length === 0) {
        self.insteon.devices.push(self);
    } else {
        matches[0].name = name;
    }

    return self;
};

Device.prototype.ping = function (max) {
    var self = this,
        results = [],
        defer = q.defer();
    max = max || 5;

    var next = function (count) {
        setTimeout(function () {
            ping(count);
        }, 200);
    };

    var ping = function (count) {

        if (count > max) {
            defer.resolve(results);
            return;
        }

        log.info('Pinging device %s: %s', self.config.address, count);

        var report = {
            'count': count,
            'start': new Date(),
        }

        self.insteon.ping(self).then(function () {
            report.end = new Date();
            report.status = 'success';
            report.time = (report.end - report.start) / 1000;

            results.push(report);

            next(count + 1);
        }, function (err) {
            log.debug('Timeout waiting for ping');
            report.end = new Date();
            report.status = 'failed';
            report.time = (report.end - report.start) / 1000;
            report.error = err;

            results.push(report);

            next(count + 1);
        });

    }

    ping(1);

    return defer.promise;
};

Device.prototype.beep = function () {
    return this.insteon.beep(this);
};

Device.prototype.load_database = function () {
    var delta,
        db = {},
        self = this,
        offset = 0x0fff,
        defer = q.defer();
    
    var pad = function (o) {
        if (o.length < 2) {
            return '0' + o;
        }
        return o;
    }
    
    var finish = function () {
        log.info('Finished loading database');
        self.config.database_delta = delta
        self.config.database = Object.keys(db).map(function (key) { return db[key]});

        defer.resolve(self.config.database);

        self.update();
    };

    var fail = function () {
        defer.reject({'message': 'Gave up trying to get records'});
    };

    var get_record = function (attempt) {
        var offset_hi = pad((offset >> 8).toString(16)),
            offset_lo = pad((offset & 0xff).toString(16)),
            offset_str = offset_hi + '.' + offset_lo;

        // Check our attempt
        attempt = attempt || 1;
        if (attempt > 3) {
            fail();
        }

        // Get record at offset
        self.read_all_link_database(offset_str).then(function (result) {
            if (result.address === '00.00.00' || result.flags.used_before === 0) {
                finish();
                return;
            }

            var matches = self.insteon.devices.filter(function (device) {
                return (device.config.address === result.address);
            });

            if (matches.length > 0) {
                result.name = matches[0].name;
            }
            result.delta = delta;
            db[offset_str] = result;
            offset -= 8;
            setTimeout(get_record, 200);
        }, function () {
        // If failed, try again
            setTimeout(function () {
                get_record(attempt + 1);
            }, 500)
        });
    }

    // Get our database delta
    var get_delta = function () {
        self.get_all_link_database_delta().then(function (result) {
            delta = result.database_delta;
            get_record();
        }, function (err) {
            defer.reject(err)
        });
    };

    get_delta();

    return defer.promise;
};

Device.prototype.get_delta = Device.prototype.get_all_link_database_delta = function () {
    var self = this,
        defer = q.defer();
    
    log.debug('Getting database delta for device: %s', self.config.address);
    this.insteon.get_all_link_database_delta(self).then(function (response) {
        defer.resolve({'database_delta': response.database_delta});
    }, function (err) {
        defer.reject(err);
    });

    return defer.promise;
};

Device.prototype.get_record = function (offset) {
    var delta,
        self = this,
        defer = q.defer();

    var matches = self.config.database.filter(function (record) {
        return (record.id === offset);
    });
    
    if (matches.length > 0) {
        defer.resolve(matches[0]);
    } else {
        defer.reject({'message': 'Record not found, try doing a database load'});
    }

    return defer.promise;
};

Device.prototype.delete_record = function (offset) {
    var self = this,
        defer = q.defer();
    
    self.get_delta().then(function (result) {
        if (result.database_delta !== self.config.database_delta) {
            defer.reject({'message': 'Database out of sync. Perform a load first'});
            return;
        }

        self.insteon.delete_all_link_database(self, offset).then(function (result) {
            self.config.database_delta =+ 1;
            self.config.database.forEach(function (record) {
                if (record.id === offset) {
                    record.flags.used = 0;
                    record.flags.used_before = true;
                    record.flags.type = 0;
                    record.controller = false;
                    record.responder = true;
                    record.used = false;
                }
            });
            defer.resolve(result);

            self.update();
        }, function (err) {
            defer.reject(err);
        });

    }, function (err) {
        defer.reject(err);
    })
    
    return defer.promise;
};

Device.prototype.read_all_link_database = function (offset) {
    var self = this,
        defer = q.defer();

    self.insteon.read_all_link_database(self, offset).then(function (result) {
        defer.resolve(result);
    }, function (err) {
        defer.reject(err);
    });

    return defer.promise;
};

Device.prototype.update = function () {
    return this.insteon.update(this);
};

module.exports = Device;