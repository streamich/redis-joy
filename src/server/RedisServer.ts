import * as net from 'net';
import {RespEncoder} from 'json-joy/es2020/json-pack/resp';
import {decodeUtf8} from 'json-joy/es2020/util/buffers/utf8/decodeUtf8';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';
import {AvlMap} from 'json-joy/es2020/util/trees/avl/AvlMap';
import {cmpUint8Array} from '../util/buf';

export class RedisTcpServer {
  private server?: net.Server;
  protected readonly encoder: RespEncoder;

  public readonly kv = new AvlMap<Uint8Array, Uint8Array>(cmpUint8Array);

  constructor() {
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
    this.server.listen(9999, () => {
      console.log('server bound');
    });
  }

  private readonly handleListening = () => {
    console.log('listening');
  };

  private readonly handleConnection = (socket: net.Socket) => {
    const decoder = new RespStreamingDecoder();
    // socket.on('connect', this.handleConnect);
    // socket.on('ready', this.handleReady);
    const kv = this.kv;
    socket.on('data', (data: Buffer) => {
      decoder.push(data);
      while (true) {
        const msg = decoder.read();
        if (msg === undefined) break;
        if (!Array.isArray(msg)) throw new Error('Unexpected message type');
        const cmd = msg[0];
        if (!(cmd instanceof Uint8Array)) throw new Error('Unexpected message type');
        const cmdStr = decodeUtf8(cmd, 0, cmd.length);
        switch (cmdStr.toUpperCase()) {
          case 'GET': {
            const [, k] = msg;
            const v = kv.get(k);
            const response = v ? this.encoder.encode(v) : this.encoder.encode(null);
            socket.write(response);
            break;
          }
          case 'SET': {
            const [, k, v] = msg;
            kv.set(k, v);
            const response = this.encoder.encode('OK');
            socket.write(response);
            break;
          }
          case 'PING':
            socket.write(this.encoder.encode(['PONG']));
            break;
          case 'QUIT':
            socket.end();
            break;
          case 'GETSET': {
            const response = this.encoder.encode({foo: 'bar'});
            socket.write(response);
            break;
          }
          case 'HELLO': {
            const response = this.encoder.encode({
              server: 'redis',
              version: '6.0.9',
              proto: 2,
              id: 1,
              mode: 'standalone',
              role: 'master',
              modules: [],
            });
            socket.write(response);
            break;
          }
          case 'INFO': {
            const response = this.encoder.encode({});
            socket.write(response);
            break;
          }
          default:
            console.log('unknown command', cmdStr);
            socket.write(this.encoder.encode(new Error('ERR unknown command')));
            break;
        }
        // console.log('msg', cmdStr, msg);
      }
    });
    // socket.on('drain', this.handleDrain);
    // socket.on('error', this.handleError);
    // socket.on('close', this.handleClose);
    // socket.on('timeout', this.handleTimeout);
    // socket.on('end', () => {});
    // socket.on('lookup', (err: Error, address: string, family: string | number, host: string) => {});
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
