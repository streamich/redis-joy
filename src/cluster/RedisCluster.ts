import {FanOut} from 'thingies/es2020/fanout';
import {RespEncoder} from 'json-joy/es2020/json-pack/resp';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';
import * as commands from '../generated/commands';
import {Cmd, MultiCmd, PartialExcept, RedisClientCodecOpts} from '../types';
import {RedisClusterRouter} from './RedisClusterRouter';
import {RedisClusterNode} from './RedisClusterNode';
import {RedisClusterCall} from './RedisClusterCall';
import {isAskError, isMovedError, parseMovedError} from './errors';
import {RedisClusterNodeClient, RedisClusterNodeClientOpts} from './RedisClusterNodeClient';
import {RedirectType} from './constants';
import {withTimeout} from '../util/timeout';
import {printTree} from 'json-joy/es2020/util/print/printTree';
import {getSlotAny} from '../util/slots';
import {isMultiCmd} from '../util/commands';
import {ScriptRegistry} from '../ScriptRegistry';
import {ascii} from '../util/buf';
import type {Printable} from 'json-joy/es2020/util/print/types';
import type {CmdOpts} from '../standalone';
import {isNoscriptError} from '../standalone/errors';

const EVALSHA = ascii`EVALSHA`;
const SCRIPT = ascii`SCRIPT`;
const LOAD = ascii`LOAD`;

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

  /**
   * Scripts registry, used for EVALSHA command execution.
   */
  scripts?: ScriptRegistry;
}

export class RedisCluster implements Printable {
  protected readonly encoder: RespEncoder;
  protected readonly decoder: RespStreamingDecoder;
  protected readonly router = new RedisClusterRouter(this);
  protected readonly clients = new Map<string, RedisClusterNodeClient>();

  public readonly scripts: ScriptRegistry;

  constructor(protected readonly opts: PartialExcept<RedisClusterOpts, 'seeds'>) {
    this.encoder = opts.encoder ?? new RespEncoder();
    this.decoder = opts.decoder ?? new RespStreamingDecoder();
    this.scripts = opts.scripts ?? new ScriptRegistry();
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
    this.stopped = true;
    this._routerReadyUnsub?.();
    clearTimeout(this.initialTableBuildTimer);
    this.initialTableBuildTimer = undefined;
    this.initialTableBuildAttempt = 0;
    clearTimeout(this.rebuildTimer);
    this.rebuildTimer = undefined;
    this.isRebuildingRouteTable = false;
    this.routeTableRebuildRetry = 0;
    this.clients.forEach((client) => client.stop());
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
      const client = await this.startClientFromConfig(seedConfig);
      try {
        if (this.stopped) return;
        await this.router.rebuild(client);
      } finally {
        // Discard the seed client as some clusters always return MOVED errors
        // from seed clients.
        client.stop();
      }
      if (this.stopped) return;
      this.initialTableBuildAttempt = 0;
      this.onRouter.emit();
    })().catch((error) => {
      const delay = Math.max(Math.min(1000 * 2 ** attempt, 1000 * 60), 1000);
      this.initialTableBuildTimer = setTimeout(() => this.buildInitialRoutingTable(seed + 1), delay);
      this.onError.emit(error);
    });
  }

  private _routerReady = false;
  private _routerReadyUnsub?: () => void;
  public async whenRouterReady(): Promise<void> {
    if (this._routerReady) return;
    if (!this.router.isEmpty()) return;
    return new Promise((resolve) => {
      this._routerReadyUnsub = this.onRouter.listen(() => {
        this._routerReady = true;
        this._routerReadyUnsub?.();
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
    const client = await this.getAnyClientOrSeedClient();
    if (this.stopped) return;
    await this.router.rebuild(client);
  }

  // ------------------------------------------------------ Client construction

  protected async ensureNodeHasClient(node: RedisClusterNode): Promise<RedisClusterNodeClient> {
    const id = node.id;
    const client = this.clients.get(id);
    if (client) return client;
    return await this.startClientFromNode(node);
  }

  /** When route table is created, it creates clients for each node. */
  private async startClientFromNode(node: RedisClusterNode, hostIndex: number = 0): Promise<RedisClusterNodeClient> {
    const host = node.hosts[hostIndex];
    if (!host) throw new Error('NO_HOST');
    const config: RedisClusterNodeClientOpts = {host, port: node.port, scripts: this.scripts};
    if (node.tls) config.tls = true;
    try {
      const client = await withTimeout(5000, this.startClientFromConfig(config));
      this.clients.set(node.id, client);
      return client;
    } catch (error) {
      if (error instanceof Error && error.message === 'TIMEOUT')
        return await this.startClientFromNode(node, hostIndex + 1);
      throw error;
    }
  }

  protected async startClientFromConfig(config: RedisClusterNodeClientOpts): Promise<RedisClusterNodeClient> {
    const conf = {
      ...this.opts.connectionConfig,
      ...config,
    };
    const client = this.createClient(conf);
    try {
      client.start();
      await withTimeout(5000, client.whenReady);
      return client;
    } catch (error) {
      client.stop();
      throw error;
    }
  }

  protected createClient(conf: RedisClusterNodeClientOpts): RedisClusterNodeClient {
    const codec = {
      encoder: this.encoder,
      decoder: this.decoder,
    };
    return new RedisClusterNodeClient(conf, codec);
  }

  // ----------------------------------------------------------- Client picking

  public getClient(nodeId: string): RedisClusterNodeClient | undefined {
    return this.clients.get(nodeId);
  }

  protected async getRedirectClient(
    host: string,
    port: number,
    oldClient: RedisClusterNodeClient,
  ): Promise<RedisClusterNodeClient> {
    const node = this.router.getNodeByEndpoint(host, port);
    if (node) {
      const client = await this.ensureNodeHasClient(node);
      return client;
    }
    await this.router.rebuild(oldClient);
    const node2 = this.router.getNodeByEndpoint(host, port);
    if (!node2) throw new Error('NO_NODE');
    return await this.ensureNodeHasClient(node2);
  }

  protected getAnyNode(): RedisClusterNode {
    const node = this.router.getRandomNode();
    if (node) return node;
    throw new Error('NO_NODE');
  }

  protected async getAnyClientOrSeedClient(): Promise<RedisClusterNodeClient> {
    const node = this.router.getRandomNode();
    if (node) return await this.ensureNodeHasClient(node);
    const seeds = this.opts.seeds;
    const seed = seeds[Math.floor(Math.random() * seeds.length)];
    const client = await this.startClientFromConfig(seed);
    return client;
  }

  public async getClientForKey(key: string, write: boolean): Promise<RedisClusterNodeClient> {
    if (!key) return await this.getAnyClientOrSeedClient();
    const slot = getSlotAny(key);
    await this.whenRouterReady();
    const router = this.router;
    const node = write ? router.getMasterNodeForSlot(slot) : router.getRandomNodeForSlot(slot);
    if (node) return await this.ensureNodeHasClient(node);
    return await this.getAnyClientOrSeedClient();
  }

  public async getMasterClientForKey(key: string): Promise<RedisClusterNodeClient> {
    if (!this._routerReady) await this.whenRouterReady();
    const router = this.router;
    const slot = getSlotAny(key);
    const node = router.getMasterNodeForSlot(slot);
    if (node) return await this.ensureNodeHasClient(node);
    throw new Error('NO_NODE');
  }

  public async getRandomReplicaClientForKey(key: string): Promise<RedisClusterNodeClient> {
    if (!this._routerReady) await this.whenRouterReady();
    const router = this.router;
    const slot = getSlotAny(key);
    const node = router.getRandomReplicaNodeForSlot(slot);
    if (node) return await this.ensureNodeHasClient(node);
    throw new Error('NO_NODE');
  }

  // -------------------------------------------------------- Command execution

  protected async __call(call: RedisClusterCall): Promise<unknown> {
    const client = call.client!;
    try {
      return await client.call(call);
    } catch (error) {
      if (isMovedError(error)) {
        // console.error('MOVED', [client.host, client.port], error);
        this.scheduleRoutingTableRebuild();
        const redirect = parseMovedError((error as Error).message);
        const host = redirect[0] || client.host;
        if (!host) throw new Error('NO_HOST');
        const port = redirect[1];
        if (port === client.port && host === client.host) throw new Error('SELF_REDIRECT');
        const nextClient = await this.getRedirectClient(host, port, client);
        const next = RedisClusterCall.redirect(call, nextClient, RedirectType.MOVED);
        return await this.__call(next);
      } else if (isAskError(error)) {
        const next = RedisClusterCall.retry(call, client);
        const delay = 50 * 2 ** (next.retry - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return await this.__call(next);
      }
      throw error;
    }
  }

  public async call(call: RedisClusterCall): Promise<unknown> {
    if (!this._routerReady) await this.whenRouterReady();
    const args = call.args;
    let cmd: string = args[0] as string;
    const isMulti = isMultiCmd(args);
    let isWrite: boolean = true;
    let key: string = call.key;
    if (isMulti) {
      if (!key) throw new Error('NO_KEY');
    } else {
      if (typeof cmd !== 'string' || !cmd) throw new Error('INVALID_COMMAND');
      cmd = cmd.toUpperCase();
      isWrite = commands.write.has(cmd);
      if (!key) key = (args.length > 1 ? args[1] + '' : '') || '';
    }
    if (!call.client) {
      const client = await this.getClientForKey(key, isWrite);
      call.client = client;
    }
    return await this.__call(call);
  }

  public async cmd(args: Cmd | MultiCmd, opts?: ClusterCmdOpts): Promise<unknown> {
    const call = this.createCall(args, opts);
    return await this.call(call);
  }

  protected createCall(args: Cmd | MultiCmd, opts?: ClusterCmdOpts): RedisClusterCall {
    const call = new RedisClusterCall(args);
    if (opts) {
      if (opts.utf8) call.utf8 = true;
      if (opts.utf8Res) call.utf8Res = true;
      if (opts.noRes) call.noRes = true;
      if (opts.key) call.key = opts.key;
      if (opts.maxRedirects) call.maxRedirects = opts.maxRedirects;
    }
    return call;
  }

  // ------------------------------------------------------------------ Scripts

  public async eval(
    id: string,
    numkeys: number,
    keys: (string | Uint8Array)[],
    args: (string | Uint8Array)[],
    opts?: CmdOpts,
  ): Promise<unknown> {
    if (!this._routerReady) await this.whenRouterReady();
    const script = this.scripts.get(id);
    if (!script) throw new Error('SCRIPT_NOT_REGISTERED');
    const isWrite = true;
    const sampleKey: string | undefined = keys.length
      ? (typeof keys[0] === 'string' ? keys[0] : Buffer.from(keys[0]).toString()) + ''
      : undefined;
    const client =
      sampleKey !== undefined ? await this.getClientForKey(sampleKey, isWrite) : await this.getAnyClientOrSeedClient();
    const cmd = [EVALSHA, script.sha1, numkeys, ...keys, ...args];
    const call = this.createCall(cmd, opts);
    call.client = client;
    try {
      return await this.__call(call);
    } catch (error) {
      if (!isNoscriptError(error)) throw error;
      // const call2 = RedisClusterCall.retry(call, client);
      const [, result] = await Promise.all([
        client.cmd([SCRIPT, LOAD, script.script], {noRes: true}),
        this.__call(call),
      ]);
      return result;
    }
  }

  // ---------------------------------------------------------------- Printable

  public toString(tab?: string): string {
    return 'cluster' + printTree(tab, [(tab) => this.router.toString(tab)]);
  }
}

export type ClusterCmdOpts = CmdOpts & Partial<Pick<RedisClusterCall, 'key' | 'maxRedirects'>>;
