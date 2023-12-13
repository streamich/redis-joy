import * as net from 'net';
import * as tls from 'tls';
import {FanOut} from 'thingies/es2020/fanout';
import {RespEncoder} from 'json-joy/es2020/json-pack/resp';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';
import * as commands from '../generated/commands';
import {PartialExcept, RedisClientCodecOpts} from '../types';
import {RedisClient, ReconnectingSocket, CmdOpts} from '../node';
import {RedisClusterRouter} from './RedisClusterRouter';
import {RedisClusterNodeInfo} from './RedisClusterNodeInfo';
import {RedisClusterCall} from './RedisClusterCall';
import {endpointByClient} from './endpoints';
import {isMovedError, parseMovedError} from './errors';

const calculateSlot = require('cluster-key-slot');

export interface RedisClusterOpts extends RedisClientCodecOpts {
  /** Nodes to connect to to retrieve cluster configuration. */
  seeds: RedisClusterNodeConfig[];
  /** Shared config applied to all nodes. */
  connectionConfig?: RedisClusterNodeConfig;
}

export interface RedisClusterNodeConfig {
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

export class RedisCluster {
  protected readonly encoder: RespEncoder;
  protected readonly decoder: RespStreamingDecoder;
  protected readonly router = new RedisClusterRouter();
  protected stopped = false;

  /** Emitted on unexpected and asynchronous errors. */
  public readonly onError = new FanOut<Error>();
  /** Emitted each time router table is rebuilt. */
  public readonly onRouter = new FanOut<void>();

  constructor(protected readonly opts: PartialExcept<RedisClusterOpts, 'seeds'>) {
    this.encoder = opts.encoder ?? new RespEncoder();
    this.decoder = opts.decoder ?? new RespStreamingDecoder();
  }

  public start(): void {
    this.stopped = false;
    this.buildInitialRouteTable();
  }

  public stop(): void {
    this.stopped = true;
  }

  private initialTableBuildAttempt = 0;
  private buildInitialRouteTable(seed: number = 0): void {
    const attempt = this.initialTableBuildAttempt++;
    (async () => {
      if (this.stopped) return;
      if (!this.router.isEmpty()) return;
      const {seeds, connectionConfig} = this.opts;
      seed = seed % seeds.length;
      const client = await this.createClient({
        ...connectionConfig,
        ...seeds[seed],
      });
      if (this.stopped) return;
      await this.router.rebuild(client);
      if (this.stopped) return;
      this.initialTableBuildAttempt = 0;
      console.log('SHARD TABLE CREATED');
      this.onRouter.emit();
    })().catch((error) => {
      const delay = Math.max(Math.min(1000 * 2 ** attempt, 1000 * 60), 1000);
      setTimeout(() => this.buildInitialRouteTable(seed + 1), delay);
      this.onError.emit(error);
    });
  }

  public async whenRouterReady(): Promise<void> {
    if (!this.router.isEmpty()) return;
    return new Promise((resolve) => {
      const unsubscribe = this.onRouter.listen(() => {
        unsubscribe();
        resolve();
      });
    });
  }

  protected getAnyClient(): RedisClient {
    const randomClient = this.router.getRandomClient();
    if (!randomClient) throw new Error('NO_CLIENT');
    return randomClient;
  }

  protected async getBestAvailableWriteClient(slot: number): Promise<RedisClient> {
    await this.whenRouterReady();
    const router = this.router;
    const info = router.getMasterForSlot(slot);
    if (!info) return this.getAnyClient();
    const client = router.getClient(info.id);
    if (client) return client;
    this.createClientFromInfo(info);
    return this.getAnyClient();
  }

  protected async getBestAvailableReadClient(slot: number): Promise<RedisClient> {
    await this.whenRouterReady();
    const router = this.router;
    const info = router.getRandomNodeForSlot(slot);
    if (!info) return this.getAnyClient();
    const client = router.getClient(info.id);
    if (client) return client;
    this.createClientFromInfo(info);
    return this.getAnyClient();
  }

  private async createClientFromInfo(info: RedisClusterNodeInfo): Promise<RedisClient> {
    const [client] = await this.createClient({
      ...this.opts.connectionConfig,
      host: info.endpoint || info.ip,
      port: info.port,
    });
    return client;
  }

  protected async createClient(config: RedisClusterNodeConfig): Promise<[client: RedisClient, id: string]> {
    const client = this.createClientRaw(config);
    client.start();
    const {user, pwd} = config;
    const [, id] = await Promise.all([
      client.hello(3, pwd, user),
      client.clusterMyId(),
    ]);
    this.router.setClient(id, client);
    return [client, id];
  }

  protected createClientRaw(config: RedisClusterNodeConfig): RedisClient {
    const {host = 'localhost', port = 6379} = config;
    const client = new RedisClient({
      socket: new ReconnectingSocket({
        createSocket: config.tls
          ? () => tls.connect({
            host,
            port,
            ...config.secureContext,
          })
          : () => net.connect({
            host,
            port,
          }),
      }),
      encoder: this.encoder,
      decoder: this.decoder,
    });
    endpointByClient.set(client, host);
    return client;
  }

  public async getClientForKey(key: string, master: boolean): Promise<RedisClient> {
    if (!key) return this.getAnyClient();
    const slot = calculateSlot(key);
    return master ? this.getBestAvailableWriteClient(slot) : this.getBestAvailableReadClient(slot);
  }

  protected async callWithClient(call: RedisClusterCall, client: RedisClient): Promise<unknown> {
    try {
      return await client.call(call);
    } catch (error) {
      if (isMovedError(error)) {
        const redirect = parseMovedError((error as Error).message);
        let host = redirect[0];
        if (!host) host = endpointByClient.get(client) || '';
        if (!host) throw new Error('NO_HOST');
        // TODO: Start router table rebuild.
      }
      throw error;
    }
  }

  public async call(call: RedisClusterCall): Promise<unknown> {
    const args = call.args;
    let cmd: string = args[0] as string;
    if (typeof cmd !== 'string') throw new Error('INVALID_COMMAND');
    cmd = cmd.toUpperCase();
    const isWrite = commands.write.has(cmd);
    const key = call.key || (args[1] + '') || '';
    const client = await this.getClientForKey(key, isWrite);
    return await this.callWithClient(call, client);
  }

  public async cmd(args: unknown[], opts?: CmdOpts): Promise<unknown> {
    const call = new RedisClusterCall(args);
    if (opts) {
      if (opts.utf8Res) call.utf8Res = true;
      if (opts.noRes) call.noRes = true;
    }
    return this.call(call);
  }
}
