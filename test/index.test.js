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
    setPort,
    fakeId = 'Verbal Kint',
    destination,
    linkedChannel,
    messageSent,
    notification;

  before(function () {
    // stubbing socket.io
    Plugin = proxyquire('../lib/index', {
      'socket.io': portNumber => {
        emitter = new EventEmitter();

        setPort = portNumber;

        emitter.id = fakeId;
        emitter.set = () => {};
        emitter.to = sinon.stub().returns({
          emit: sinon.spy()
        });

        emitter.sockets = { connected: {} };
        emitter.sockets.connected[fakeId] = {
          join: channel => { linkedChannel = channel; },
          leave: channel => { linkedChannel = channel; },
          emit: (event, payload) => { notification = {event, payload}; }
        };

        return emitter;
      }
    });
  });

  beforeEach(function () {
    setPort = -1;
    destination = null;
    messageSent = null;
    linkedChannel = null;
    notification = null;
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
      on: sinon.spy()
    }
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

    it('should throw an error if no "config" argument has been provided', function (done) {
      try {
        plugin.init(undefined, {}, true);
        done(new Error('Expected a throw, but nothing happened'));
      }
      catch (e) {
        done();
      }
    });

    it('should throw if no port configuration has been provided', function () {
      return should(() => plugin.init({}, {}))
        .throw('[plugin-socketio]: "port" attribute is required');
    });

    it('should set internal properties correctly', function () {
      var
        ret = plugin.init(config, context);

      should(ret).be.eql(plugin);
      should(plugin.config).be.eql(config);
      should(plugin.context).be.eql(context);
      should(setPort).be.eql(1234);
    });

    it('should start a socket.io broker if not in dummy mode', function () {
      var ret = plugin.init(config, context);

      should(ret).be.eql(plugin);
      should(plugin.config).be.eql(config);
      should(plugin.context).be.eql(context);
      should(setPort).be.eql(1234);
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
    var
      channel = 'foobar',
      payload = {foo: 'bar'};

    beforeEach(function () {
      plugin.init({port: 1234}, {}, false);
    });

    it('should do nothing if in dummy mode', function () {
      plugin.isDummy = true;
      plugin.notify({id: fakeId,channel,payload});
      should(notification).be.null();
    });

    it('should notify a client correctly', function () {
      plugin.notify({connectionId: fakeId, channels: [channel], payload});
      should(notification).not.be.null();
      should(notification.payload).be.eql(payload);
      should(notification.event).be.eql(channel);
    });
  });

  describe('#joinChannel', function () {
    beforeEach(function () {
      plugin.init({port: 1234}, {}, false);
    });

    it('should link an id with a channel', function () {
      plugin.joinChannel({connectionId: fakeId, channel: 'foo'});
      should(linkedChannel).be.eql('foo');
    });

    it('should do nothing if the id is unknown', function () {
      plugin.joinChannel({connectionId: 'some other id', channel: 'foo'});
      should(linkedChannel).be.null();
    });
  });

  describe('#leaveChannel', function () {
    beforeEach(function () {
      plugin.init({port: 1234}, {}, false);
    });

    it('should link an id with a channel', function () {
      plugin.leaveChannel({connectionId: fakeId, channel: 'foo'});
      should(linkedChannel).be.eql('foo');
    });

    it('should do nothing if the id is unknown', function () {
      plugin.leaveChannel({connectionId: 'some other id', channel: 'foo'});
      should(linkedChannel).be.null();
    });
  });

  describe('#newConnection', function () {
    // some heavy stubbing here...
    let
      connection = {foo: 'bar'},
      context,
      fakeRequestId = 'fakeRequestId',
      response;

    beforeEach(function () {
      response = {content: {foo: 'bar'}};
      context = {
        accessors: {
          router: {
            execute: sinon.spy(),
            newConnection: sinon.spy(),
            removeConnection: sinon.spy()
          }
        },
        constructors: {
          ClientConnection: sinon.spy(),
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

      should(plugin.connectionPool['id'])
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
        this.id = 'requestId';
        this.data = data;
        this.options = options;
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
        .be.calledWith({
          connectionId: clientSocket.id,
          protocol: 'socketio'
        });

    });

    it('should handle client socket errors', () => {
      plugin.newConnection(clientSocket);

      const error = clientSocket.on.thirdCall.args[1];

      error();
      should(context.accessors.router.removeConnection)
        .be.calledOnce()
        .be.calledWith({
          connectionId: clientSocket.id,
          protocol: 'socketio'
        });
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
      plugin.connectionPool.id = {
        disconnect: sinon.spy()
      };

      plugin.disconnect('id');

      should(plugin.connectionPool.id.disconnect)
        .be.calledOnce();
    });
  });

});
