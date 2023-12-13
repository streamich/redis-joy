import {RedisCall} from "../node";

/**
 * Represents a single Redis request/response command call.
 */
export class RedisClusterCall extends RedisCall {
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
}
