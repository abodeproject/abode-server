#!/usr/bin/env python

import os
import sys
import json
import time
import fcntl
import signal
import logging
from subprocess import Popen, PIPE
from threading import Timer


class NoDisplayDevice(Exception): pass
class NoX11Display(Exception): pass
class DisplayTimeout(Exception): pass

class Display():
  events = ['RawTouchBegin', 'RawButtonPress']
  display_env = os.environ

  def __init__(self, dev=None, display=':0', wake_percent=100, wake_timer=7200, user=None):
    self.log = logging.getLogger('abode.display')
    self.dev = dev
    self.display = display
    self.wake_percent = wake_percent
    self.wake_timer = wake_timer
    self.user = user
    self._stopping = False
    self.started = False
    self.last_check = 0

    #If no display device specified, try to detect it
    if self.dev is None:
      devs = self.get_devs()
      if len(devs) == 0:
        raise NoDisplayDevice()

      self.dev = devs[0]
      self.log.info("Detected display device: %s", self.dev)

    self._base_path = '/sys/class/backlight/' + self.dev

    if not os.path.exists(self._base_path):
      raise NoDisplayDevice('%s not found' % self.dev)

    self._max_path = self._base_path + '/max_brightness'
    self._path = self._base_path + '/brightness'
    self.max_brightness()
    self.timer = None
    self.proc = None
    self.brightness = self.get_brightness()
    self.checking = False
    self.changing = False

  def get_devs(self):
    return os.listdir('/sys/class/backlight')

  def max_brightness(self):
    fh = open(self._max_path)
    self.max = int(fh.read())
    fh.close()

    return self.max

  def set_brightness(self, percent):
    self.changing = True

    if self.max is None:
      self.max_brightness()

    if percent > 100:
      percent = 100

    self.log.debug('Setting display brightness to %s%%' % percent)

    value = int((float(percent) / 100.0) * self.max)
    if value > self.max:
      value = self.max

    self.brightness = value

    #Popen(['set_brightness', self.dev, str(value)])
    fh = open(self._path, 'w')
    fh.write(str(value))
    fh.close()

    time.sleep(1)
    self.changing = False

  def get_brightness(self):
    self.log.debug('Getting display brightness')
    fh = open(self._path)
    brightness = int(fh.read())
    fh.close()

    return brightness

  def sleep(self):
    self.set_brightness(0)

  def wake(self):
    self.set_brightness(self.wake_percent)

  def _cleanup(self, signal, frame):
    self._stopping = True
    self.log.info('Stopping event watch')
    os.close(self.checker_fd)

    if self.proc is not None and self.proc.returncode is None:
      self.proc.kill()

    if self.timer is not None:
      if self.timer is not None:
        self.timer.cancel()
      self.set_brightness(100)
      if signal != 0:
        sys.exit(1)

  def checker(self, signal, frame):
    if self.checking or self.changing:
      return

    self.checking = True
    current_brightness = self.get_brightness()

    if current_brightness != self.brightness and current_brightness > 0 and self.brightness == 0:
      self.log.info('Display not at expected level, setting timer to correct')

      #Reset the timer is set
      if self.timer is not None:
        self.log.debug('Cancelling timer')
        self.timer.cancel()

      self.log.debug('Starting timer (%sm)' % int(self.wake_timer * .1 / 60))
      self.timer = Timer(int(self.wake_timer * .1), self.sleep)
      self.timer.start()

    time.sleep(1)
    self.checking = False

  def start(self):
    if self._stopping:
      return

    self.started = True

    self.log.info("Starting event watch")
    self.display_env['DISPLAY'] = self.display
    if self.user is not None:
      cmd = ['sudo', '-u', self.user, 'DISPLAY=%s' % self.display, 'xinput', 'test-xi2', '--root']
    else:
      cmd = ['xinput','test-xi2', '--root']

    self.proc = Popen(cmd, stdout=PIPE, stderr=PIPE, env=self.display_env)

    time.sleep(2)
    if self.proc.poll() is not None:
      self._cleanup(0,0)
      raise NoX11Display(self.proc.stderr.read())

    self.log.info("Event watch started")

  def monitor(self):
    signal.signal(signal.SIGINT, self._cleanup)
    signal.signal(signal.SIGTERM, self._cleanup)
    signal.signal(signal.SIGIO, self.checker)

    self.checker_fd = os.open(self._base_path,  os.O_RDONLY)
    fcntl.fcntl(self.checker_fd, fcntl.F_SETSIG, 0)
    fcntl.fcntl(self.checker_fd, fcntl.F_NOTIFY, fcntl.DN_MODIFY | fcntl.DN_CREATE | fcntl.DN_MULTISHOT)

    self.start()

    while True:
      if self.proc.poll() is not None:
        self.start()

      line = self.proc.stdout.readline()

      event_match = filter(lambda x: x in line, self.events)
      if len(event_match) == 0:
        continue

      #Reset the timer is set
      if self.timer is not None:
        self.log.debug('Cancelling timer')
        self.timer.cancel()

      self.brightness = self.get_brightness()
      if self.brightness == 0:
        self.wake()

      self.log.debug('Starting timer (%sm)' % int(self.wake_timer / 60))
      self.timer = Timer(self.wake_timer, self.sleep)
      self.timer.start()

  def wait_for_display(self, max_wait=10):
    self.display_env['DISPLAY'] = self.display

    if self.user is not None:
      cmd = ['sudo', '-u', self.user, 'DISPLAY=%s' % self.display, 'xdpyinfo']
    else:
      cmd = ['xdpyinfo']

    wait_count = 0

    while True:
      wait_count = wait_count + 1
      proc = Popen(cmd, stdout=PIPE, stderr=PIPE, env=self.display_env)
      code = proc.wait()
      if proc.returncode == 0:
        break

      if wait_count >= max_wait:
        raise DisplayTimeout('Timeout waiting for display to become available')

      self.log.debug('Waiting for display to become available')
      time.sleep(10)

    self.timer = Timer(self.wake_timer, self.sleep)
    self.timer.start()


if __name__ == "__main__":
  logging.basicConfig(level=logging.DEBUG)

  wait_count = 0

  if len(sys.argv) > 1:
    user = sys.argv[1]
  else:
    user = None
  display = Display(user=user)

  display.wait_for_display(10)

  display.monitor()
