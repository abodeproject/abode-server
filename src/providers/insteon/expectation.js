'use strict';

var q = require('q'),
  logger = require('log4js'),
  log = logger.getLogger('insteon.expectation');

var EXPECTATION_TIMEOUT = 'Timeout waiting for expectation to be met: ';
var EXPECTATION_RESOLVED = 'Expectation resolved: ';

var Expectation = function (modem) {
	this.modem = modem;
	this.defer = q.defer();
	this.is_met = false;
};

Expectation.prototype.resolve = function (message) {
    log.debug(EXPECTATION_RESOLVED + this.command);
    this.is_met = true;
    this.modem.expectations.splice(this.modem.expectations.indexOf(this), 1);
    this.defer.resolve(message);

};

Expectation.prototype.timeout = function () {
	if (this.is_met) {
		return;
	}
	log.warn(EXPECTATION_TIMEOUT + this.command);
	this.defer.reject({'status': 'failed', 'message': EXPECTATION_TIMEOUT + this.command});
	this.modem.expectations.splice(this.modem.expectations.indexOf(this), 1);
};

module.exports = Expectation;