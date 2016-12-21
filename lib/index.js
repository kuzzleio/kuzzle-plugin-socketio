'use strict';

module.exports = function SocketioProtocol () {
  this.config = {};
  this.connectionPool = {};
  this.protocol = 'socketio';
  this.io = null;
  this.context = null;

  this.init = function (config, context) {
    if (!config) {
      throw new Error('[plugin-socketio]: A configuration parameter is required');
    }

    if (!config.port) {
      throw new Error('[plugin-socketio]: "port" attribute is required');
    }

    this.config = config;
    this.context = context;

    this.io = require('socket.io')(this.config.port);
    this.io.set('origins', '*:*');

    this.io.on('connection', socket => {
      this.newConnection(socket);
    });

    this.io.on('error', err => {
      this.context.log.error('Unable to connect:  \n' + err.stack);
    });

    return this;
  };

  this.broadcast = function (data) {
    for (let i = 0; i < data.channels.length; i++) {
      this.io.to(data.channels[i]).emit(data.channels[i], data.payload);
    }
  };

  this.notify = function (data) {
    if (this.io.sockets.connected[data.connectionId]) {
      for (let i = 0; i < data.channels.length; i++) {
        this.io.sockets.connected[data.connectionId].emit(data.channels[i], data.payload);
      }
    }
  };

  this.joinChannel = function (data) {
    if (this.io.sockets.connected[data.connectionId]) {
      this.io.sockets.connected[data.connectionId].join(data.channel);
    }
  };

  this.leaveChannel = function (data) {
    if (this.io.sockets.connected[data.connectionId]) {
      this.io.sockets.connected[data.connectionId].leave(data.channel);
    }
  };

  /**
   *
   * @param {Socket} socket
   */
  this.newConnection = function (socket) {
    let ips = [socket.handshake.address];
    if (socket.handshake.headers['x-forwarded-for']) {
      ips = socket.handshake.headers['x-forwarded-for']
        .split(',')
        .map(s => s.trim())
        .concat(ips);
    }

    this.connectionPool[socket.id] = socket;

    try {
      this.context.accessors.router.newConnection(
        new this.context.constructors.ClientConnection(this.protocol, ips, socket.handshake.headers)
      );

      socket.on(this.config.room, data => {
        let request;

        try {
          request = new this.context.constructors.Request(data, {
            connectionId: socket.id,
            protocol: this.protocol
          });
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
        if (this.connectionPool[socket.id]) {
          delete this.connectionPool[socket.id];
        }
        this.context.accessors.router.removeConnection({
          connectionId: socket.id,
          protocol: this.protocol
        });
      });

      socket.on('error', () => {
        this.context.accessors.router.removeConnection({
          connectionId: socket.id,
          protocol: this.protocol
        });
      });
    }
    catch (err) {
      this.context.log.error('Unable to declare new connection: \n%j', err.stack);
    }
  };

  this.disconnect = function (socketId) {
    if (this.connectionPool[socketId]) {
      this.connectionPool[socketId].disconnect();
    }
  };
};
