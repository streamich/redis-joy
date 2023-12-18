import {RespEncoder} from 'json-joy/es2020/json-pack/resp/RespEncoder';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';
import {RespPush} from 'json-joy/es2020/json-pack/resp/extensions';
import {FanOut} from 'thingies/es2020/fanout';
import {Defer} from 'thingies/es2020/Defer';
import {ReconnectingSocket} from './ReconnectingSocket';
import {RedisCall, callNoRes} from './RedisCall';
import {isPushMessage, isMultiCmd, isPushPmessage, isPushSmessage} from '../util/commands';
import {AvlMap} from 'json-joy/es2020/util/trees/avl/AvlMap';
import {bufferToUint8Array} from 'json-joy/es2020/util/buffers/bufferToUint8Array';
import {cmpUint8Array, ascii} from '../util/buf';
import type {Cmd, MultiCmd, RedisClientCodecOpts} from '../types';
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

export interface RedisClientOpts extends RedisClientCodecOpts {
  socket: ReconnectingSocket;
  user?: string;
  pwd?: string;
}

export class RedisClient {
  protected readonly socket: ReconnectingSocket;
  public readonly subs = new AvlMap<Uint8Array, FanOut<Uint8Array>>(cmpUint8Array);
  public readonly psubs = new AvlMap<Uint8Array, FanOut<[channel: Uint8Array, message: Uint8Array]>>(cmpUint8Array);
  public readonly ssubs = new AvlMap<Uint8Array, FanOut<Uint8Array>>(cmpUint8Array);

  constructor(opts: RedisClientOpts) {
    const socket = (this.socket = opts.socket);
    this.encoder = opts.encoder;
    const decoder = (this.decoder = opts.decoder);
    socket.onData.listen((data) => {
      decoder.push(data);
      this.scheduleRead();
    });
    socket.onReady.listen(() => {
      this.hello(3, opts.pwd, opts.user)
        .then(() => {
          this.__whenReady.resolve();
          this.onReady.emit();
        })
        .catch((error) => {
          this.__whenReady.reject(error);
          this.onError.emit(error);
        });
    });
  }

  // ------------------------------------------------------------------- Events

  private readonly __whenReady = new Defer<void>();
  public readonly whenReady = this.__whenReady.promise;
  public readonly onReady = new FanOut<void>();
  public readonly onError = new FanOut<Error | unknown>();
  public readonly onPush = new FanOut<RespPush>();

  // ------------------------------------------------------------ Socket writes

  protected readonly encoder: RespEncoder;
  protected readonly requests: RedisCall[] = [];
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
  protected readonly responses: Array<null | RedisCall> = [];
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
        // console.log(msg);
        if (msg === undefined) break;
        if (msg instanceof RespPush) {
          this.onPush.emit(msg);
          const val = msg.val;
          // console.log('push', Buffer.from(val[0] as any).toString());
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
        if (call instanceof RedisCall) {
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
    this.socket.stop();
  }

  // -------------------------------------------------------- Command execution

  public async call(call: RedisCall): Promise<unknown> {
    const noResponse = call.noRes;
    this.requests.push(call);
    this.responses.push(noResponse ? null : call);
    this.scheduleWrite();
    return noResponse ? void 0 : call.response.promise;
  }

  public async cmd(args: Cmd | MultiCmd, opts?: CmdOpts): Promise<unknown> {
    const call = new RedisCall(args);
    if (opts) {
      if (opts.utf8) call.utf8 = true;
      if (opts.utf8Res) call.utf8Res = true;
      if (opts.noRes) call.noRes = true;
    }
    return this.call(call);
  }

  private callFnf(call: RedisCall): void {
    this.requests.push(call);
    this.responses.push(null);
    this.scheduleWrite();
  }

  public cmdFnF(args: Cmd | MultiCmd): void {
    this.callFnf(callNoRes(args));
  }

  // -------------------------------------------------------- Built-in commands

  /** Authenticate and negotiate protocol version. */
  public async hello(protocol: 2 | 3, pwd?: string, usr: string = ''): Promise<RedisHelloResponse> {
    const args: Cmd = pwd ? [HELLO, protocol, AUTH, usr, pwd] : [HELLO, protocol];
    return (await this.call(new RedisCall(args))) as RedisHelloResponse;
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
      const call = new RedisCall([SUBSCRIBE, channelBuf]);
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
      const call = new RedisCall([PSUBSCRIBE, patternBuf]);
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

  public ssubscribe(channel: Uint8Array | string, listener: (message: Uint8Array) => void): [unsubscribe: () => void, subscribed: Promise<void>] {
    const channelBuf = typeof channel === 'string' ? bufferToUint8Array(Buffer.from(channel)) : channel;
    let fanout = this.ssubs.get(channelBuf);
    let subscribed: Promise<void>;
    if (!fanout) {
      fanout = new FanOut<Uint8Array>();
      this.ssubs.set(channelBuf, fanout);
      const call = new RedisCall([SSUBSCRIBE, channelBuf]);
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

export type CmdOpts = Partial<Pick<RedisCall, 'utf8' | 'utf8Res' | 'noRes'>>;
