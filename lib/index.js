var
  hooks = require('./config/hooks'),
  packageInfo = require('../package.json');

module.exports = function SocketioProtocol () {
  this.protocol = packageInfo.pluginInfo.defaultConfig.protocol;
  this.isDummy = false;
  this.io = null;
  this.context = null;

  this.init = function (config, context, isDummy) {
    if (!config) {
      /*eslint no-console: 0*/
      return console.error(new Error('plugin-socketio: A configuration parameter is required'));
    }

    if (!config.port) {
      /*eslint no-console: 0*/
      return console.error(new Error('plugin-socketio: the \'port\' attribute, with the port to listen to, is required'));
    }

    this.isDummy = isDummy;
    this.context = context;

    if (this.isDummy) {
      return this;
    }

    this.io = require('socket.io')(config.port);
    this.io.set('origins', '*:*');

    this.io.on('connection', socket => {
      this.newConnection(socket);
    });

    this.io.on('error', err => {
      /*eslint no-console: 0*/
      console.error('Unable to connect: ', err);
    });

    return this;
  };

  this.broadcast = function (channel, response) {
    if (this.isDummy) {
      return false;
    }

    this.io.to(channel).emit(channel, response);
  };

  this.hooks = hooks;

  this.joinChannel = function (channel, id) {
    if (this.isDummy) {
      return false;
    }

    this.io.sockets.connected[id].join(channel);
  };

  this.leaveChannel = function (channel, id) {
    if (this.isDummy) {
      return false;
    }

    if (this.io.sockets.connected[id]) {
      this.io.sockets.connected[id].leave(channel);
    }
  };

  this.newConnection = function (socket) {
    if (this.isDummy) {
      return false;
    }

    this.context.getRouter().newConnection(this.protocol, socket.id)
      .then(connection => {
        socket.on(this.context.getRouter().routeName, data => {
          var requestObject = new this.context.RequestObject(data, {}, this.protocol);

          this.context.getRouter().execute(data.headers, requestObject, connection)
            .then(responseObject => {
              this.io.to(socket.id).emit(requestObject.requestId, responseObject.toJson());
            })
            .catch(error => {
              this.io.to(socket.id).emit(requestObject.requestId, error.toJson());
            });
        });

        this.io.on('disconnect', () => {
          this.context.getRouter().removeConnection(connection);
        });

        this.io.on('error', () => {
          this.context.getRouter().removeConnection(connection);
        });
      })
      .catch(err => {
        /*eslint no-console: 0*/
        console.error('Unable to declare new connection: ', err);
      });
  };
};
