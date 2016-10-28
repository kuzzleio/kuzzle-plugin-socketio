[![Build Status](https://travis-ci.org/kuzzleio/kuzzle-plugin-socketio.svg?branch=master)](https://travis-ci.org/kuzzleio/kuzzle-plugin-socketio) [![codecov.io](http://codecov.io/github/kuzzleio/kuzzle-plugin-socketio/coverage.svg?branch=master)](http://codecov.io/github/kuzzleio/kuzzle?branch=master) [![Dependency Status](https://david-dm.org/kuzzleio/kuzzle-plugin-socketio.svg)](https://david-dm.org/kuzzleio/kuzzle-plugin-socketio)

# Kuzzle compatibility

This plugin requires Kuzzle 1.0.0-RC5 or higher.

For Kuzzle 1.0.0-RC4, you'll need a version 2.0.0 of this plugin.

For older versions of Kuzzle, install v1.x versions of this plugin instead.

# Protocol plugin: socket.io

Protocol plugin adding Socket.io support to Kuzzle.

# Manifest

This plugin doesn't need any right.

# Configuration

You can override the configuration in your `config/customPlugins.json` file in Kuzzle:

| Name | Default value | Type | Description                 |
|------|---------------|-----------|-----------------------------|
| ``port`` | ``7512`` | Integer > 1024 | Network port to open |
| ``room`` | ``"Kuzzle"`` | String | Name of the room listened by the plugin |

# How to create a plugin

See [Kuzzle plugins documentation](http://kuzzle.io/guide/#plugins) for more information about how to create your own plugin.

# About Kuzzle

For UI and linked objects developers, [Kuzzle](https://kuzzle.io) is an open-source solution that handles all the data management
(CRUD, real-time storage, search, high-level features, etc).
