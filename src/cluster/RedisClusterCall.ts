import {RedisCall} from "../node";
import type {RedisClusterNodeClient} from "./RedisClusterNodeClient";

/**
 * Represents a single Redis request/response command call.
 */
export class RedisClusterCall extends RedisCall {
  public static redirect(call: RedisClusterCall, client: RedisClusterNodeClient): RedisClusterCall {
    const next = new RedisClusterCall(call.args);
    next.prev = call;
    next.client = client;
    next.redirects = call.redirects + 1;
    next.maxRedirects = call.maxRedirects;
    if (next.redirects > next.maxRedirects) throw new Error('MAX_REDIRECTS');
    next.utf8Res = call.utf8Res;
    next.noRes = call.noRes;
    next.key = call.key;
    return next;
  }

  /**
   * Key to use for routing the command to the correct node.
   */
  public key: string = '';

  /**
   * Number of redirects that have been performed for this command.
   */
  public redirects: number = 0;

  /**
   * Maximum number of redirects to perform before giving up.
   */
  public maxRedirects: number = 4;

  /**
   * Client used for this call.
   */
  public client: RedisClusterNodeClient | null = null;

  /**
   * Previous call in the chain, in case the command was redirected.
   */
  public prev: RedisClusterCall | null = null;
}
