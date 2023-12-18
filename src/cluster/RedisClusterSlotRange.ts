import {RedisClusterNode} from './RedisClusterNode';
import {printTree} from 'json-joy/es2020/util/print/printTree';
import type {Printable} from 'json-joy/es2020/util/print/types';

export class RedisClusterSlotRange implements Printable {
  constructor(
    public readonly min: number,
    public readonly max: number,
    public readonly nodes: RedisClusterNode[],
  ) {}

  // ---------------------------------------------------------------- Printable

  public toString(tab?: string): string {
    return (
      'range' +
      printTree(tab, [
        (tab) => `min: ${this.min}`,
        (tab) => `max: ${this.max}`,
        (tab) =>
          'nodes' +
          printTree(
            tab,
            this.nodes.map((node) => (tab) => node.toString(tab)),
          ),
      ])
    );
  }
}
