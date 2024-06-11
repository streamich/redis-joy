import {FanOut} from 'thingies/lib/fanout';
import {RespEncoder} from '@jsonjoy.com/json-pack/lib/resp';
import {RespStreamingDecoder} from '@jsonjoy.com/json-pack/lib/resp/RespStreamingDecoder';
import {RedisServer} from './RedisServer';
import {StandaloneClient} from '../standalone';
import {ParsedCmd, PublicKeys} from '../types';
import {RedisServerConnection} from './connection/types';
import type {ReconnectingSocket} from '../util/ReconnectingSocket';

export interface RedisMemoryServerOpts {}

export class RedisMemoryServer extends RedisServer {
  protected readonly encoder: RespEncoder;

  constructor(protected readonly opts: RedisMemoryServerOpts = {}) {
    super();
    this.encoder = new RespEncoder();
  }

  public start() {}

  public connectClient(): StandaloneClient {
    const onReady = new FanOut<void>();
    const onData = new FanOut<Buffer>();
    const encoder = this.encoder;
    const connection = new (class implements RedisServerConnection {
      public oncmd: (cmd: ParsedCmd) => void = () => {};
      public send(data: unknown): void {
        const buf = encoder.encode(data);
        onData.emit(Buffer.from(buf));
      }
      public close(): void {}
    })();
    const decoder = new RespStreamingDecoder();
    const client = new StandaloneClient({
      encoder: new RespEncoder(),
      decoder: new RespStreamingDecoder(),
      socket: new (class implements PublicKeys<ReconnectingSocket> {
        public socket? = undefined;
        public readonly onReady = onReady;
        public readonly onData = onData;
        public readonly onDrain = new FanOut<void>();
        public readonly onError = new FanOut<Error>();
        public isConnected(): boolean {
          return true;
        }
        public getEndpoint(): string {
          return '0.0.0.0';
        }
        public start() {}
        public stop(): void {}
        public reconnect(): void {}
        public ref() {}
        public unref() {}
        public write(data: Uint8Array): boolean {
          setImmediate(() => {
            decoder.push(data);
            while (true) {
              const cmd = decoder.readCmd();
              if (cmd === undefined) break;
              if (!Array.isArray(cmd)) throw new Error('ERR unknown command');
              connection.oncmd(cmd);
            }
          });
          return true;
        }
      })(),
    });
    this.onConnection(connection);
    setImmediate(() => {
      onReady.emit();
    });
    return client;
  }
}
