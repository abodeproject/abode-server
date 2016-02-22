$packages = [
  'git',
  'xserver-xorg',
  'xinit',
  'tmux',
  'mongodb-clients',
  'mongodb-server',
  'rpi-update',
  'apache2',
  'omxplayer',
  'gconf-service',
  'libgtk2.0-0',
  'libgnome-keyring0',
  'libnspr4',
  'libnspr4-0d',
  'libnss3',
  'libxss1',
  'xdg-utils',
]

$service = [
  'mongodb',
  'apache2',
]

package {$packages:
  ensure => present,
}

service {$services:
  ensure => running,
  enable => true,
  require => Package[$packages],
}

