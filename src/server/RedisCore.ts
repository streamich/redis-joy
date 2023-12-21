import {AvlNode} from 'json-joy/es2020/util/trees/avl/AvlMap';
import {IAvlTreeNode} from 'json-joy/es2020/util/trees/avl/types';
import {insert} from 'json-joy/es2020/util/trees/avl/util';
import {cmpUint8Array} from '../util/buf';

export class KeyNode<V = unknown> implements IAvlTreeNode<Uint8Array, V> {
  public p: AvlNode<Uint8Array, V> | undefined = undefined;
  public l: AvlNode<Uint8Array, V> | undefined = undefined;
  public r: AvlNode<Uint8Array, V> | undefined = undefined;
  public bf: number = 0;
  constructor(public readonly k: Uint8Array, public v: V) {}
}

export class StringKeyNode extends KeyNode<Uint8Array> {}

export class RedisCore {
  public keys: KeyNode | undefined = undefined;

  public insert<N extends KeyNode<any>>(node: N): void {
    this.keys = insert(this.keys, node, cmpUint8Array);
  }

  public find(k: Uint8Array): KeyNode | undefined {
    let curr: KeyNode | undefined = this.keys;
    while (curr) {
      const cmp = cmpUint8Array(k, curr.k);
      if (cmp === 0) return curr;
      curr = cmp < 0 ? (curr.l as KeyNode) : (curr.r as KeyNode);
    }
    return undefined;
  }
}
