import * as tls from 'tls';
import * as net from 'net';
import {StandaloneClient} from '../standalone';
import {printTree} from 'tree-dump/lib/printTree';
import {ReconnectingSocket} from '../util/ReconnectingSocket';
import type {Printable} from 'tree-dump/lib/types';
import type {RedisClientCodecOpts} from '../types';
import type {RedisClusterShardsResponse} from './types';
import type {ScriptRegistry} from '../ScriptRegistry';

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

  /**
   * Maximum number of bytes to buffer while the socket is not connected.
   * Defaults to 1MB.
   */
  maxBufferSize?: number;

  /** Script registry. */
  scripts?: ScriptRegistry;
}

export class RedisClusterNodeClient extends StandaloneClient implements Printable {
  /** Hostname of the Redis node. */
  public readonly host: string;
  /** Port of the Redis node. */
  public readonly port: number;

  constructor(
    {host = 'localhost', port = 6379, scripts, ...opts}: RedisClusterNodeClientOpts,
    codec: RedisClientCodecOpts,
  ) {
    super({
      socket: new ReconnectingSocket({
        createSocket: opts.tls
          ? () =>
              tls.connect({
                host,
                port,
                ...opts.secureContext,
              })
          : () => net.connect({host, port}),
        maxBufferSize: opts.maxBufferSize,
      }),
      user: opts.user,
      pwd: opts.pwd,
      encoder: codec.encoder,
      decoder: codec.decoder,
      scripts,
    });
    this.host = host;
    this.port = port;
  }

  // -------------------------------------------------------- Built-in commands

  public async clusterMyId(): Promise<string> {
    // `CLUSTER MYID` is not supported in a number of servers, for example,
    // redis.com returns "ERR unknown subcommand 'myid'". Instead, we parse
    // `CLUSTER NODES` output.
    const reg = /^([^ ]+) .+myself/gm;
    const nodes = (await this.cmd(['CLUSTER', 'NODES'])) as string;
    const match = reg.exec(nodes);
    if (!match) throw new Error('Failed to parse CLUSTER NODES output.');
    return match[1];
  }

  public clusterShards(): Promise<RedisClusterShardsResponse> {
    return this.cmd(['CLUSTER', 'SHARDS'], {utf8Res: true}) as Promise<RedisClusterShardsResponse>;
  }

  // ---------------------------------------------------------------- Printable

  public toString(tab?: string): string {
    return 'client' + printTree(tab, [(tab: string) => `host: ${this.host}`, (tab: string) => `port: ${this.port}`]);
  }
}
