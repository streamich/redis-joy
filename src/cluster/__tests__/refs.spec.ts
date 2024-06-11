import {RedisCluster} from '../RedisCluster';
import {tick} from 'thingies/es2020/tick';
import {ScriptRegistry} from '../../ScriptRegistry';

const setup = () => {
  const scripts = new ScriptRegistry();
  const client = new RedisCluster({
    seeds: [{host: '127.0.0.1', port: 7000}],
  });
  return {client, scripts};
};

if (process.env.TEST_LOCAL_CLUSTER) {
  const {client} = setup();

  test('closes Node refs on .stop()', async () => {
    client.start();
    await tick(100);
    const res = await client.cmd(['PING']);
    expect(res).toBe('PONG');
  });

  afterAll(async () => {
    await client.stop();
    await tick(50);
  });
} else {
  test.todo('To enable cluster tests, set TEST_LOCAL_CLUSTER=1 in your environment variables.');
}
