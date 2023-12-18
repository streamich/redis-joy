import * as net from 'net';
import {RespEncoder} from 'json-joy/es2020/json-pack/resp';
import {decodeUtf8} from 'json-joy/es2020/util/buffers/utf8/decodeUtf8';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';

export class RedisTcpServer {
  private server?: net.Server;
  protected readonly encoder: RespEncoder;

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
          case 'PING':
            socket.write(this.encoder.encode(['PONG']));
            break;
          case 'QUIT':
            socket.end();
            break;
          case 'GET': {
            const response = this.encoder.encode('42');
            socket.write(response);
            break;
          }
          case 'GETSET': {
            const response = this.encoder.encode({foo: 'bar'});
            socket.write(response);
            break;
          }
          case 'HELLO': {
            const response = this.encoder.encode({server: 'redis', version: '6.0.9', proto: 2, id: 1, mode: 'standalone', role: 'master', modules: []});
            socket.write(response);
            break;
          }
          default:
            socket.write(this.encoder.encode(new Error('ERR unknown command')));
            break;
        }
        console.log('msg', cmdStr, msg);
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
