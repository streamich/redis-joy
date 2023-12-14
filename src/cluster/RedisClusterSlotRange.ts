import {RedisClusterNode} from './RedisClusterNode';

export class RedisClusterSlotRange {
  constructor(public readonly min: number, public readonly max: number, public readonly nodes: RedisClusterNode[]) {}
}
