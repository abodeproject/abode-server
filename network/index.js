'use strict';

var abode;
var routes;
var config;

var q = require('q');
var fs = require('fs');
var logger = require('log4js'),
  log = logger.getLogger('network'),
  exec = require('child_process').exec;;

// Build the devices object
var Network = function () {
  var defer = q.defer();

  abode = require('../abode');
  routes = require('./routes');

  log.info('Loading network module');
  abode.web.server.use('/api/network', routes);

  defer.resolve();

  return defer.promise;
};

Network.list_interfaces = function () {
  var defer = q.defer();
  var connection = {};

  var handler = function (err, stdout, stderr) {
    if (err) {
      defer.reject({'status': 'failed', 'message': stdout, 'error': stderr});
      return;
    }

    var lines = stdout.split('\n');
    var if_re = /\d+: ([^:]+): .+mtu (\S+).+state (\S+)/;
    var mac_re = /link\/ether (\S+)/;
    var ip_re = /inet (\S+) brd (\S+)/;
    var if_index = -1
    var ifaces = [];

    lines.forEach(function (line) {
      line = line.trim();

      var if_match = if_re.exec(line);
      if (if_match) {
        if (['lo', 'docker0'].indexOf(if_match[1]) >= 0) {
          return;
        }
        if_index += 1;
        ifaces[if_index] = {
          'name': if_match[1],
          'mtu': if_match[2],
          'link': (if_match[3].toLowerCase() === 'up') ? true : false
        }
        if (connection.interface === ifaces[if_index].name) {
          ifaces[if_index].essid = connection.essid;
        }
        return;
      }

      var mac_match = mac_re.exec(line);
      if (mac_match) {
        ifaces[if_index].mac = mac_match[1];
        return;
      }

      var ip_match = ip_re.exec(line);
      if (ip_match) {
        ifaces[if_index].ip = ip_match[1];
        ifaces[if_index].broadcast = ip_match[2];
        return;
      }

    });

    defer.resolve(ifaces);
  };

  var ip_addr = function () {
    exec('ip addr', handler);
  };


  //Get our current connection status
  Network.wireless_status().then(function (result) {
    connection = result;
    ip_addr();
  }, ip_addr);;

  return defer.promise;
};

Network.wireless_status = function () {
  var defer = q.defer();

  var handler = function (err, stdout, stderr) {
    if (err) {
      defer.reject({'status': 'failed', 'message': stdout, 'error': stderr});
      return;

    }

    var status = {};
    var connected = false;
    var lines = stdout.split('\n');
    var conn_re = /(\S+).+ESSID:"([^"]+)"/;

    lines.forEach(function (line) {
      var conn_match = conn_re.exec(line);
      if (conn_match) {
        connected = true;
        status.interface = conn_match[1]; 
        status.essid = conn_match[2]; 
      }
    });

    if (connected) {
      defer.resolve(status);
    } else {
      defer.reject({'status': 'not connected'});
    }

  };

  exec('iwgetid', handler);

  return defer.promise;
};

Network.list_wireless = function () {
  var defer = q.defer();
  var connection = {};

  var handler = function (err, stdout, stderr) {
    if (err) {
      defer.reject({'status': 'failed', 'message': stdout, 'error': stderr});
      return;
    }

    var lines = stdout.split('\n');
    var in_cell = false;
    var cell_index = -1;
    var cells = [];
    var cells = [];
    var essid_re = /ESSID:"([^"]+)"/
    var if_re = /^(\S+).+Scan/;
    var iface;

    lines.forEach(function (line) {
      line = line.trim();

      var if_match = if_re.exec(line);
      if (if_match) {
        iface = if_match[1];
        return;
      }
      //Check for a Cell
      if (line.toLowerCase().indexOf('cell') === 0) {
        in_cell = true;
        cell_index += 1;

        cells[cell_index] = {
          'interface': iface,
          'macaddress': line.split(' ')[4],
          'connected': false,
        };
        return;
      }

      if (line.toLowerCase().indexOf('channel') === 0 && in_cell) {
        cells[cell_index].channel = line.split(':')[2];
        return;
      }

      if (line.toLowerCase().indexOf('frequency') === 0 && in_cell) {
        cells[cell_index].frequency = line.split(':')[2];
        return;
      }

      if (line.toLowerCase().indexOf('quality') === 0 && in_cell) {
        cells[cell_index].signal = line.split('=')[2];
        return;
      }

      if (line.toLowerCase().indexOf('encryption') === 0 && in_cell) {
        cells[cell_index].encryption = (line.split(':')[1] === 'on') ? true : false;
        return;
      }

      var essid_match = essid_re.exec(line);
      if (essid_match && in_cell) {
        cells[cell_index].essid = essid_match[1];
        if (connection.essid === cells[cell_index].essid) {
          cells[cell_index].connected = true;
        }
        return;
      }
    });

    var networks = [];

    cells = cells.forEach(function (cell) {
      if (cell.essid === '' || cell.essid === undefined) {
        return;
      }

      var matches = networks.filter(function (item) { return (item.essid === cell.essid); });

      if (matches.length === 0) {
        networks.push(cell);
      }
    });

    defer.resolve(networks);
  };

  var iwlist = function () {
    exec('sudo -n /sbin/iwlist scan', handler);
  };

  //Get our current connection status
  Network.wireless_status().then(function (result) {
    connection = result;
    iwlist();
  }, iwlist);;

  return defer.promise;
};

Network.list_routes = function () {
  var defer = q.defer();

  var handler = function (err, stdout, stderr) {
    if (err) {
      defer.reject({'status': 'failed', 'message': stdout, 'error': stderr});
      return;
    }

    var routes = [];
    var route_re = /^(\S+)/;
    var via_re = /via (\S+)/;
    var dev_re = /dev (\S+)/;
    var src_re = /src (\S+)/;
    var metric_re = /metric (\S+)/;

    var lines = stdout.split('\n');
    lines.forEach(function (line) {
      var route = {};
      var route_match = route_re.exec(line);
      if (!route_match) {
        return;
      }
      route.name = route_match[1];

      var via_match = via_re.exec(line);
      if (via_match) {
        route.gateway = via_match[1];
      }

      var dev_match = dev_re.exec(line);
      if (dev_match) {
        route.interface = dev_match[1];
      }

      var src_match = src_re.exec(line);
      if (src_match) {
        route.source = src_match[1];
      }

      var metric_match = metric_re.exec(line);
      if (metric_match) {
        route.metric = metric_match[1];
      }

      routes.push(route);
    });

    defer.resolve(routes);
  }

  exec('ip route', handler);

  return defer.promise;
};

Network.connect = function (body) {
  var defer = q.defer();
  var wpa_path = '/etc/wpa_supplicant/wpa_supplicant.conf';

  var wpa_handler = function (err, stdout, stderr) {
    if (err) {
      defer.reject({'status': 'failed', 'message': stdout, 'error': stderr});
      return;
    }

    defer.resolve({'message': 'Wireless configuration updated successfully'});
  };

  var write_wpa = function (data) {
    log.debug('Writing WPA Supplicant Config: ' + wpa_path);
    fs.writeFile(wpa_path, data, function (err) {
      if (err) {
        log.error('Error writing WPA Supplicant Config: ' + wpa_path);
        defer.reject({'error': 'Error writing wpa supplicant configuration'});
        return;
      }

      exec('sudo -n systemctl restart wpa_supplicant', wpa_handler);
      exec('sudo -n ifdown ' + body.interface, function (err, stdout, stderr) {
        exec('sudo -n ifup ' + body.interface);
      });
    });
  };

  var parse_wpa = function (data) {
    log.debug('Parsing WPA Supplicant Config');
    var network_re = new RegExp('\nnetwork={[^}]+}','m');

    var network_match = network_re.exec(data);
    data = data.replace(network_re, '').trim();
    data += '\nnetwork={\n  ssid="' + body.essid + '"\n';
    if (body.secret) {
      data += '  psk="' + body.secret + '"\n';
    }
    data += '}\n';

    write_wpa(data);
  };

  var read_wpasupplicant = function () {
    log.debug('Reading existing WPA Supplicant Config');
    fs.readFile(wpa_path, 'utf8', function (err, data) {
      if (err) {
        log.error('Error reading WPA Supplicant config: ' + wpa_path);
        defer.reject({'error': 'Error reading wpa supplicant configuration'});
        return;
      }

      parse_wpa(data);
    });
  }

  if (!body.essid) {
    defer.reject({'error': 'No ESSID Specified'});
    return defer.promise;
  }

  read_wpasupplicant();

  return defer.promise;
};

Network.status = function () {
  var defer = q.defer();
  var linked = [];
  var defaults = [];
  var status = {};

  Network.list_interfaces().then(function (interfaces) {
    linked = interfaces.filter(function (iface) { return (iface.link); });

    if (linked.length === 0) {
      status.connected = false;
      defer.resolve(status);
      return;
    }

    Network.list_routes().then(function (routes) {
      defaults = routes.filter(function (route) { return route.name.toLowerCase() === 'default'; });

      if (defaults.length === 0) {
        status.connected = false;
        defer.resolve(status);
        return;
      }

      var route = defaults[0];
      var iface = linked.filter(function (iface) { return (iface.name === route.interface); });
      status.connected = true;

      if (iface.length !== 0) {
        status.ip = iface[0].ip;
        status.interface = iface[0].name;
        status.essid = iface[0].essid;
        status.gateway = route.gateway;
      }
      defer.resolve(status);
    }, function (err) {
      defer.reject(err);
    })
  }, function (err) {
    defer.reject(err);
  });

  return defer.promise;
};

module.exports = Network;