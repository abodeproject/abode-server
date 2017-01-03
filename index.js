var abode = require('./abode');

var config = {
	'path': process.env.ABODE_CONFIG,
	'url': process.env.ABODE_URL,
	'mode': process.env.ABODE_MODE,
	'name': process.env.ABODE_NAME,
	'debug': process.env.ABODE_DEBUG,
	'database': {
		'server': process.env.ABODE_DB_SERVER,
		'database': process.env.ABODE_DB_DATABASE,
	},
	'web': {
		'address': process.env.ABODE_WEB_ADDRESS,
		'port': process.env.ABODE_WEB_PORT,
		'access_log': process.env.ABODE_ACCESS_LOGS
	}
};

abode.init(config);
