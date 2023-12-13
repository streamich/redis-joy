import {RedisCall} from "../node";

/**
 * Represents a single Redis request/response command call.
 */
export class RedisClusterCall extends RedisCall {
  /**
   * Key to use for routing the command to the correct node. Used in cluster
   * mode.
   */
  public key: string = '';
}
