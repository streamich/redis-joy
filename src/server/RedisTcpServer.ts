import * as net from 'net';
import {RespEncoder} from '@jsonjoy.com/json-pack/lib/resp';
import {RedisServerTcpConnection} from './connection/RedisServerTcpConnection';
import {RedisServer} from './RedisServer';

/* tslint:disable no-console */

export interface RedisTcpServerOpts {
  port?: number;
}

export class RedisTcpServer extends RedisServer {
  private server?: net.Server;
  protected readonly encoder: RespEncoder;

  constructor(protected readonly opts: RedisTcpServerOpts = {}) {
    super();
    this.encoder = new RespEncoder();
  }

  public start() {
    this.server = net.createServer({
      allowHalfOpen: false,
      pauseOnConnect: false,
      noDelay: true,
    });
    this.server.maxConnections = 10000;
    this.server.on('listening', this.handleListening);
    this.server.on('connection', this.handleConnection);
    this.server.on('error', this.handleError);
    this.server.on('drop', this.handleDrop);
    this.server.on('close', this.handleClose);
    this.server.listen(this.opts.port ?? 6379, () => {
      console.log('server bound');
    });
  }

  private readonly handleListening = () => {
    console.log('listening');
  };

  private readonly handleConnection = (socket: net.Socket) => {
    const connection = new RedisServerTcpConnection(socket, this.encoder);
    this.onConnection(connection);
  };

  private readonly handleError = (err: Error) => {
    console.log('error', err);
  };

  private readonly handleDrop = (err: Error) => {
    console.log('drop', err);
  };

  private readonly handleClose = () => {
    console.log('close');
  };
}
