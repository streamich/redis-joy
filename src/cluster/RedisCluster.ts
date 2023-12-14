import {FanOut} from 'thingies/es2020/fanout';
import {RespEncoder} from 'json-joy/es2020/json-pack/resp';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';
import * as commands from '../generated/commands';
import {PartialExcept, RedisClientCodecOpts} from '../types';
import {RedisClusterRouter} from './RedisClusterRouter';
import {RedisClusterNode} from './RedisClusterNode';
import {RedisClusterCall} from './RedisClusterCall';
import {isMovedError, parseMovedError} from './errors';
import {RedisClusterNodeClient, RedisClusterNodeClientOpts} from './RedisClusterNodeClient';
import {RedirectType} from './constants';
import type {CmdOpts} from '../node';

const calculateSlot = require('cluster-key-slot');

export interface RedisClusterOpts extends RedisClientCodecOpts {
  /**
   * Nodes to connect to to retrieve cluster configuration. At least one seed
   * node must be provided. Normally you only need to specify host and port
   * here, but you can also specify `user` and `pwd` if you need to. Normally,
   * the `user` and `pwd` should be the same for all nodes, so you should
   * specify them in `connectionConfig` instead.
   */
  seeds: RedisClusterNodeClientOpts[];

  /**
   * Shared config applied to all nodes. Set your common all-nodes config
   * here, such as `user` and `pwd`.
   */
  connectionConfig?: RedisClusterNodeClientOpts;

  /**
   * Maximum number of redirects to perform before giving up. Usually each
   * command will be routed to the right node, if the `key` option is provided.
   * However, sometimes the cluster topology changes and the command needs to
   * be redirected to a different node. This option controls how many times
   * the command will be redirected before giving up.
   */
  // This probably is not something that user should control?
  // maxRedirects?: number;
}

export class RedisCluster {
  protected readonly encoder: RespEncoder;
  protected readonly decoder: RespStreamingDecoder;
  protected readonly router = new RedisClusterRouter();

  constructor(protected readonly opts: PartialExcept<RedisClusterOpts, 'seeds'>) {
    this.encoder = opts.encoder ?? new RespEncoder();
    this.decoder = opts.decoder ?? new RespStreamingDecoder();
  }


  // ------------------------------------------------------------------- Events

  /** Emitted on unexpected and asynchronous errors. */
  public readonly onError = new FanOut<Error>();

  /** Emitted each time router table is rebuilt. */
  public readonly onRouter = new FanOut<void>();


  // ---------------------------------------------------- Life cycle management

  protected stopped: boolean = false;

  public start(): void {
    this.stopped = false;
    this.buildInitialRouteTable();
  }

  public stop(): void {
    clearTimeout(this.initialTableBuildTimer);
    this.initialTableBuildAttempt = 0;
    clearTimeout(this.rebuildTimer);
    this.isRebuildingRouteTable = false;
    this.routeTableRebuildRetry = 0;
    this.stopped = true;
  }


  // ----------------------------------------------- Build initial router table

  private initialTableBuildAttempt = 0;
  private initialTableBuildTimer: NodeJS.Timeout | undefined = undefined;

  private buildInitialRouteTable(seed: number = 0): void {
    const attempt = this.initialTableBuildAttempt++;
    (async () => {
      if (this.stopped) return;
      if (!this.router.isEmpty()) return;
      const {seeds, connectionConfig} = this.opts;
      seed = seed % seeds.length;
      const seedConfig = seeds[seed]
      const client = await this.createClientFromSeed(seedConfig);
      if (this.stopped) return;
      const tls = !!seedConfig.tls || !!connectionConfig?.tls;
      const node = new RedisClusterNode(client.id, client.port, [client.host], tls);
      await this.router.rebuild(node);
      if (this.stopped) return;
      this.initialTableBuildAttempt = 0;
      this.onRouter.emit();
    })().catch((error) => {
      const delay = Math.max(Math.min(1000 * 2 ** attempt, 1000 * 60), 1000);
      this.initialTableBuildTimer = setTimeout(() => this.buildInitialRouteTable(seed + 1), delay);
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


  // ----------------------------------------------------- Router table rebuild

  private isRebuildingRouteTable: boolean = false;
  private routeTableRebuildRetry: number = 0;
  private rebuildTimer: NodeJS.Timeout | undefined = undefined;

  protected scheduleRoutingTableRebuild(): void {
    if (this.isRebuildingRouteTable) return;
    this.isRebuildingRouteTable = true;
    this.routeTableRebuildRetry = 0;
    const delay = Math.max(Math.min(1000 * 2 ** this.routeTableRebuildRetry, 1000 * 60), 1000);
    this.rebuildTimer = setTimeout(() => {
      this.rebuildTimer = undefined;
      this.rebuildRoutingTable()
        .then(() => {
          if (this.stopped) return;
          this.isRebuildingRouteTable = false;
          this.routeTableRebuildRetry = 0;
          this.onRouter.emit();
        })
        .catch((error) => {
          if (this.stopped) return;
          this.isRebuildingRouteTable = false;
          this.routeTableRebuildRetry++;
          this.onError.emit(error);
          this.scheduleRoutingTableRebuild();
        });
    }, delay);
  }

  private async rebuildRoutingTable(): Promise<void> {
    // const client = await this.getAnyClientOrSeed();
    // if (this.stopped) return;
    // await this.router.rebuild(client);
  }


  // ------------------------------------------------------ Client construction


  private async createClientFromInfo(info: RedisClusterNode): Promise<RedisClusterNodeClient> {
    return await this.createClientForHost(info.endpoint || info.ip, info.port);
  }

  private async createClientForHost(host: string, port: number): Promise<RedisClusterNodeClient> {
    return await this.createNode({
      ...this.opts.connectionConfig,
      host,
      port,
    });
  }

  protected createClientFromSeed(seed: RedisClusterNodeClientOpts): Promise<RedisClusterNodeClient> {
    return this.createNode({
      ...this.opts.connectionConfig,
      ...seed,
    });
  }


  /**
   * 1. Create from host:port
   * 2. Create from node info
   *    1. Use preferred node info host
   *    2. Iterate through all node info hosts
   */

  protected async createNode(config: RedisClusterNodeClientOpts, id?: string): Promise<RedisClusterNode> {
    const client = this.createClientRaw(config);
    client.start();
    const {user, pwd} = config;
    const response = await Promise.all([
      client.hello(3, pwd, user),
      id ? Promise.resolve() : client.clusterMyId(),
    ]);
    this.router.setNode(client);
    return client;
  }

  protected createClientRaw(config: RedisClusterNodeClientOpts): RedisClusterNodeClient {
    const codec = {
      encoder: this.encoder,
      decoder: this.decoder,
    };
    const client = new RedisClusterNodeClient({
      ...this.opts.connectionConfig,
      ...config,
    }, codec);
    return client;
  }


  // ----------------------------------------------------------- Client picking

  public async getClientForKey(key: string, write: boolean): Promise<RedisClusterNodeClient> {
    if (!key) return this.getAnyClient();
    const slot = calculateSlot(key);
    return write ? this.getBestAvailableWriteClient(slot) : this.getBestAvailableReadClient(slot);
  }

  protected getAnyClient(): RedisClusterNodeClient {
    const randomClient = this.router.getRandomClient();
    if (!randomClient) throw new Error('NO_CLIENT');
    return randomClient;
  }

  protected async getAnyClientOrSeed(): Promise<RedisClusterNodeClient> {
    const randomClient = this.router.getRandomClient();
    if (randomClient) return randomClient;
    const seeds = this.opts.seeds;
    const seed = seeds[Math.floor(Math.random() * seeds.length)];
    return this.createClientFromSeed(seed);
  }

  protected async getBestAvailableWriteClient(slot: number): Promise<RedisClusterNodeClient> {
    await this.whenRouterReady();
    const router = this.router;
    const info = router.getMasterNodeForSlot(slot);
    if (!info) return this.getAnyClient();
    const client = router.getClient(info.id);
    if (client) return client;
    return await this.createClientFromInfo(info);
  }

  protected async getBestAvailableReadClient(slot: number): Promise<RedisClusterNodeClient> {
    await this.whenRouterReady();
    const router = this.router;
    const info = router.getRandomNodeForSlot(slot);
    if (!info) return this.getAnyClient();
    const client = router.getClient(info.id);
    if (client) return client;
    return await this.createClientFromInfo(info);
  }


  // -------------------------------------------------------- Command execution

  protected async __call(call: RedisClusterCall): Promise<unknown> {
    const client = call.client!;
    try {
      return await client.call(call);
    } catch (error) {
      if (isMovedError(error)) {
        console.log('MOVED');
        this.scheduleRoutingTableRebuild();
        const redirect = parseMovedError((error as Error).message);
        let host = redirect[0] || client.host;
        if (!host) throw new Error('NO_HOST');
        const port = redirect[1];
        if (port === client.port && host === client.host) throw new Error('SELF_REDIRECT');
        const nextClient = await this.createClientForHost(host, port);
        const next = RedisClusterCall.redirect(call, nextClient, RedirectType.MOVED);
        return await this.__call(next);
      }
      // TODO: Handle ASK redirection.
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
    console.log('key', key, 'isWrite', isWrite);
    call.client = await this.getClientForKey(key, isWrite);
    console.log('client', call.client.host, call.client.port);
    return await this.__call(call);
  }

  public async cmd(args: unknown[], opts?: ClusterCmdOpts): Promise<unknown> {
    const call = new RedisClusterCall(args);
    if (opts) {
      if (opts.utf8Res) call.utf8Res = true;
      if (opts.noRes) call.noRes = true;
      if (opts.key) call.key = opts.key;
      if (opts.maxRedirects) call.maxRedirects = opts.maxRedirects;
    }
    return await this.call(call);
  }
}

export type ClusterCmdOpts = CmdOpts & Partial<Pick<RedisClusterCall, 'key' | 'maxRedirects'>>;
