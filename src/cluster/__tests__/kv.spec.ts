import {utf8} from '../../util/buf';
import {runKvBlobStoreTests} from '../../__tests__/kv/runKvBlobStoreTests';
import {tick} from 'thingies';
import {RedisCluster} from '../RedisCluster';
import {KvBlobStore} from '../../__tests__/kv/KvBlobStore';
import {ScriptRegistry} from '../../ScriptRegistry';

const setup = () => {
  const scripts = new ScriptRegistry();
  const client = new RedisCluster({
    seeds: [{host: '127.0.0.1', port: 7000}],
  });
  const kv = new KvBlobStore(utf8`kv:`, client);
  client.start();
  return {client, scripts, kv};
};

if (process.env.TEST_LOCAL_CLUSTER) {
  const {kv, client} = setup();

  runKvBlobStoreTests(kv);

  afterAll(async () => {
    await client.stop();
    await tick(50);
  });
} else {
  test.todo('To enable cluster tests, set TEST_LOCAL_CLUSTER=1 in your environment variables.');
}
