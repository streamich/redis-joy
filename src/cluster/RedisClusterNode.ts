import {NodeHealth, NodeRole} from "./constants";
import type {RedisClusterShardsResponseNode} from "../node/types";
import type {RedisClusterNodeClient} from "./RedisClusterNodeClient";

const annotate = (node: RedisClusterNode, nodeInfo: RedisClusterShardsResponseNode): void => {
  node.role = nodeInfo.role === 'master' ? NodeRole.MASTER : NodeRole.REPLICA;
  node.replicationOffset = Number(nodeInfo['replication-offset']);
  const health = nodeInfo.health;
  node.health = health === 'online' ? NodeHealth.ONLINE : health === 'failed' ? NodeHealth.FAILED : NodeHealth.LOADING;
};

export class RedisClusterNode {
  public static fromNodeInfo = (nodeInfo: RedisClusterShardsResponseNode, extraHost: string = ''): RedisClusterNode => {
    const id = nodeInfo.id + '';
    const port = Number(nodeInfo.port ? nodeInfo.port : nodeInfo['tls-port']);
    if (!port) throw new Error('NO_PORT');
    const tls = !!nodeInfo['tls-port'];
    const hosts: string[] = [];
    if (nodeInfo.endpoint && nodeInfo.endpoint !== '?') hosts.push(nodeInfo.endpoint + '');
    if (nodeInfo.hostname && nodeInfo.hostname !== '?') hosts.push(nodeInfo.hostname + '');
    if (nodeInfo.ip && nodeInfo.ip !== '?') hosts.push(nodeInfo.ip + '');
    if (!hosts.length && extraHost) hosts.push(extraHost);
    if (!hosts.length) throw new Error('NO_HOSTS');
    const node = new RedisClusterNode(id, port, hosts, tls);
    annotate(node, nodeInfo);
    return node;
  };

  public static fromNode = (node: RedisClusterNode, nodeInfo: RedisClusterShardsResponseNode): RedisClusterNode => {
    const hosts: string[] = [];
    if (nodeInfo.endpoint && nodeInfo.endpoint !== '?') hosts.push(nodeInfo.endpoint + '');
    if (nodeInfo.hostname && nodeInfo.hostname !== '?') hosts.push(nodeInfo.hostname + '');
    if (nodeInfo.ip && nodeInfo.ip !== '?') hosts.push(nodeInfo.ip + '');
    if (hosts.length) node.hosts.push(...hosts);
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
  public client: RedisClusterNodeClient | undefined = undefined;

  constructor(id: string, port: number, hosts: string[], tls: boolean) {
    this.id = id;
    this.port = port;
    this.hosts = hosts;
    this.tls = tls;
  }
}
