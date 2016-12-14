module.exports = function SocketioProtocol () {
  this.config = {};
  this.connectionPool = {};
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

    data.channels.forEach(channel => {
      this.io.to(channel).emit(channel, data.payload);
    });
  };

  this.notify = function (data) {
    if (this.isDummy) {
      return false;
    }

    if (this.io.sockets.connected[data.id]) {
      data.channels.forEach(channel => {
        this.io.sockets.connected[data.id].emit(channel, data.payload);
      });
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

    this.connectionPool[socket.id] = socket;

    this.context.accessors.router.newConnection(this.protocol, socket.id)
      .then(context => {
        socket.on(this.config.room, data => {
          var requestObject = new this.context.constructors.RequestObject(data, {}, this.protocol);

          this.context.accessors.router.execute(requestObject, context, (error, response) => {
            this.io.to(socket.id).emit(requestObject.requestId, response);
          });
        });

        socket.on('disconnect', () => {
          if (this.connectionPool[socket.id]) {
            delete this.connectionPool[socket.id];
          }
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

  this.disconnect = function (socketId) {
    if (this.connectionPool[socketId]) {
      this.connectionPool[socketId].disconnect();
    }
  };
};
