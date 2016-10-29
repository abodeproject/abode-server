# abode-server v0.1.0

Abode Server API Docs

- [Auth](#auth)
	- [Logout](#logout)
	- [Get Status](#get-status)
	- [Check](#check)
	- [Get assigned device](#get-assigned-device)
	- [Devices](#devices)
	- [Assign](#assign)
	- [Login](#login)
	
- [Devices](#devices)
	- [](#)
	


# Auth

## Logout



	DELETE /auth


## Get Status



	GET /auth


## Check

<p>Assigns a device to a token and unassigns the requested device from any tokens using requested device.  Any tokens previously assigned get set to the unassigned status.</p>

	GET /check

### Headers

| Name    | Type      | Description                          |
|---------|-----------|--------------------------------------|
| client_token			| String			|  							|
| auth_token			| String			|  							|

### Success Response

Auth Status

```
{
  "status": "active",
}
```
## Get assigned device

<p>Gets the currently assigned device for the token used in the request</p>

	GET /device


### Success Response

Assigned Device

```
{
  "_id": "5814e91e5cf0d15927ffaf8d",
  "name": "Phone",
}
```
## Devices

<p>List all devices of capability 'client' which can be used to assign to a token</p>

	GET /devices


### Success Response

Device Assignment

```
[
  {
    "_id": "5814e91e5cf0d15927ffaf8d",
    "name": "Phone",
  }
]
```
## Assign

<p>Assigns a device to a token and unassigns the requested device from any tokens using requested device.  Any tokens previously assigned get set to the unassigned status.</p>

	POST /assign


### Parameters

| Name    | Type      | Description                          |
|---------|-----------|--------------------------------------|
| _id			| String			|  							|

## Login



	POST /auth


### Parameters

| Name    | Type      | Description                          |
|---------|-----------|--------------------------------------|
| user			| String			|  							|
| password			| String			|  							|

# Devices

## 



	GET /devices/logs



