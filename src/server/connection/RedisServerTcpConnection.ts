import * as net from 'net';
import {RedisServerConnection} from './types';
import {RespEncoder} from '@jsonjoy.com/json-pack/lib/resp';
import {RespStreamingDecoder} from '@jsonjoy.com/json-pack/lib/resp/RespStreamingDecoder';

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
          // console.log('cmd', cmd, Buffer.from(cmd[1] || '').toString(), Buffer.from(cmd[2] || '').toString());
          if (!Array.isArray(cmd)) throw new Error('ERR unknown command');
          this.oncmd(cmd);
        }
      } catch (err) {
        if (err instanceof Error) this.send(err);
        else this.send(new Error('ERR unknown error'));
      }
    });
    // We need to handle error events, otherwise if error is emitted
    // and there is no listener, the process will crash.
    socket.on('error', (err) => {
      // tslint:disable-next-line:no-console
      console.error('connection error', err);
    });
  }

  public send(data: unknown) {
    const buf = this.encoder.encode(data);
    this.socket.write(buf);
  }

  public close() {
    this.socket.destroySoon();
  }
}
