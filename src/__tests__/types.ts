import {RedisCluster} from '../cluster/RedisCluster';

export type TestSetup = ClusterTestSetup;
export type ClusterTestSetup = () => Promise<{
  client: ClusterTestClient;
}>;

export type TextClient = ClusterTestClient;
export type ClusterTestClient = Pick<RedisCluster, 'cmd'>;
