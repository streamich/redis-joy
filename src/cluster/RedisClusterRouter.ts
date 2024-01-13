import {AvlMap} from 'json-joy/es2020/util/trees/avl/AvlMap';
import {RedisClusterSlotRange} from './RedisClusterSlotRange';
import {RedisClusterNode} from './RedisClusterNode';
import {NodeHealth, NodeRole} from './constants';
import {xorShift32} from 'thingies/es2020/xorshift';
import {printTree} from 'json-joy/es2020/util/print/printTree';
import type {Printable} from 'json-joy/es2020/util/print/types';
import type {RedisCluster} from './RedisCluster';
import type {RedisClusterNodeClient} from './RedisClusterNodeClient';

export class RedisClusterRouter implements Printable {
  /** Map of slots ordered by slot end (min) value. */
  protected readonly ranges = new AvlMap<number, RedisClusterSlotRange>();

  /** Map of node ID to node info instance. */
  protected readonly byId = new Map<string, RedisClusterNode>();

  /** Mapping of "host:port" to node info instance. */
  protected readonly byHostAndPort = new Map<string, RedisClusterNode>();

  constructor(protected readonly cluster: RedisCluster) {}

  /** Whether the route table is empty. */
  public isEmpty(): boolean {
    return this.ranges.isEmpty();
  }

  /**
   * Rebuild the router hash slot mapping.
   * @param client Redis client to use to query the cluster.
   */
  public async rebuild(client: RedisClusterNodeClient): Promise<void> {
    if (!client) throw new Error('NO_CLIENT');
    const slots = await client.clusterShards();
    this.ranges.clear();
    this.byId.clear();
    this.byHostAndPort.clear();
    if (!slots.length) throw new Error('NO_SLOTS');
    for (const slot of slots) {
      const range = new RedisClusterSlotRange(slot.slots[0], slot.slots[1], []);
      for (const nodeInfo of slot.nodes) {
        const node = RedisClusterNode.fromNodeInfo(this.cluster, nodeInfo);
        this.setNode(node);
        range.nodes.push(node);
      }
      this.ranges.insert(range.min, range);
    }
    // TODO: remove orphan clients
  }

  /** Overwrite the node value. */
  public setNode(node: RedisClusterNode): void {
    this.byId.set(node.id, node);
    const port = node.port;
    for (const host of node.hosts) {
      const hostAndPort = host + ':' + port;
      this.byHostAndPort.set(hostAndPort, node);
    }
  }

  /** Merge the node value into a potentially existing node. */
  public mergeNode(node: RedisClusterNode): RedisClusterNode {
    const existing = this.byId.get(node.id);
    if (existing) {
      if (existing.port !== node.port) throw new Error('INVALID_PORT');
      for (const host of node.hosts) {
        if (!existing.hosts.includes(host)) {
          existing.hosts.push(host);
          const endpoint = host + ':' + existing.port;
          this.byHostAndPort.set(endpoint, existing);
        }
      }
      if (existing.role === NodeRole.UNKNOWN) existing.role = node.role;
      if (existing.replicationOffset === 0) existing.replicationOffset = node.replicationOffset;
      if (existing.health === NodeHealth.UNKNOWN) existing.health = node.health;
      return existing;
    } else {
      this.setNode(node);
      return node;
    }
  }

  public getNodeByEndpoint(host: string, port: number): RedisClusterNode | undefined {
    const hostAndPort = host + ':' + port;
    return this.byHostAndPort.get(hostAndPort);
  }

  public getNodesForSlot(slot: number): RedisClusterNode[] {
    const range = this.ranges.getOrNextLower(slot);
    if (!range) return [];
    return range.v.nodes;
  }

  public getMasterNodeForSlot(slot: number): RedisClusterNode | undefined {
    const nodes = this.getNodesForSlot(slot);
    if (!nodes) return undefined;
    for (const node of nodes) if (node.role === NodeRole.MASTER) return node;
    return;
  }

  public getReplicaNodesForSlot(slot: number): RedisClusterNode[] {
    const nodes = this.getNodesForSlot(slot);
    const replicas: RedisClusterNode[] = [];
    for (const node of nodes) if (node.role === NodeRole.REPLICA) replicas.push(node);
    return replicas;
  }

  public getRandomReplicaNodeForSlot(slot: number): RedisClusterNode | undefined {
    const replicas = this.getReplicaNodesForSlot(slot);
    const length = replicas.length;
    if (!length) return undefined;
    const index = xorShift32() % length;
    return replicas[index];
  }

  public getRandomNodeForSlot(slot: number): RedisClusterNode | undefined {
    const nodes = this.getNodesForSlot(slot);
    const length = nodes.length;
    if (!length) return undefined;
    const index = xorShift32() % length;
    return nodes[index];
  }

  public getRandomNode(): RedisClusterNode | undefined {
    const size = this.byId.size;
    if (!size) return undefined;
    const index = xorShift32() % size;
    let i = 0;
    for (const client of this.byId.values()) if (i++ === index) return client;
    return;
  }

  // ---------------------------------------------------------------- Printable

  public toString(tab?: string): string {
    return 'router' + printTree(tab, [(tab) => this.ranges.toString(tab)]);
  }
}
