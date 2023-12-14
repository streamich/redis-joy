export type RedisClusterShardsResponse = RedisClusterShardsResponseSlot[];

export interface RedisClusterShardsResponseSlot {
  slots: [number, number];
  nodes: RedisClusterShardsResponseNode[];
}

export interface RedisClusterShardsResponseNode {
  id: string;
  port?: number;
  'tls-port'?: number;
  endpoint?: string;
  hostname?: string;
  ip?: string;
  role: 'master' | 'replica';
  'replication-offset': number;
  health: 'online' | 'failed' | 'loading';
}
