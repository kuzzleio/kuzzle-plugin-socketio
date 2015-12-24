var
  http = require('http');

module.exports = function SocketioProtocol () {
  this.name = 'socketio';
  this.isDummy = false;
  this.io = null;
  this.httpServer = null;
  this.context = null;

  this.protocolInterface = {
    name: this.name,
    broadcast: this.broadcast,
    joinChannel: this.joinChannel,
    leaveChannel: this.leaveChannel
  };

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

    this.httpServer = http.createServer();
    this.httpServer.listen(config.port);
    this.io = require('socket.io')(this.httpServer);
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
    var
      connection;

    if (this.isDummy) {
      return false;
    }

    connection = this.context.router.newConnection(this.name, socket.id);

    socket.on(this.context.router.routeName, data => {
      var requestObject = new context.RequestObject(data, {}, this.name);

      this.context.router.execute(data.headers, requestObject, connection)
        .then(responseObject => {
          this.io.to(socket.id).emit(requestObject.requestId, responseObject.toJson());
        })
        .catch(error => {
          this.io.to(socket.id).emit(requestObject.requestId, error.toJson());
        });
    });

    this.io.on('disconnect', () => {
      this.context.router.removeConnection(connection);
    });

    this.io.on('error', () => {
      this.context.router.removeConnection(connection);
    });
  };
};
