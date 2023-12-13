import * as tls from 'tls';
import * as net from 'net';
import {ReconnectingSocket, RedisClient} from '../node';
import type {RedisClientCodecOpts} from '../types';

export interface RedisClusterNodeClientOpts {
  /** Hostname or IP address of the Redis node. Defaults to 'localhost'. */
  host?: string;
  /** Port of the Redis node. Defaults to 6379. */
  port?: number;
  /** Username to use for authentication. */
  user?: string;
  /** Password to use for authentication. Auth is skipped if omitted. */
  pwd?: string;
  /** Whether to use TLS. Defaults to false. */
  tls?: boolean;
  /** TLS options. */
  secureContext?: tls.SecureContextOptions;
}

export class RedisClusterNodeClient extends RedisClient {
  /** Cluster node ID, randomly assigned when node boots, retrieved with `CLUSTER MYID`. */
  public id: string = '';
  /** Hostname of the Redis node. */
  public readonly host: string;
  /** Port of the Redis node. */
  public readonly port: number;

  constructor({host = 'localhost', port = 6379, ...opts}: RedisClusterNodeClientOpts, codec: RedisClientCodecOpts) {
    super({
      socket: new ReconnectingSocket({
        createSocket: opts.tls
          ? () => tls.connect({
            host,
            port,
            ...opts.secureContext,
          })
          : () => net.connect({
            host,
            port,
          }),
      }),
      encoder: codec.encoder,
      decoder: codec.decoder,
    });
    this.host = host;
    this.port = port;
  }
}
