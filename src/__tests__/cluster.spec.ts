import {RedisCluster} from '../cluster/RedisCluster';
import {ClusterTestSetup} from './types';
import * as commands from './commands';
import * as config from './config';

if (process.env.TEST_CLUSTER) {
  const host = config.cluster.host;
  const port = config.cluster.port;
  const user = config.cluster.user;
  const pwd = config.cluster.pwd;
  const client = new RedisCluster({
    seeds: [{host, port}],
    connectionConfig: {
      user,
      pwd,
    },
  });
  // client.onError.listen((err) => {
  //   console.error('onError', err);
  // });
  client.start();

  const setupCluster: ClusterTestSetup = async () => {
    await client.whenRouterReady();
    return {client};
  };

  describe('cluster', () => {
    commands.run(setupCluster);
  });

  afterAll(() => {
    client.stop();
  });
} else {
  test.todo('To enable cluster tests, set TEST_CLUSTER=1 in your environment variables.');
}
