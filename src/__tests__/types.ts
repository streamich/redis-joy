import {RedisCluster} from '../cluster/RedisCluster';
import {RedisClient} from '../node';

export type TestSetup = ClusterTestSetup;
export type ClusterTestSetup = () => Promise<{
  client: ClusterTestClient;
}>;

export type TextClient = ClusterTestClient;
export type ClusterTestClient = Pick<RedisCluster, 'cmd'>;

export type StandaloneTestSetup = () => Promise<{
  client: StandaloneTestClient;
}>;
export type StandaloneTestClient = Pick<
  RedisClient,
  'cmd' | 'subscribe' | 'sub' | 'publish' | 'pub' | 'psubscribe' | 'psub' | 'ssubscribe' | 'ssub' | 'spub' | 'spublish'
>;
