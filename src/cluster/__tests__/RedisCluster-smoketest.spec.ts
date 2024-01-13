import {RedisCluster} from '../RedisCluster';

const setup = () => {
  const cluster = new RedisCluster({
    seeds: [{host: '127.0.0.1', port: 7000}],
  });
  return {cluster};
};

let keyCnt = 1;
const getKey = () => 'redis-cluster-smoketest-foo' + keyCnt++;

if (process.env.TEST_LOCAL_CLUSTER) {
  test('can set a key', async () => {
    const {cluster} = setup();
    cluster.start();
    const key = getKey();
    await cluster.cmd(['SET', key, 'bar']);
    cluster.stop();
  });
  
  test('can set and get a key using master client', async () => {
    const {cluster} = setup();
    cluster.start();
    const key = getKey();
    const client = await cluster.getMasterClientForKey(key);
    await client.cmd(['SET', key, 'bar']);
    const res = await client.cmd(['GET', key], {utf8Res: true});
    expect(res).toBe('bar');
    cluster.stop();
  });
  
  test('can set and get a key', async () => {
    const {cluster} = setup();
    cluster.start();
    const key = getKey();
    await cluster.cmd(['SET', key, 'bar']);
    const res = await cluster.cmd(['GET', key], {utf8Res: true});
    expect(res).toBe('bar');
    cluster.stop();
  });  
} else {
  test.todo('To enable cluster tests, set TEST_LOCAL_CLUSTER=1 in your environment variables.');
}
