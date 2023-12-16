import {RedisCall} from "../node";
import {RedirectType} from "./constants";
import type {RedisClusterNodeClient} from "./RedisClusterNodeClient";

/**
 * Represents a single Redis request/response command call.
 */
export class RedisClusterCall extends RedisCall {
  public static chain(call: RedisClusterCall, client: RedisClusterNodeClient): RedisClusterCall {
    const next = new RedisClusterCall(call.args);
    // next.prev = call;
    next.client = client;
    next.redirects = call.redirects;
    next.maxRedirects = call.maxRedirects;
    next.retry = call.retry;
    next.maxRetries = call.maxRetries;
    next.utf8Res = call.utf8Res;
    next.noRes = call.noRes;
    next.key = call.key;
    return next;
  }

  public static redirect(call: RedisClusterCall, client: RedisClusterNodeClient, type: RedirectType): RedisClusterCall {
    const next = RedisClusterCall.chain(call, client);
    // next.redirect = type;
    next.redirects = call.redirects + 1;
    if (next.redirects > next.maxRedirects) throw new Error('MAX_REDIRECTS');
    return next;
  }

  public static retry(call: RedisClusterCall, client: RedisClusterNodeClient): RedisClusterCall {
    const next = RedisClusterCall.chain(call, client);
    next.retry = call.retry + 1;
    if (next.retry > next.maxRetries) throw new Error('MAX_RETRIES');
    return next;
  }

  /**
   * Key to use for routing the command to the correct node.
   */
  public key: string = '';

  /**
   * Type of redirect of this call.
   */
  // public redirect: RedirectType = RedirectType.NONE;

  /**
   * Number of redirects that have been performed for this command.
   */
  public redirects: number = 0;

  /**
   * Maximum number of redirects to perform before giving up.
   */
  public maxRedirects: number = 4;

  /**
   * Number of times this command has been retried.
   */
  public retry: number = 0;

  /**
   * Maximum number of retries to perform before giving up.
   */
  public maxRetries: number = 4;

  /**
   * Client used for this call.
   */
  public client: RedisClusterNodeClient | null = null;

  /**
   * Previous call in the chain, in case the command was redirected.
   */
  // public prev: RedisClusterCall | null = null;
}
