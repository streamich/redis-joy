import {NodeHealth, NodeRole} from './constants';
import {printTree} from 'json-joy/es2020/util/print/printTree';
import type {Printable} from 'json-joy/es2020/util/print/types';
import type {RedisClusterShardsResponseNode} from './types';
import type {RedisCluster} from './RedisCluster';

const annotate = (node: RedisClusterNode, nodeInfo: RedisClusterShardsResponseNode): void => {
  node.role = nodeInfo.role === 'master' ? NodeRole.MASTER : NodeRole.REPLICA;
  node.replicationOffset = Number(nodeInfo['replication-offset']);
  const health = nodeInfo.health;
  node.health = health === 'online' ? NodeHealth.ONLINE : health === 'failed' ? NodeHealth.FAILED : NodeHealth.LOADING;
};

export class RedisClusterNode implements Printable {
  public static fromNodeInfo = (cluster: RedisCluster, nodeInfo: RedisClusterShardsResponseNode): RedisClusterNode => {
    const id = nodeInfo.id + '';
    const port = Number(nodeInfo.port ? nodeInfo.port : nodeInfo['tls-port']);
    if (!port) throw new Error('NO_PORT');
    const tls = !!nodeInfo['tls-port'];
    const hosts: string[] = [];
    if (nodeInfo.endpoint && nodeInfo.endpoint !== '?') hosts.push(nodeInfo.endpoint + '');
    if (nodeInfo.hostname && nodeInfo.hostname !== '?') hosts.push(nodeInfo.hostname + '');
    if (nodeInfo.ip && nodeInfo.ip !== '?') hosts.push(nodeInfo.ip + '');
    if (!hosts.length) throw new Error('NO_HOSTS');
    const node = new RedisClusterNode(cluster, id, port, hosts, tls);
    annotate(node, nodeInfo);
    return node;
  };

  public readonly id: string;
  public readonly port: number;
  public readonly hosts: string[];
  public readonly tls: boolean = false;
  public role: NodeRole = NodeRole.UNKNOWN;
  public replicationOffset: number = 0;
  public health: NodeHealth = NodeHealth.UNKNOWN;

  constructor(
    protected readonly cluster: RedisCluster,
    id: string,
    port: number,
    hosts: string[],
    tls: boolean,
  ) {
    this.id = id;
    this.port = port;
    this.hosts = [...new Set(hosts)];
    this.tls = tls;
  }

  // ---------------------------------------------------------------- Printable

  public toString(tab?: string): string {
    const role = this.role === NodeRole.MASTER ? 'master' : 'replica';
    const health =
      this.health === NodeHealth.ONLINE ? 'online' : this.health === NodeHealth.FAILED ? 'failed' : 'loading';
    const client = this.cluster.getClient(this.id);
    return (
      `node (${this.id})${this.tls ? ' TLS' : ''} [${this.hosts.join(', ')}]:${this.port} ${role} ${
        this.replicationOffset
      } ${health}` + printTree(tab, [(tab) => (client ? `${client.toString(tab)}` : 'on client')])
    );
  }
}
