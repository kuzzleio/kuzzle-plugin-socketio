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
      /*eslint no-console: 0*/
      return console.error(new Error('plugin-socketio: A configuration parameter is required'));
    }

    if (!config.port) {
      /*eslint no-console: 0*/
      return console.error(new Error('plugin-socketio: the \'port\' attribute, with the port to listen to, is required'));
    }

    this.config = config;
    this.isDummy = isDummy;
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
      console.error('Unable to connect: ', err);
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
