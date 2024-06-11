import {RedisClusterNode} from './RedisClusterNode';
import {printTree} from 'tree-dump/lib/printTree';
import type {Printable} from 'tree-dump/lib/types';

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
