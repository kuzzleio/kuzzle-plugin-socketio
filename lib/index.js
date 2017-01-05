'use strict';

module.exports = function SocketioProtocol () {
  this.config = {};
  this.sockets = {};
  this.socketIdToConnectionId = {};
  this.protocol = 'socketio';
  this.io = null;
  this.context = null;

  this.init = function (config, context) {
    this.config = Object.assign({
      port: 7512,
      room: 'kuzzle'
    }, config || {});

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
    if (this.sockets[data.connectionId]) {
      for (let i = 0; i < data.channels.length; i++) {
        this.sockets[data.connectionId].emit(data.channels[i], data.payload);
      }
    }
  };

  this.joinChannel = function (data) {
    if (this.sockets[data.connectionId]) {
      this.sockets[data.connectionId].join(data.channel);
    }
  };

  this.leaveChannel = function (data) {
    if (this.sockets[data.connectionId]) {
      this.sockets[data.connectionId].leave(data.channel);
    }
  };

  /**
   *
   * @param {Socket} socket
   */
  this.newConnection = function (socket) {
    let
      connection,
      ips = [socket.handshake.address];
    if (socket.handshake.headers['x-forwarded-for']) {
      ips = socket.handshake.headers['x-forwarded-for']
        .split(',')
        .map(s => s.trim())
        .concat(ips);
    }

    try {
      connection = new this.context.constructors.ClientConnection(this.protocol, ips, socket.handshake.headers);
      this.context.accessors.router.newConnection(connection);

      this.sockets[connection.id] = socket;
      this.socketIdToConnectionId[socket.id] = connection.id;
    }
    catch (err) {
      return this.context.log.error('Unable to declare new connection: \n%j', err.stack);
    }

    socket.on(this.config.room, data => {
      let request;

      try {
        request = new this.context.constructors.Request(data, {
          connectionId: connection.id,
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
      if (this.socketIdToConnectionId[socket.id]) {
        delete this.sockets[this.socketIdToConnectionId];
        delete this.socketIdToConnectionId[socket.id];
      }
      this.context.accessors.router.removeConnection(connection.id);
    });

    socket.on('error', () => {
      this.context.accessors.router.removeConnection(connection.id);
    });
  };

  this.disconnect = function (connectionId) {
    if (this.sockets[connectionId]) {
      this.sockets[connectionId].disconnect();
    }
  };
};
