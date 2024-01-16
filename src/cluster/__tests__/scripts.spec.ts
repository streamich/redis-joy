import {RedisCluster} from '../RedisCluster';

const setup = () => {
  const cluster = new RedisCluster({
    seeds: [{host: '127.0.0.1', port: 7000}],
  });
  return {cluster};
};

let keyCnt = 1;
const getKey = () => '{redis-cluster-script}-test-' + keyCnt++;

if (process.env.TEST_LOCAL_CLUSTER) {
  test('can execute a script', async () => {
    const {cluster} = setup();
    cluster.start();
    const scriptId = 'hello-scripting-cluster-test-' + Date.now();
    cluster.scripts.set(scriptId, "return 'Hello, scripting!'");
    const res = await cluster.eval(scriptId, 0, [], [], {utf8Res: true});
    expect(res).toBe('Hello, scripting!');
    cluster.stop();
  });

  test('can run a with keys and arguments', async () => {
    const {cluster} = setup();
    cluster.start();
    const scriptName = '{add-script-cluster}-' + Date.now();
    cluster.scripts.set(scriptName, `return tonumber(redis.call("get",KEYS[1])) + tonumber(ARGV[1])`);
    const key = getKey();
    await cluster.cmd(['SET', key, '1']);
    const res = await cluster.eval(scriptName, 1, [key], ['2'], {utf8Res: true});
    expect(res).toBe(3);
    cluster.stop();
  });
  
} else {
  test.todo('To enable cluster tests, set TEST_LOCAL_CLUSTER=1 in your environment variables.');
}
