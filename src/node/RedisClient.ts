import {RespEncoder} from 'json-joy/es2020/json-pack/resp/RespEncoder';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';
import {RespPush} from 'json-joy/es2020/json-pack/resp/extensions';
import {FanOut} from 'thingies/es2020/fanout';
import {Defer} from 'thingies/es2020/Defer';
import {ReconnectingSocket} from './ReconnectingSocket';
import {RedisCall, callNoRes} from './RedisCall';
import {isMultiCmd, isSubscribeAckResponse} from '../util/commands';
import type {Cmd, MultiCmd, RedisClientCodecOpts} from '../types';
import type {RedisHelloResponse} from './types';

export interface RedisClientOpts extends RedisClientCodecOpts {
  socket: ReconnectingSocket;
  user?: string;
  pwd?: string;
}

export class RedisClient {
  protected readonly socket: ReconnectingSocket;

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
  public readonly onPush = new FanOut<unknown>();


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
          const val = msg.val;
          if (isSubscribeAckResponse(val)) {
            if (!call) throw new Error('UNEXPECTED_RESPONSE');
            call.response.resolve(undefined);
            i++;
            continue;
          }
          this.onPush.emit(msg);
          continue;
        }
        if (!call) throw new Error('UNEXPECTED_RESPONSE');
        const res = call.response;
        if (msg instanceof Error) res.reject(msg); else res.resolve(msg);
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
    const args: Cmd = pwd ? ['HELLO', protocol, 'AUTH', usr, pwd] : ['HELLO', protocol];
    return await this.call(new RedisCall(args)) as RedisHelloResponse;
  }
}

export type CmdOpts = Partial<Pick<RedisCall, 'utf8' | 'utf8Res' | 'noRes'>>;
