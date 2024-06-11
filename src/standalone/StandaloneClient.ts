import {RespEncoder} from '@jsonjoy.com/json-pack/lib/resp/RespEncoder';
import {RespStreamingDecoder} from '@jsonjoy.com/json-pack/lib/resp/RespStreamingDecoder';
import {RespPush} from '@jsonjoy.com/json-pack/lib/resp/extensions';
import {FanOut} from 'thingies/lib/fanout';
import {Defer} from 'thingies/lib/Defer';
import {StandaloneCall, callNoRes} from './StandaloneCall';
import {isPushMessage, isMultiCmd, isPushPmessage, isPushSmessage} from '../util/commands';
import {AvlMap} from 'sonic-forest/lib/avl/AvlMap';
import {bufferToUint8Array} from '@jsonjoy.com/util/lib/buffers/bufferToUint8Array';
import {cmpUint8Array, ascii} from '../util/buf';
import {ReconnectingSocket} from '../util/ReconnectingSocket';
import {ScriptRegistry} from '../ScriptRegistry';
import {isNoscriptError} from './errors';
import type {Cmd, MultiCmd, PublicKeys, RedisClientCodecOpts} from '../types';
import type {RedisHelloResponse} from './types';

const HELLO = ascii`HELLO`;
const AUTH = ascii`AUTH`;
const SUBSCRIBE = ascii`SUBSCRIBE`;
const PUBLISH = ascii`PUBLISH`;
const UNSUBSCRIBE = ascii`UNSUBSCRIBE`;
const PSUBSCRIBE = ascii`PSUBSCRIBE`;
const PUNSUBSCRIBE = ascii`PUNSUBSCRIBE`;
const SSUBSCRIBE = ascii`SSUBSCRIBE`;
const SPUBLISH = ascii`SPUBLISH`;
const SUNSUBSCRIBE = ascii`SUNSUBSCRIBE`;
const EVALSHA = ascii`EVALSHA`;
const SCRIPT = ascii`SCRIPT`;
const LOAD = ascii`LOAD`;

export interface RedisClientOpts extends Partial<RedisClientCodecOpts> {
  socket: PublicKeys<ReconnectingSocket>;
  user?: string;
  pwd?: string;
  scripts?: ScriptRegistry;
}

export class StandaloneClient {
  protected readonly socket: PublicKeys<ReconnectingSocket>;
  public readonly scripts: ScriptRegistry;
  public readonly subs = new AvlMap<Uint8Array, FanOut<Uint8Array>>(cmpUint8Array);
  public readonly psubs = new AvlMap<Uint8Array, FanOut<[channel: Uint8Array, message: Uint8Array]>>(cmpUint8Array);
  public readonly ssubs = new AvlMap<Uint8Array, FanOut<Uint8Array>>(cmpUint8Array);

  private _onDataUnsub?: () => void;
  private _onReadyUnsub?: () => void;

  constructor(opts: RedisClientOpts) {
    this.scripts = opts.scripts ?? new ScriptRegistry();
    const socket = (this.socket = opts.socket);
    this.encoder = opts.encoder ?? new RespEncoder();
    const decoder = (this.decoder = opts.decoder ?? new RespStreamingDecoder());
    this._onDataUnsub = socket.onData.listen((data) => {
      decoder.push(data);
      this.scheduleRead();
    });
    this._onReadyUnsub = socket.onReady.listen(() => {
      this.hello(3, opts.pwd, opts.user, true)
        .then(() => {
          this.__whenReady.resolve();
          this.onReady.emit();
        })
        .catch((error) => {
          this.__whenReady.reject(error);
          this.onError.emit(error);
        })
        .finally(() => {
          this._isReady = true;
        });
      const {subs, psubs, ssubs} = this;
      if (!subs.isEmpty()) {
        const subscribeCmd = [SUBSCRIBE];
        subs.forEach((node) => subscribeCmd.push(node.k));
        if (subscribeCmd.length > 1) this.cmdFnF(subscribeCmd);
      }
      if (!psubs.isEmpty()) {
        const subscribeCmd = [PSUBSCRIBE];
        psubs.forEach((node) => subscribeCmd.push(node.k));
        if (subscribeCmd.length > 1) this.cmdFnF(subscribeCmd);
      }
      if (!ssubs.isEmpty()) {
        const subscribeCmd = [SSUBSCRIBE];
        ssubs.forEach((node) => subscribeCmd.push(node.k));
        if (subscribeCmd.length > 1) this.cmdFnF(subscribeCmd);
      }
    });
  }

  public isConnected(): boolean {
    return this.socket.isConnected();
  }

  // ------------------------------------------------------------------- Events

  private readonly __whenReady = new Defer<void>();
  private _isReady = false;
  public readonly whenReady = this.__whenReady.promise;
  public readonly onReady = new FanOut<void>();
  public readonly onError = new FanOut<Error | unknown>();
  public readonly onPush = new FanOut<RespPush>();

  // ------------------------------------------------------------ Socket writes

  protected readonly encoder: RespEncoder;
  protected readonly requests: StandaloneCall[] = [];
  protected encodingTimer?: NodeJS.Immediate = undefined;

  protected scheduleWrite() {
    if (this.encodingTimer) return;
    this.encodingTimer = setImmediate(this.handleWrite);
  }

  private readonly handleWrite = () => {
    try {
      this.encodingTimer = undefined;
      const requests = this.requests;
      const length = requests.length;
      if (length === 0) return;
      const encoder = this.encoder;
      for (let i = 0; i < length; i++) {
        const call = requests[i];
        const cmd = call.args;
        if (isMultiCmd(cmd)) {
          const length = cmd.length;
          if (call.utf8) for (let i = 0; i < length; i++) encoder.writeCmdUtf8(cmd[i]);
          else for (let i = 0; i < length; i++) encoder.writeCmd(cmd[i]);
        } else {
          if (call.utf8) encoder.writeCmdUtf8(cmd);
          else encoder.writeCmd(cmd);
        }
      }
      const buf = encoder.writer.flush();
      // console.log(Buffer.from(buf).toString());
      this.socket.write(buf);
      requests.splice(0, length);
    } catch (error) {
      this.onError.emit(error as Error);
      this.socket.reconnect();
    }
  };

  // ------------------------------------------------------------- Socket reads

  protected readonly decoder: RespStreamingDecoder;
  protected readonly responses: Array<null | StandaloneCall> = [];
  protected decodingTimer?: NodeJS.Immediate = undefined;

  protected scheduleRead() {
    if (this.decodingTimer) return;
    this.decodingTimer = setImmediate(this.handleRead);
  }

  private readonly handleRead = () => {
    try {
      this.decodingTimer = undefined;
      const decoder = this.decoder;
      const responses = this.responses;
      let i = 0;
      while (true) {
        const call = responses[i];
        if (call) decoder.tryUtf8 = !!call.utf8Res;
        const msg = decoder.read();
        if (msg === undefined) break;
        if (msg instanceof RespPush) {
          this.onPush.emit(msg);
          const val = msg.val;
          if (isPushMessage(val)) {
            const fanout = this.subs.get(val[1] as Uint8Array);
            if (fanout) fanout.emit(val[2] as Uint8Array);
            continue;
          }
          if (isPushPmessage(val)) {
            const fanout = this.psubs.get(val[1] as Uint8Array);
            if (fanout) fanout.emit([val[2] as Uint8Array, val[3] as Uint8Array]);
            continue;
          }
          if (isPushSmessage(val)) {
            const fanout = this.ssubs.get(val[1] as Uint8Array);
            if (fanout) fanout.emit(val[2] as Uint8Array);
            continue;
          }
          if (call) call.response.resolve(undefined);
          i++;
          continue;
        }
        if (call instanceof StandaloneCall) {
          const res = call.response;
          if (msg instanceof Error) res.reject(msg);
          else res.resolve(msg);
        } else if (call !== null) throw new Error('UNEXPECTED_RESPONSE');
        i++;
      }
      if (i > 0) responses.splice(0, i);
    } catch (error) {
      this.onError.emit(error as Error);
      this.socket.reconnect();
    }
  };

  // -------------------------------------------------------------- Life cycles

  public start() {
    this.socket.start();
  }

  public stop() {
    this._onDataUnsub?.();
    this._onReadyUnsub?.();
    clearImmediate(this.encodingTimer);
    this.encodingTimer = undefined;
    clearImmediate(this.decodingTimer);
    this.decodingTimer = undefined;
    this.socket.stop();
  }

  // -------------------------------------------------------- Command execution

  public async call(call: StandaloneCall): Promise<unknown> {
    const noResponse = call.noRes;
    if (call.asap) {
      const responseIndex = this.responses.length - this.requests.length;
      this.requests.unshift(call);
      this.responses.splice(responseIndex, 0, noResponse ? null : call);
    } else {
      if (!this._isReady) await this.whenReady;
      this.requests.push(call);
      this.responses.push(noResponse ? null : call);
    }
    this.scheduleWrite();
    return noResponse ? void 0 : call.response.promise;
  }

  public async cmd(args: Cmd | MultiCmd, opts?: CmdOpts): Promise<unknown> {
    const call = new StandaloneCall(args);
    if (opts) {
      if (opts.utf8) call.utf8 = true;
      if (opts.utf8Res) call.utf8Res = true;
      if (opts.noRes) call.noRes = true;
    }
    return this.call(call);
  }

  private callFnf(call: StandaloneCall): void {
    this.requests.push(call);
    this.responses.push(null);
    this.scheduleWrite();
  }

  public cmdFnF(args: Cmd | MultiCmd): void {
    this.callFnf(callNoRes(args));
  }

  // -------------------------------------------------------- Built-in commands

  /** Authenticate and negotiate protocol version. */
  public async hello(
    protocol: 2 | 3,
    pwd?: string,
    usr: string = '',
    asap: boolean = false,
  ): Promise<RedisHelloResponse> {
    const args: Cmd = pwd ? [HELLO, protocol, AUTH, usr, pwd] : [HELLO, protocol];
    const call = new StandaloneCall(args);
    if (asap) call.asap = true;
    return (await this.call(call)) as RedisHelloResponse;
  }

  // ------------------------------------------------------------------ Scripts

  public async eval(
    id: string,
    numkeys: number,
    keys: (string | Uint8Array)[],
    args: (string | Uint8Array)[],
    opts?: CmdOpts,
  ): Promise<unknown> {
    const script = this.scripts.get(id);
    if (!script) throw new Error('SCRIPT_NOT_REGISTERED');
    const cmd = [EVALSHA, script.sha1, numkeys, ...keys, ...args];
    try {
      return await this.cmd(cmd, opts);
    } catch (error) {
      if (!isNoscriptError(error)) throw error;
      const [, result] = await Promise.all([
        this.cmd([SCRIPT, LOAD, script.script], {noRes: true}),
        this.cmd(cmd, opts),
      ]);
      return result;
    }
  }

  // --------------------------------------------------------- Pub/sub commands

  public subscribe(
    channel: Uint8Array | string,
    listener: (message: Uint8Array) => void,
  ): [unsubscribe: () => void, subscribed: Promise<void>] {
    const channelBuf = typeof channel === 'string' ? bufferToUint8Array(Buffer.from(channel)) : channel;
    let fanout = this.subs.get(channelBuf);
    let subscribed: Promise<void>;
    if (!fanout) {
      fanout = new FanOut<Uint8Array>();
      this.subs.set(channelBuf, fanout);
      const call = new StandaloneCall([SUBSCRIBE, channelBuf]);
      this.call(call);
      subscribed = call.response.promise as Promise<void>;
    } else {
      subscribed = Promise.resolve();
    }
    const unsubscribe = fanout.listen(listener);
    return [
      () => {
        unsubscribe();
        if (fanout!.listeners.size === 0) {
          this.subs.del(channelBuf);
          this.cmdFnF([UNSUBSCRIBE, channelBuf]);
        }
      },
      subscribed,
    ];
  }

  public sub(channel: Uint8Array | string, listener: (message: Uint8Array) => void): () => void {
    const channelBuf = typeof channel === 'string' ? bufferToUint8Array(Buffer.from(channel)) : channel;
    let fanout = this.subs.get(channelBuf);
    if (!fanout) {
      fanout = new FanOut<Uint8Array>();
      this.subs.set(channelBuf, fanout);
      this.cmdFnF([SUBSCRIBE, channelBuf]);
    }
    const unsubscribe = fanout.listen(listener);
    return () => {
      unsubscribe();
      if (fanout!.listeners.size === 0) {
        this.subs.del(channelBuf);
        this.cmdFnF([UNSUBSCRIBE, channelBuf]);
      }
    };
  }

  public async publish(channel: Uint8Array | string, message: Uint8Array | string): Promise<number> {
    return (await this.cmd([PUBLISH, channel, message])) as number;
  }

  public pub(channel: Uint8Array | string, message: Uint8Array | string): void {
    return this.cmdFnF([PUBLISH, channel, message]);
  }

  public psubscribe(
    pattern: Uint8Array | string,
    listener: (message: [channel: Uint8Array, message: Uint8Array]) => void,
  ): [unsubscribe: () => void, subscribed: Promise<void>] {
    const patternBuf = typeof pattern === 'string' ? bufferToUint8Array(Buffer.from(pattern)) : pattern;
    let fanout = this.psubs.get(patternBuf);
    let subscribed: Promise<void>;
    if (!fanout) {
      fanout = new FanOut<[Uint8Array, Uint8Array]>();
      this.psubs.set(patternBuf, fanout);
      const call = new StandaloneCall([PSUBSCRIBE, patternBuf]);
      this.call(call);
      subscribed = call.response.promise as Promise<void>;
    } else {
      subscribed = Promise.resolve();
    }
    const unsubscribe = fanout.listen(listener);
    return [
      () => {
        unsubscribe();
        if (fanout!.listeners.size === 0) {
          this.psubs.del(patternBuf);
          this.cmdFnF([PUNSUBSCRIBE, patternBuf]);
        }
      },
      subscribed,
    ];
  }

  public psub(
    pattern: Uint8Array | string,
    listener: (message: [channel: Uint8Array, message: Uint8Array]) => void,
  ): () => void {
    const patternBuf = typeof pattern === 'string' ? bufferToUint8Array(Buffer.from(pattern)) : pattern;
    let fanout = this.psubs.get(patternBuf);
    if (!fanout) {
      fanout = new FanOut<[Uint8Array, Uint8Array]>();
      this.psubs.set(patternBuf, fanout);
      this.cmdFnF([PSUBSCRIBE, patternBuf]);
    }
    const unsubscribe = fanout.listen(listener);
    return () => {
      unsubscribe();
      if (fanout!.listeners.size === 0) {
        this.psubs.del(patternBuf);
        this.cmdFnF([PUNSUBSCRIBE, patternBuf]);
      }
    };
  }

  public ssubscribe(
    channel: Uint8Array | string,
    listener: (message: Uint8Array) => void,
  ): [unsubscribe: () => void, subscribed: Promise<void>] {
    const channelBuf = typeof channel === 'string' ? bufferToUint8Array(Buffer.from(channel)) : channel;
    let fanout = this.ssubs.get(channelBuf);
    let subscribed: Promise<void>;
    if (!fanout) {
      fanout = new FanOut<Uint8Array>();
      this.ssubs.set(channelBuf, fanout);
      const call = new StandaloneCall([SSUBSCRIBE, channelBuf]);
      this.call(call);
      subscribed = call.response.promise as Promise<void>;
    } else {
      subscribed = Promise.resolve();
    }
    const unsubscribe = fanout.listen(listener);
    return [
      () => {
        unsubscribe();
        if (fanout!.listeners.size === 0) {
          this.ssubs.del(channelBuf);
          this.cmdFnF([SUNSUBSCRIBE, channelBuf]);
        }
      },
      subscribed,
    ];
  }

  public ssub(channel: Uint8Array | string, listener: (message: Uint8Array) => void): () => void {
    const channelBuf = typeof channel === 'string' ? bufferToUint8Array(Buffer.from(channel)) : channel;
    let fanout = this.ssubs.get(channelBuf);
    if (!fanout) {
      fanout = new FanOut<Uint8Array>();
      this.ssubs.set(channelBuf, fanout);
      // TODO: create FanOut only after SSUBSCRIBE succeeds
      this.cmdFnF([SSUBSCRIBE, channelBuf]);
    }
    const unsubscribe = fanout.listen(listener);
    return () => {
      unsubscribe();
      if (fanout!.listeners.size === 0) {
        this.ssubs.del(channelBuf);
        this.cmdFnF([SUNSUBSCRIBE, channelBuf]);
      }
    };
  }

  public async spublish(channel: Uint8Array | string, message: Uint8Array | string): Promise<number> {
    return (await this.cmd([SPUBLISH, channel, message])) as number;
  }

  public spub(channel: Uint8Array | string, message: Uint8Array | string): void {
    return this.cmdFnF([SPUBLISH, channel, message]);
  }
}

export type CmdOpts = Partial<Pick<StandaloneCall, 'utf8' | 'utf8Res' | 'noRes'>>;
