import {RedisCluster} from '../cluster/RedisCluster';
import {StandaloneClient} from '../standalone';

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
  StandaloneClient,
  | 'cmd'
  | 'subscribe'
  | 'sub'
  | 'publish'
  | 'pub'
  | 'psubscribe'
  | 'psub'
  | 'ssubscribe'
  | 'ssub'
  | 'spub'
  | 'spublish'
  | 'isConnected'
>;
