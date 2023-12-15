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
import {withTimeout} from '../util/timeout';
import {printTree} from 'json-joy/es2020/util/print/printTree';
import type {Printable} from 'json-joy/es2020/util/print/types';
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

export class RedisCluster implements Printable {
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
    this.buildInitialRoutingTable();
  }

  public stop(): void {
    clearTimeout(this.initialTableBuildTimer);
    this.initialTableBuildAttempt = 0;
    clearTimeout(this.rebuildTimer);
    this.isRebuildingRouteTable = false;
    this.routeTableRebuildRetry = 0;
    this.stopped = true;
  }


  // ---------------------------------------------- Build initial routing table

  private initialTableBuildAttempt = 0;
  private initialTableBuildTimer: NodeJS.Timeout | undefined = undefined;

  private buildInitialRoutingTable(seed: number = 0): void {
    const attempt = this.initialTableBuildAttempt++;
    (async () => {
      if (this.stopped) return;
      if (!this.router.isEmpty()) return;
      const {seeds} = this.opts;
      seed = seed % seeds.length;
      const seedConfig = seeds[seed];
      const node = await this.startClientFromConfig(seedConfig);
      if (this.stopped) return;
      await this.router.rebuild(node);
      if (this.stopped) return;
      this.initialTableBuildAttempt = 0;
      this.onRouter.emit();
    })().catch((error) => {
      const delay = Math.max(Math.min(1000 * 2 ** attempt, 1000 * 60), 1000);
      this.initialTableBuildTimer = setTimeout(() => this.buildInitialRoutingTable(seed + 1), delay);
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

  protected async ensureNodeHasClient(node: RedisClusterNode): Promise<RedisClusterNodeClient> {
    let client = node.client;
    if (client) return client;
    client = await this.startClientFromNode(node);
    node.client = client;
    return client;
  }

  /** When redirect points to a new host, which is not present in the route table */
  private async startClientFromOrphanRedirect(host: string, port: number): Promise<RedisClusterNode> {
    const config: RedisClusterNodeClientOpts = {host, port};
    let node = await this.startClientFromConfig(config);
    node = this.router.mergeNode(node);
    return node;
  }

  /** When route table is created, it creates clients for each node. */
  private async startClientFromNode(node: RedisClusterNode, hostIndex: number = 0): Promise<RedisClusterNodeClient> {
    const host = node.hosts[hostIndex];
    if (!host) throw new Error('NO_HOST');
    const config: RedisClusterNodeClientOpts = {host, port: node.port};
    if (node.tls) config.tls = true;
    try {
      const tmp = await withTimeout(5000, this.startClientFromConfig(config, node.id));
      const client = tmp.client!;
      return node.client = client;
    } catch (error) {
      if (error instanceof Error && error.message === 'TIMEOUT')
        return await this.startClientFromNode(node, hostIndex + 1);
      throw error;
    }
  }

  /** When cluster client boots it creates nodes from seed configs. */
  protected async startClientFromConfig(config: RedisClusterNodeClientOpts, id?: string): Promise<RedisClusterNode> {
    const conf = {
      ...this.opts.connectionConfig,
      ...config,
    };
    const client = this.createClient(conf);
    client.start();
    const {user, pwd} = conf;
    const response = await Promise.all([
      client.hello(3, pwd, user),
      id ? Promise.resolve() : client.clusterMyId(),
    ]);
    id = id || response[1] as string;
    const node = new RedisClusterNode(id, client.port, [client.host], !!conf.tls);
    node.client = client;
    return node;
  }

  protected createClient(conf: RedisClusterNodeClientOpts): RedisClusterNodeClient {
    const codec = {
      encoder: this.encoder,
      decoder: this.decoder,
    };
    return new RedisClusterNodeClient(conf, codec);
  }


  // ----------------------------------------------------------- Client picking

  protected async getRedirectNode(host: string, port: number): Promise<RedisClusterNode> {
    const node = this.router.getNodeByEndpoint(host, port);
    if (!node) return await this.startClientFromOrphanRedirect(host, port);
    this.ensureNodeHasClient(node);
    return node;
  }

  protected getAnyNode(): RedisClusterNode {
    const node = this.router.getRandomNode();
    if (node) return node;
    throw new Error('NO_NODE');
  }

  protected async getAnyNodeOrSeed(): Promise<RedisClusterNode> {
    const node = this.router.getRandomNode();
    if (node) return node;
    const seeds = this.opts.seeds;
    const seed = seeds[Math.floor(Math.random() * seeds.length)];
    return this.startClientFromConfig(seed);
  }

  public async getNodeForKey(key: string, write: boolean): Promise<RedisClusterNode> {
    if (!key) return await this.getAnyNodeOrSeed();
    const slot = calculateSlot(key);
    await this.whenRouterReady();
    const router = this.router;
    const node = write ? router.getMasterNodeForSlot(slot) : router.getRandomReplicaNodeForSlot(slot);
    if (node) return node;
    return await this.getAnyNodeOrSeed();
  }


  // -------------------------------------------------------- Command execution

  protected async __call(call: RedisClusterCall): Promise<unknown> {
    const client = call.client!;
    try {
      return await client.call(call);
    } catch (error) {
      if (isMovedError(error)) {
        console.log('MOVED', error);
        this.scheduleRoutingTableRebuild();
        const redirect = parseMovedError((error as Error).message);
        let host = redirect[0] || client.host;
        if (!host) throw new Error('NO_HOST');
        const port = redirect[1];
        if (port === client.port && host === client.host) throw new Error('SELF_REDIRECT');
        const redirectNode = await this.getRedirectNode(host, port);
        const nextClient = redirectNode.client ?? await this.ensureNodeHasClient(redirectNode);
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
    if (typeof cmd !== 'string' || !cmd) throw new Error('INVALID_COMMAND');
    cmd = cmd.toUpperCase();
    const isWrite = commands.write.has(cmd);
    const key = call.key || (args[1] + '') || '';
    const node = await this.getNodeForKey(key, isWrite);
    if (!node.client) await this.ensureNodeHasClient(node);
    call.client = node.client!;
    console.log(this + '');
    console.log(node.client + '');
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


  // ---------------------------------------------------------------- Printable

  public toString(tab?: string): string {
    return 'cluster' + printTree(tab, [
      tab => this.router.toString(tab),
    ]);
  }
}

export type ClusterCmdOpts = CmdOpts & Partial<Pick<RedisClusterCall, 'key' | 'maxRedirects'>>;
