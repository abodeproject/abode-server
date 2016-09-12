# Abode
## About
Abode is a home automation controller primarily focusing on Insteon technology but is plugable so it can support other technologies.  Abode came about because of a strong distrust of the "Cloud" for serving home automation services.  Abode can still interface with those services because that is simply the reality of the landscape today.  Abode can run on a Raspberry Pi with a Display and can provide a dashboard for viewing and controlling your home.  Add multiple displays/controllers and they can view/controll each other.

## Support Hardware
The Abode software can run on Raspberry Pi's with Pi Displays or any computer that can run NodeJS applications.  Additionally, it currently supports the following home automation technologies and other services.
* Insteon (PLM)
* Insteon (Hub cloud api)
* IFTTT
* RadioThermostat
* Wunderground
* Network Security Cameras

## Requirements
* MongoDB
* NodeJS

## Installation
Clone the Git repo locall and install using npm:
```
$ git clone https://gitlab.com/sneel/abode.git
$ cd abode
$ npm install
```
Npm will install node modules and also bower components.
## Configuration
Within the root of the application folder, create `config.ini` file.  Specify the database configuration and it's also a good idea to specify your local network for easier access within your network:
```
allow_networks[] = 127.0.0.1
allow_networks[] = 192.168.0.0/24

[database]
database = abode
server = localhost
```

## Development
Grunt can be used for development.  It will start the server and watch for changes and reload when needed.  It will also run jshint so things stay pretty.

## API Documentation
All API is auto generated using apidoc syntax and can be viewed at the `/apidoc` path of the running application.  A markdown version is also available (here)[apidoc.md].