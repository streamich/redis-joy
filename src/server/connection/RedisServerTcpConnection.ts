import * as net from 'net';
import {RedisServerConnection} from "./types";
import {RespEncoder} from 'json-joy/es2020/json-pack/resp';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';

const noop = () => {};

export class RedisServerTcpConnection implements RedisServerConnection {
  public oncmd: (cmd: unknown) => void = noop;

  constructor(
    protected readonly socket: net.Socket,
    protected readonly encoder: RespEncoder,
  ) {
    const decoder = new RespStreamingDecoder();
    socket.on('data', (data: Buffer) => {
      try {
        decoder.push(data);
        while (true) {
          const cmd = decoder.readCmd();
          if (cmd === undefined) break;
          if (!Array.isArray(cmd)) throw new Error('ERR unknown command');
          this.oncmd(cmd);
        }
      } catch (err) {
        if (err instanceof Error) this.send(err);
        else this.send(new Error('ERR unknown error'));
      }
    });
    // socket.on('connect', this.handleConnect);
    // socket.on('ready', this.handleReady);
    // socket.on('drain', this.handleDrain);
    // socket.on('error', this.handleError);
    // socket.on('close', this.handleClose);
    // socket.on('timeout', this.handleTimeout);
    // socket.on('end', () => {});
    // socket.on('lookup', (err: Error, address: string, family: string | number, host: string) => {});
  }

  public send(data: unknown) {
    const buf = this.encoder.encode(data);
    this.socket.write(buf);
  }

  public close() {
    this.socket.destroySoon();
  }
}
