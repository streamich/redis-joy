import {RedisCluster} from '../../../cluster/RedisCluster';
import {ClusterTestSetup} from '../../types';
import {run} from './SET';

const host = 'redis-15083.c28691.us-east-1-4.ec2.cloud.rlrcp.com';
const port = 15083;
const user = 'default';
const pwd = '7UAmqOMRcZ0KFZUfzze2KaWW8w0Fe8pP';
const client = new RedisCluster({
  seeds: [{host, port}],
  connectionConfig: {
    user,
    pwd,
  },
});
client.onError.listen((err) => {
  console.error('onError', err);
});
client.start();

const setupCluster: ClusterTestSetup = async () => {
  await client.whenRouterReady();
  return {client};
};

run(setupCluster);

afterAll(() => {
  client.stop();
});
