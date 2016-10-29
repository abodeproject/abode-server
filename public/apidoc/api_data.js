define({ "api": [
  {
    "type": "delete",
    "url": "/auth",
    "title": "Logout",
    "group": "Auth",
    "version": "0.0.0",
    "filename": "./auth/routes.js",
    "groupTitle": "Auth",
    "name": "DeleteAuth"
  },
  {
    "type": "get",
    "url": "/auth",
    "title": "Get Status",
    "group": "Auth",
    "version": "0.0.0",
    "filename": "./auth/routes.js",
    "groupTitle": "Auth",
    "name": "GetAuth"
  },
  {
    "type": "get",
    "url": "/check",
    "title": "Check",
    "group": "Auth",
    "description": "<p>Assigns a device to a token and unassigns the requested device from any tokens using requested device.  Any tokens previously assigned get set to the unassigned status.</p>",
    "header": {
      "fields": {
        "Header": [
          {
            "group": "Header",
            "type": "String",
            "optional": false,
            "field": "client_token",
            "description": ""
          },
          {
            "group": "Header",
            "type": "String",
            "optional": false,
            "field": "auth_token",
            "description": ""
          }
        ]
      }
    },
    "success": {
      "examples": [
        {
          "title": "Auth Status",
          "content": "{\n  \"status\": \"active\",\n}",
          "type": "json"
        }
      ],
      "fields": {
        "Success 200": [
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "status",
            "description": "<p>Current status of the token which was used for the request</p>"
          }
        ]
      }
    },
    "version": "0.0.0",
    "filename": "./auth/routes.js",
    "groupTitle": "Auth",
    "name": "GetCheck"
  },
  {
    "type": "get",
    "url": "/device",
    "title": "Get assigned device",
    "group": "Auth",
    "description": "<p>Gets the currently assigned device for the token used in the request</p>",
    "success": {
      "fields": {
        "Success 200": [
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "_id",
            "description": ""
          },
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "name",
            "description": ""
          }
        ]
      },
      "examples": [
        {
          "title": "Assigned Device",
          "content": "{\n  \"_id\": \"5814e91e5cf0d15927ffaf8d\",\n  \"name\": \"Phone\",\n}",
          "type": "json"
        }
      ]
    },
    "version": "0.0.0",
    "filename": "./auth/routes.js",
    "groupTitle": "Auth",
    "name": "GetDevice"
  },
  {
    "type": "get",
    "url": "/devices",
    "title": "Devices",
    "group": "Auth",
    "description": "<p>List all devices of capability 'client' which can be used to assign to a token</p>",
    "success": {
      "fields": {
        "Success 200": [
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "array",
            "description": "<p>Array of devices</p>"
          },
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "array._id",
            "description": "<p>Device id</p>"
          },
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "array.name",
            "description": "<p>Device name</p>"
          }
        ]
      },
      "examples": [
        {
          "title": "Device Assignment",
          "content": "[\n  {\n    \"_id\": \"5814e91e5cf0d15927ffaf8d\",\n    \"name\": \"Phone\",\n  }\n]",
          "type": "json"
        }
      ]
    },
    "version": "0.0.0",
    "filename": "./auth/routes.js",
    "groupTitle": "Auth",
    "name": "GetDevices"
  },
  {
    "type": "post",
    "url": "/assign",
    "title": "Assign",
    "group": "Auth",
    "description": "<p>Assigns a device to a token and unassigns the requested device from any tokens using requested device.  Any tokens previously assigned get set to the unassigned status.</p>",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "_id",
            "description": ""
          }
        ]
      },
      "examples": [
        {
          "title": "Device Assignment",
          "content": "{\n  \"_id\": \"5814e91e5cf0d15927ffaf8d\",\n}",
          "type": "json"
        }
      ]
    },
    "success": {
      "fields": {
        "Success 200": [
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "status",
            "description": "<p>Assignment Status</p>"
          },
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "message",
            "description": "<p>Message describing the status</p>"
          }
        ]
      }
    },
    "version": "0.0.0",
    "filename": "./auth/routes.js",
    "groupTitle": "Auth",
    "name": "PostAssign"
  },
  {
    "type": "post",
    "url": "/auth",
    "title": "Login",
    "group": "Auth",
    "parameter": {
      "fields": {
        "Parameter": [
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "user",
            "description": ""
          },
          {
            "group": "Parameter",
            "type": "String",
            "optional": false,
            "field": "password",
            "description": ""
          }
        ]
      },
      "examples": [
        {
          "title": "Login Example",
          "content": "{\n  \"user\": \"john\",\n  \"password\": \"secret\",\n}",
          "type": "json"
        }
      ]
    },
    "success": {
      "fields": {
        "Success 200": [
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "status",
            "description": "<p>Authentication Status</p>"
          },
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "user",
            "description": "<p>Name of the authenticated user</p>"
          },
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "auth_token",
            "description": "<p>Auth token for the user</p>"
          },
          {
            "group": "Success 200",
            "type": "String",
            "optional": false,
            "field": "client_token",
            "description": "<p>Client token for the user</p>"
          }
        ]
      }
    },
    "version": "0.0.0",
    "filename": "./auth/routes.js",
    "groupTitle": "Auth",
    "name": "PostAuth"
  },
  {
    "type": "get",
    "url": "/devices/logs",
    "title": "",
    "group": "Devices",
    "version": "0.0.0",
    "filename": "./devices/routes.js",
    "groupTitle": "Devices",
    "name": "GetDevicesLogs"
  }
] });
