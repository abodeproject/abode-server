$packages = [
  'git',
  'xserver-xorg',
  'xinit',
  'tmux',
  'mongodb-clients',
  'mongodb-server',
  'rpi-update',
  'apache2',
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
  enable => true
  require => Package[$packages],
}

