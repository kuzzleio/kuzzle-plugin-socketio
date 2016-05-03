var
  hooks = require('./config/hooks');

module.exports = function SocketioProtocol () {
  this.config = {};
  this.protocol = 'socketio';
  this.isDummy = false;
  this.io = null;
  this.context = null;

  this.init = function (config, context, isDummy) {
    if (!config) {
      throw new Error('plugin-socketio: A configuration parameter is required');
    }

    if (!config.port) {
      /*eslint no-console: 0*/
      this.isDummy = true;
      console.error(new Error('plugin-socketio: the \'port\' attribute, with the port to listen to, is required'));
      return false;
    }

    this.isDummy = isDummy;
    this.config = config;
    this.context = context;

    if (this.isDummy) {
      return this;
    }

    this.io = require('socket.io')(this.config.port);
    this.io.set('origins', '*:*');

    this.io.on('connection', socket => {
      this.newConnection(socket);
    });

    this.io.on('error', err => {
      /*eslint no-console: 0*/
      console.error('Unable to connect: ', err, '\nFalling back to dummy-mode.');
      this.isDummy = true;
    });

    return this;
  };

  this.hooks = hooks;

  this.broadcast = function (data) {
    if (this.isDummy) {
      return false;
    }

    this.io.to(data.channel).emit(data.channel, data.payload);
  };

  this.notify = function (data) {
    if (this.isDummy) {
      return false;
    }

    if (this.io.sockets.connected[data.id]) {
      this.io.sockets.connected[data.id].emit(data.channel, data.payload);
    }
  };

  this.joinChannel = function (data) {
    if (this.isDummy) {
      return false;
    }

    if (this.io.sockets.connected[data.id]) {
      this.io.sockets.connected[data.id].join(data.channel);
    }
  };

  this.leaveChannel = function (data) {
    if (this.isDummy) {
      return false;
    }

    if (this.io.sockets.connected[data.id]) {
      this.io.sockets.connected[data.id].leave(data.channel);
    }
  };

  this.newConnection = function (socket) {
    if (this.isDummy) {
      return false;
    }

    this.context.getRouter().newConnection(this.protocol, socket.id)
      .then(connection => {
        socket.on(this.config.room, data => {
          var requestObject = new this.context.RequestObject(data, {}, this.protocol);

          this.context.getRouter().execute(requestObject, connection, (error, responseObject) => {
            this.io.to(socket.id).emit(requestObject.requestId, responseObject.toJson());
          });
        });

        socket.on('disconnect', () => {
          this.context.getRouter().removeConnection(connection);
        });

        socket.on('error', () => {
          this.context.getRouter().removeConnection(connection);
        });
      })
      .catch(err => {
        /*eslint no-console: 0*/
        console.error('Unable to declare new connection: ', err);
      });
  };
};
