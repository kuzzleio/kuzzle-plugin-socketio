'use strict';

const
  sinon = require('sinon'),
  sandbox = sinon.sandbox.create(),
  should = require('should'),
  EventEmitter = require('events'),
  proxyquire = require('proxyquire');

describe('plugin implementation', function () {
  let
    clientSocket,
    Plugin,
    plugin,
    emitter,
    fakeId = 'Verbal Kint';

  before(function () {
    // stubbing socket.io
    Plugin = proxyquire('../lib/index', {
      'socket.io': () => {
        emitter = new EventEmitter();

        emitter.id = fakeId;
        emitter.set = () => {};
        emitter.to = sinon.stub().returns({
          emit: sinon.spy()
        });

        emitter.sockets = { connected: {} };
        emitter.sockets.connected[fakeId] = {
          join: sinon.spy(),
          leave: sinon.spy(),
          emit: sinon.spy()
        };

        return emitter;
      }
    });
  });

  beforeEach(function () {
    plugin = new Plugin();

    clientSocket = {
      id: 'id',
      handshake: {
        address: 'ip',
        headers: {
          'x-forwarded-for': '1.1.1.1,2.2.2.2',
          'X-Foo': 'bar'
        }
      },
      emit: sinon.spy(),
      join: sinon.spy(),
      leave: sinon.spy(),
      on: sinon.spy()
    };
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('#general', function () {
    it('should expose an init function', function () {
      should(plugin.init).be.a.Function();
    });
  });

  describe('#init', function () {
    const
      config = {port: 1234},
      context = {
        log: {
          error: sinon.spy()
        }
      };

    it('should set internal properties correctly', function () {
      const ret = plugin.init(config, context);

      should(ret).be.eql(plugin);
      should(plugin.config.room).be.eql('kuzzle');
      should(plugin.config.port).be.eql(config.port);
      should(plugin.context).be.eql(context);
    });

    it('should start a socket.io broker', function () {
      plugin.init(config, context);

      should(plugin.io)
        .be.an.instanceOf(EventEmitter);
    });

    it('should manage new connections on a "connection" event', function (done) {
      var
        stubSocket = { thisIsNot: 'aSocket' };

      plugin.newConnection = socket => {
        should(socket).be.eql(stubSocket);
        done();
      };

      plugin.init(config, context, false);
      emitter.emit('connection', stubSocket);
    });

    it('should log an error if the broker is unable to start', function (done) {
      const error = new Error('test');

      plugin.init(config, context);
      emitter.emit('error', error);
      process.nextTick(() => {
        should(context.log.error)
          .be.calledOnce()
          .be.calledWith('Unable to connect:  \n' + error.stack);
        done();
      });
    });
  });

  describe('#broadcast', function () {
    var
      channel = 'foobar',
      payload = {foo: 'bar'};

    beforeEach(function () {
      plugin.init({port: 1234}, {}, false);
    });

    it('should broadcast a message correctly', function () {
      plugin.broadcast({channels: [channel],payload});

      should(plugin.io.to)
        .be.calledOnce()
        .be.calledWith(channel);

      should(plugin.io.to.firstCall.returnValue.emit)
        .be.calledOnce()
        .be.calledWith(channel, payload);
    });
  });

  describe('#notify', function () {
    const
      payload = {foo: 'bar'};

    beforeEach(function () {
      plugin.init({port: 1234}, {}, false);
    });

    it('should notify a client correctly', function () {
      plugin.sockets.fakeId = clientSocket;

      plugin.notify({
        connectionId: 'fakeId',
        channels: ['foobar'],
        payload
      });

      should(clientSocket.emit)
        .be.calledOnce()
        .be.calledWith('foobar', payload);
    });
  });

  describe('#joinChannel', function () {
    beforeEach(function () {
      plugin.init({port: 1234}, {}, false);
    });

    it('should link an id with a channel', function () {
      plugin.sockets[fakeId] = clientSocket;

      plugin.joinChannel({connectionId: fakeId, channel: 'foo'});
      should(clientSocket.join)
        .be.calledOnce()
        .be.calledWith('foo');
    });

    it('should do nothing if the id is unknown', function () {
      plugin.joinChannel({connectionId: 'some other id', channel: 'foo'});
      should(clientSocket.join)
        .have.callCount(0);
    });
  });

  describe('#leaveChannel', function () {
    beforeEach(function () {
      plugin.init({port: 1234}, {}, false);
    });

    it('should link an id with a channel', function () {
      plugin.sockets[fakeId] = clientSocket;
      plugin.leaveChannel({connectionId: fakeId, channel: 'foo'});

      should(clientSocket.leave)
        .be.calledOnce()
        .be.calledWith('foo');
    });

    it('should do nothing if the id is unknown', function () {
      plugin.leaveChannel({connectionId: 'some other id', channel: 'foo'});

      should(clientSocket.leave)
        .have.callCount(0);
    });
  });

  describe('#newConnection', function () {
    // some heavy stubbing here...
    let
      context;

    beforeEach(function () {
      context = {
        accessors: {
          router: {
            execute: sinon.spy(),
            newConnection: sinon.spy(),
            removeConnection: sinon.spy()
          }
        },
        constructors: {
          ClientConnection: sinon.spy(function () {
            this.id = 'clientConnectionId';   // eslint-disable-line no-invalid-this
          }),
          Request: sinon.spy()
        },
        errors: {BadRequestError: function (err) { this.error = err; }},
        log: {
          error: sinon.spy()
        }
      };
      plugin.init({port: 1234, room: 'foo'}, context);
    });

    it('should initialize a new connection', function () {
      plugin.newConnection(clientSocket);

      should(plugin.socketId2ConnectionId[clientSocket.id])
        .be.exactly('clientConnectionId');
      should(plugin.sockets.clientConnectionId)
        .be.exactly(clientSocket);

      should(context.constructors.ClientConnection)
        .be.calledOnce()
        .be.calledWith('socketio', ['1.1.1.1', '2.2.2.2', 'ip'], {
          'X-Foo': 'bar',
          'x-forwarded-for': '1.1.1.1,2.2.2.2'
        });

      should(context.accessors.router.newConnection)
        .be.calledOnce();

      should(clientSocket.on)
        .be.calledThrice()
        .be.calledWith('foo')
        .be.calledWith('disconnect')
        .be.calledWith('error');

    });

    it('should listen to incoming requests and forward them to Kuzzle', function () {
      const payload = {fake: 'data'};

      context.constructors.Request = sinon.spy(function (data, options) {
        this.id = 'requestId';    // eslint-disable-line no-invalid-this
        this.data = data;         // eslint-disable-line no-invalid-this
        this.options = options;   // eslint-disable-line no-invalid-this
      });

      plugin.newConnection(clientSocket);

      const emit = clientSocket.on.firstCall.args[1];
      emit(payload);

      should(context.constructors.Request)
        .be.calledOnce()
        .be.calledWith(payload);

      should(context.accessors.router.execute)
        .be.calledOnce()
        .be.calledWithMatch({
          id: 'requestId',
          data: payload
        });

      const
        executeCb = context.accessors.router.execute.firstCall.args[1],
        response = {content: 'blah'};

      executeCb(response);
      should(plugin.io.to)
        .be.calledOnce()
        .be.calledWith(clientSocket.id);
      should(plugin.io.to.firstCall.returnValue.emit)
        .be.calledOnce()
        .be.calledWith('requestId', response.content);
    });

    it('should reject ill-formed client requests', () => {
      const error = new Error('test');
      context.constructors.Request = function () { throw error; };

      plugin.newConnection(clientSocket);

      const emit = clientSocket.on.firstCall.args[1];

      emit('throwme');

      should(plugin.io.to)
        .be.calledOnce()
        .be.calledWith(clientSocket.id);

      should(plugin.io.to.firstCall.returnValue.emit)
        .be.calledOnce()
        .be.calledWith(clientSocket.id, '{"error":"test"}');
    });

    it('should handle client disconnections', function () {
      plugin.newConnection(clientSocket);

      const disconnect = clientSocket.on.secondCall.args[1];

      disconnect();

      should(context.accessors.router.removeConnection)
        .be.calledOnce()
        .be.calledWith('clientConnectionId');

    });

    it('should handle client socket errors', () => {
      plugin.newConnection(clientSocket);

      const error = clientSocket.on.thirdCall.args[1];

      error();
      should(context.accessors.router.removeConnection)
        .be.calledOnce()
        .be.calledWith('clientConnectionId');
    });

    it('should log an error if it could not register the new connection', () => {
      const error = new Error('test');
      context.accessors.router.newConnection = sinon.stub().throws(error);

      plugin.newConnection(clientSocket);
      should(context.log.error)
        .be.calledOnce()
        .be.calledWith('Unable to declare new connection: \n%j', error.stack);
    });

  });

  describe('#disconnect', () => {
    it('should disconnect the client socket', () => {
      plugin.sockets.id = {
        disconnect: sinon.spy()
      };

      plugin.disconnect('id');

      should(plugin.sockets.id.disconnect)
        .be.calledOnce();
    });
  });

});
