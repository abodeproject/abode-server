# Abode
## About
Abode is a home automation controller primarily focusing on Insteon technology but is plugable so it can support other technologies.  Abode came about because of a strong distrust of the "Cloud" for serving home automation services.  Abode can still interface with those services because that is simply the reality of the landscape today.  Abode can run on a Raspberry Pi with a Display and can provide a dashboard for viewing and controlling your home.  Add multiple displays/controllers and they can view/controll each other.

## Support Hardware
The Abode software can run on Raspberry Pi's with Pi Displays or any computer that can run NodeJS applications.  Additionally, it currently supports the following home automation technologies and other services.
* Insteon (PLM)
* Insteon (Hub cloud api)
* Z-Wave (work in progress)
* Synology Surveillance Station (work in progress)
* Lutron Caseta
* MQTT
* SSDP
* IFTTT
* RadioThermostat
* Wunderground
* Network Security Cameras

## Requirements
* MongoDB
* NodeJS

## Installation
Clone this repo and then follow the below intructions
```
$ cd abode-server
$ npm install
```
Npm will install node modules.  Some development libraries may be required to successfully install some modules like Z-Wave or SSDP.
## Configuration as a Server
Within the `src/` of the application folder, create a `config.yaml` file.  Set the `mode` to `server` and setup the database configuration:
```
mode: server
database:
  server: localhost
  database: abode-dev
```

## Configuration as a Device
The default behavior of abode-server is to start as a device so no special configuration is needed.  A device can be configured with various sensors and be added to an existing Abode server like any other smart home device.  These configurations should be done through the server portion.

## Authenticating
The default behavior is to allow requests from localhost.  This should get you up and running quickly.  This can be disabled by setting the following in the configuration file:
```
allow_networks:
  -
```
Additionally, during the first start of the application a new `admin` user will be created.  You will see in the logs a messages similar to the following:
```
[2018-01-06 08:37:35.159] [INFO] auth - Created admin user: admin:0387391caf30ea13a078186008ed7898
```

## Development
Grunt can be used for development.  It will start the server and watch for changes and reload when needed.  It will also run jshint so things stay pretty.

## API Documentation
All API is auto generated using apidoc syntax and can be viewed at the `/apidoc` path of the running application.  A markdown version is also available (here)[apidoc.md].

## Future Plans
* Use Bower for client JS (seriously, why do I include vendor libs)
* Docker Image
* Use Node's cluster functionality
* Move to etcd from mongo
* Server-less installation (just pass in etcd via browser or even use discovery and go)
* Client SSL for authentication
* API Tokens
* Move to Ansible for Pi configuration
* Boot to Abode? PXE Boot to a browser
