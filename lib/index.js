'use strict';

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

  this.broadcast = function (data) {
    if (this.isDummy) {
      return false;
    }

    for (let i = 0; i < data.channels.length; i++) {
      this.io.to(data.channels[i]).emit(data.channels[i], data.payload);
    }
  };

  this.notify = function (data) {
    if (this.isDummy) {
      return false;
    }

    if (this.io.sockets.connected[data.connectionId]) {
      for (let i = 0; i < data.channels.length; i++) {
        this.io.sockets.connected[data.connectionId].emit(data.channels[i], data.payload);
      }
    }
  };

  this.joinChannel = function (data) {
    if (this.isDummy) {
      return false;
    }

    if (this.io.sockets.connected[data.connectionId]) {
      this.io.sockets.connected[data.connectionId].join(data.channel);
    }
  };

  this.leaveChannel = function (data) {
    if (this.isDummy) {
      return false;
    }

    if (this.io.sockets.connected[data.connectionId]) {
      this.io.sockets.connected[data.connectionId].leave(data.channel);
    }
  };

  this.newConnection = function (socket) {
    if (this.isDummy) {
      return false;
    }

    this.context.accessors.router.newConnection(this.protocol, socket.id)
      .then(context => {
        socket.on(this.config.room, data => {
          let request;

          try {
            request = new this.context.constructors.Request(data, context);
          }
          catch (e) {
            this.io.to(socket.id).emit(socket.id, JSON.stringify(new this.context.errors.BadRequestError(e.message)));
            return;
          }

          this.context.accessors.router.execute(request, response => {
            this.io.to(socket.id).emit(request.id, response.content);
          });
        });

        socket.on('disconnect', () => {
          this.context.accessors.router.removeConnection(context);
        });

        socket.on('error', () => {
          this.context.accessors.router.removeConnection(context);
        });
      })
      .catch(err => {
        /*eslint no-console: 0*/
        console.error('Unable to declare new connection: ', err);
      });
  };
};
