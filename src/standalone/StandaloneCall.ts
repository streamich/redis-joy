import {Defer} from 'thingies/es2020/Defer';
import type {Cmd, MultiCmd} from '../types';

export const callNoRes = (args: Cmd | MultiCmd) => {
  const call = new StandaloneCall(args);
  call.noRes = true;
  return call;
};

/**
 * Represents a single Redis request/response command call.
 */
export class StandaloneCall {
  /**
   * Whether to encode command arguments as UTF-8 strings.
   */
  public utf8: boolean = false;

  /**
   * Whether to try to decode RESP responses binary strings as UTF-8 strings.
   */
  public utf8Res: boolean = false;

  /**
   * Whether to ignore the response. This is useful for commands like PUBLISH
   * where the response is not useful. Or where it is not needed.
   */
  public noRes: boolean = false;

  public readonly response = new Defer<unknown>();

  constructor(public args: Cmd | MultiCmd) {}
}
