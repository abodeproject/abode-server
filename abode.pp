$packages = [
  'git',
  'xserver-xorg',
  'xinit',
  'tmux',
  'mongodb-clients',
  'mongodb-server',
  'rpi-update',
]

package {$packages:
  ensure => present,
}

service {'mongodb':
  ensure => running,
  enable => true
}

