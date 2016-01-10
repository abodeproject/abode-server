#!/usr/bin/python

import sys

import os
import json
import requests
import Adafruit_DHT
from time import sleep
import RPi.GPIO as GPIO, time

GPIO.setmode(GPIO.BCM)

def getLight(PiPin):
  measurement = 0.00
  GPIO.setup(PiPin, GPIO.OUT)
  GPIO.output(PiPin, GPIO.LOW)
  sleep(.1)

  GPIO.setup(PiPin, GPIO.IN)

  while (GPIO.input(PiPin) == GPIO.LOW):
    measurement += 1

  light = ((measurement / 3000.0) * 100)
  if light > 100:
    light = 100
  light = abs(light - 100)

  return light


def read_sensors():
  humidity, temperature = Adafruit_DHT.read_retry(sensor, pin)
  temperature = temperature * 9/5.0 + 32
  light = getLight(light_pin)

  return humidity, temperature, light

def write_file(data):
  fh = open('/dev/shm/sensors.json', 'w')
  json.dump(data, fh)
  fh.close()

def start_loop():

  while True:
    try:
      humidity, temperature, light = read_sensors()
      if humidity is not None and temperature is not None and light is not None:
        temperature = round(temperature, 2)
        humidity = round(humidity, 2)
        light = round(light, 2)

        data = {"_temperature": temperature, "_humidity": humidity, "_lumens": light}
        try:
          write_file(data)
        except: 
          pass

        print "Temp: %s, Humidity %s, Light: %s%%" % (temperature, humidity, light)
#        response = requests.put("http://abode.scottneel.com:8080/api/devices/%s" % device, json.dumps(data), headers={'content-type': 'application/json'}) 
#        print response.text
      else:
        print "Failed to poll DHT22"
    except:
      print "failed"
      pass

    sleep(30)


# Parse command line parameters.
sensor_args = { '11': Adafruit_DHT.DHT11,
				'22': Adafruit_DHT.DHT22,
				'2302': Adafruit_DHT.AM2302 }
if len(sys.argv) == 4 and sys.argv[1] in sensor_args:
	sensor = sensor_args[sys.argv[1]]
	pin = sys.argv[2]
	light_pin = int(sys.argv[3])
#	device = sys.argv[4]
else:
	print 'usage: sudo ./sensors.py.py [11|22|2302] DHT_PIN LIGHT_PIN'
	print 'example: sudo ./Adafruit_DHT.py 2302 4 - Read from an AM2302 connected to GPIO #4'
	sys.exit(1)

start_loop()
sys.exit(0)

humidity, temperature = Adafruit_DHT.read_retry(sensor, pin)
temperature = temperature * 9/5.0 + 32

if humidity is not None and temperature is not None:
	data = {'temperature': round(temperature, 2), 'humidity': round(humidity, 2)}
	fh = open('/dev/shm/dht22', 'w')
	json.dump(data, fh)
	fh.close()
	print json.dumps(data)
	#print '"temperature": {0:0.1f},  "humidity": {1:0.1f}'.format(temperature, humidity)
else:
	print 'Failed to get reading. Try again!'
	sys.exit(1)
