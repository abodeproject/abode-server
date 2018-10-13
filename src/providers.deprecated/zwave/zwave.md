## API

Start by loading the addon with `require`:
```js
var OZW = require('openzwave-shared');
```
and then create a new instance of the addon:
```js
var zwave = new OZW();
```
You can also pass in an optional object specifying any desired option overrides:
```js
var zwave = new OZW({
	Logging: false,		// disable file logging (OZWLog.txt)
    ConsoleOutput: true // enable console logging
});
```
The default options are specified in `config/options.xml`. Please refer
[to the full list of OpenZWave options](https://github.com/OpenZWave/open-zwave/wiki/Config-Options)
for all the available options. If, for instance, you're using security devices
(e.g. door locks) then you should specify an encryption key.

The rest of the API is split into Functions and Events.  Messages from the
Z-Wave network are handled by `EventEmitter`, and you will need to listen for
specific events to correctly map the network.

### Functions

Connecting to the network:
```js
// for Linux/Mac OSX
zwave.connect('/dev/ttyUSB0');  // connect to a USB ZWave controller
zwave.disconnect('dev/ttyUSB0');// disconnect from the current connection

// for Windows, COM port #x notation is \\.\COMx
zwave.connect('\\\\.\\COM3');  // connect to a USB ZWave controller on COM3
zwave.disconnect('\\\\.\\COM3');// disconnect from the current connection on COM3
```
**Important notice**: the connect() call is asynchronous following the
node/v8 javascript paradigm.  This means that connect() will yield
control to your script *immediately*, but the underlying OpenZWave C++
library will *not be ready yet* to accept commands.
In fact, it can take some time (from a few seconds to a couple of
minutes!) to scan the ZWave network and set up its data structures.
So, be sure to register a "scan complete" callback, and after it gets called,
you can safely start issuing commands to your ZWave devices.

Modifying device state:
```js
/*
 * Set arbitrary values.
 */
// 1) by means of passing each individual ValueID constituent:
zwave.setValue(nodeid, commandclass, instance, index, value);
zwave.setValue(3,      37,           1,        0,     true); // node 3: turn on
zwave.setValue(3,      37,           1,        0,     false); // node 3: turn off
// dimmer node 5: set to 50%
zwave.setValue(5,      38,           1,        0,     50);
// 2) or by passing the valueID object (emitted by ValueAdded event):
zwave.setValue({ node_id:5, class_id: 38, instance:1, index:0}, 50);

/*
 * Turn a binary switch on/off.
 */
zwave.setNodeOn(3); // node 3: switch ON
zwave.setNodeOff(3);// node 3: switch OFF

/*
 * Set a multi-level device to the specified level (between 0-99).
 * See warning below
 */
zwave.setLevel(5, 50); // node 5: dim to 50%
```

*WARNING: setNodeOn/Off/Level _don't work reliably with all devices_*, as they are
mere aliases to the BASIC command class. Not all devices support this. Please
consult your device's manual to see if it supports this command class.
The 'standard' way to control your devices is by `setValue` which is also the
_only_ way to control multi-instance devices, such as the Fibaro FGS-221
(double in-wall 2x1,5kw relay) for example:
```js
zwave.setValue(8, 37, 1, 0, true); // node 8: turn on 1st relay
zwave.setValue(8, 37, 1, 0, false);// node 8: turn off 1st relay
zwave.setValue(8, 37, 2, 0, true); // node 8: turn on 2nd relay
zwave.setValue(8, 37, 2, 0, false);// node 8: turn off 2nd relay
```
Useful documentation on [command classes can be found on MiCasaVerde website](http://wiki.micasaverde.com/index.php/ZWave_Command_Classes)

Writing to device metadata (stored on the device itself):
```js
zwave.setNodeLocation(nodeid, location);    // arbitrary location string
zwave.setNodeName(nodeid, name);            // arbitrary name string
```

Polling a device for changes (not all devices require this):
```js
zwave.enablePoll(nodeid, commandclass, intensity);
zwave.disablePoll(nodeid, commandclass);
zwave.setPollInterval(nodeid, )
zwave.getPollInterval();
zwave.isPolled();
zwave.setPollIntensity();
zwave.getPollIntensity();
```

Association groups management:
```js
zwave.getNumGroups(nodeid);
zwave.getGroupLabel(nodeid, group);
zwave.getAssociations(nodeid, group);
zwave.getMaxAssociations(nodeid, group);
zwave.addAssociation(nodeid, group, target_nodeid);
zwave.removeAssociation(nodeid, group, target_nodeid);
```

Resetting the controller.  Calling `hardReset` will clear any associations, so use
carefully:
```js
zwave.hardReset();      // destructive! will wipe out all known configuration
zwave.softReset();      // non-destructive, just resets the chip
```

Scenes control:
```js
zwave.createScene(label); 	// create a scene and assign a label, return its numeric id.
zwave.removeScene(sceneId); // perform #GRExit
zwave.getScenes();			// get all scenes as an array
// add a zwave value to a scene
zwave.addSceneValue(sceneId, nodeId, commandclass, instance, index);
// remove a zwave value from a scene
zwave.removeSceneValue(sceneId, nodeId, commandclass, instance, index);
zwave.sceneGetValues(sceneId); // return array of values associated with this scene
zwave.activateScene(sceneId);  // The Show Must Go On...
```

ZWave network commands:
```js
zwave.healNetworkNode(nodeId, doReturnRoutes=false);
zwave.healNetwork();   // guru meditation
zwave.getNeighbors();
zwave.refreshNodeInfo(nodeid);
```

ZWave controller commands:
```js
// begin an async controller command on node1:
zwave.beginControllerCommand( "command name", highPower = false, node1_id, node2_id = null);  
// cancel controller command in progress
zwave.cancelControllerCommand();
// returns controller's node id
zwave.getControllerNodeId();
// returns static update controller node id
zwave.getSUCNodeId();
// is the OZW-managed controller the primary controller for this zwave network?
zwave.isPrimaryController();
// Query if the controller is a static update controller.
zwave.isStaticUpdateController();
// Query if the controller is using the bridge controller library.
zwave.isBridgeController();
// Get the version of the Z-Wave API library used by a controller.
zwave.getLibraryVersion();
// Get a string containing the Z-Wave API library type used by a controller
zwave.getLibraryTypeName();
//
zwave.getSendQueueCount();
```


### Configuration commands:
```js
zwave.requestAllConfigParams(nodeId);
zwave.requestConfigParam(nodeId, paramId);
zwave.setConfigParam(nodeId, paramId, paramValue, <sizeof paramValue>);
```
## Example

The test program below connects to a Z-Wave network, scans for all nodes and
values, and prints out information about the network.

**When the network has become ready**, the library will call 'scan complete'
and the script will then 1) issue a `setValue` command to set a dimmer (node 5)
at 50%, and then issue a command to begin the inclusion process for a new zwave
device. This means calling `beginControllerCommand` OR `addNode` depending on
which version of the OpenZWave API you've linked against.

Remember to hit `^C` to end the script.

```js
var ZWave = require('openzwave-shared');
var zwave = new ZWave();

var nodes = [];

zwave.on('driver ready', function(homeid) {
    console.log('scanning homeid=0x%s...', homeid.toString(16));
});

zwave.on('driver failed', function() {
    console.log('failed to start driver');
    zwave.disconnect();
    process.exit();
});

zwave.on('node added', function(nodeid) {
    nodes[nodeid] = {
        manufacturer: '',
        manufacturerid: '',
        product: '',
        producttype: '',
        productid: '',
        type: '',
        name: '',
        loc: '',
        classes: {},
        ready: false,
    };
});

zwave.on('value added', function(nodeid, comclass, value) {
    if (!nodes[nodeid]['classes'][comclass])
        nodes[nodeid]['classes'][comclass] = {};
    nodes[nodeid]['classes'][comclass][value.index] = value;
});

zwave.on('value changed', function(nodeid, comclass, value) {
    if (nodes[nodeid]['ready']) {
        console.log('node%d: changed: %d:%s:%s->%s', nodeid, comclass,
                value['label'],
                nodes[nodeid]['classes'][comclass][value.index]['value'],
                value['value']);
    }
    nodes[nodeid]['classes'][comclass][value.index] = value;
});

zwave.on('value removed', function(nodeid, comclass, index) {
    if (nodes[nodeid]['classes'][comclass] &&
        nodes[nodeid]['classes'][comclass][index])
        delete nodes[nodeid]['classes'][comclass][index];
});

zwave.on('node ready', function(nodeid, nodeinfo) {
    nodes[nodeid]['manufacturer'] = nodeinfo.manufacturer;
    nodes[nodeid]['manufacturerid'] = nodeinfo.manufacturerid;
    nodes[nodeid]['product'] = nodeinfo.product;
    nodes[nodeid]['producttype'] = nodeinfo.producttype;
    nodes[nodeid]['productid'] = nodeinfo.productid;
    nodes[nodeid]['type'] = nodeinfo.type;
    nodes[nodeid]['name'] = nodeinfo.name;
    nodes[nodeid]['loc'] = nodeinfo.loc;
    nodes[nodeid]['ready'] = true;
    console.log('node%d: %s, %s', nodeid,
            nodeinfo.manufacturer ? nodeinfo.manufacturer
                      : 'id=' + nodeinfo.manufacturerid,
            nodeinfo.product ? nodeinfo.product
                     : 'product=' + nodeinfo.productid +
                       ', type=' + nodeinfo.producttype);
    console.log('node%d: name="%s", type="%s", location="%s"', nodeid,
            nodeinfo.name,
            nodeinfo.type,
            nodeinfo.loc);
    for (comclass in nodes[nodeid]['classes']) {
        switch (comclass) {
        case 0x25: // COMMAND_CLASS_SWITCH_BINARY
        case 0x26: // COMMAND_CLASS_SWITCH_MULTILEVEL
            zwave.enablePoll(nodeid, comclass);
            break;
        }
        var values = nodes[nodeid]['classes'][comclass];
        console.log('node%d: class %d', nodeid, comclass);
        for (idx in values)
            console.log('node%d:   %s=%s', nodeid, values[idx]['label'], values[idx]['value']);
    }
});

zwave.on('notification', function(nodeid, notif) {
    switch (notif) {
    case 0:
        console.log('node%d: message complete', nodeid);
        break;
    case 1:
        console.log('node%d: timeout', nodeid);
        break;
    case 2:
        console.log('node%d: nop', nodeid);
        break;
    case 3:
        console.log('node%d: node awake', nodeid);
        break;
    case 4:
        console.log('node%d: node sleep', nodeid);
        break;
    case 5:
        console.log('node%d: node dead', nodeid);
        break;
    case 6:
        console.log('node%d: node alive', nodeid);
        break;
        }
});

zwave.on('scan complete', function() {
    console.log('====> scan complete, hit ^C to finish.');
    // set dimmer node 5 to 50%
    //zwave.setValue(5,38,1,0,50);
    zwave.setValue( {node_id:5, class_id: 38, instance:1, index:0}, 50);
    // Add a new device to the ZWave controller
    if (zwave.hasOwnProperty('beginControllerCommand')) {
      // using legacy mode (OpenZWave version < 1.3) - no security
      zwave.beginControllerCommand('AddDevice', true);
    } else {
      // using new security API
      // set this to 'true' for secure devices eg. door locks
      zwave.addNode(false);
    }
});

zwave.on('controller command', function(r,s) {
    console.log('controller commmand feedback: r=%d, s=%d',r,s);
});

zwave.connect('/dev/ttyUSB0');

process.on('SIGINT', function() {
    console.log('disconnecting...');
    zwave.disconnect('/dev/ttyUSB0');
    process.exit();
});
```

Sample output from this program:

```sh
$ nodejs test2.js
initialising OpenZWave addon (/home/ekarak/src/node-openzwave-shared/lib/../build/Debug/openzwave_shared.node)
scanning homeid=0xcafebabe...
node2: nop
node1: Zensys, Controller
node1: name="", type="Static PC Controller", location=""
node1: class 32
node1:   Basic=0
node2: nop
node2: nop
====> scan complete, hit ^C to finish.
node2: node dead
controller commmand feedback: r=4, s=0
^Cdisconnecting...
```
