// npx ts-node src/demo-cluster.ts

import {RedisCluster} from "./cluster/RedisCluster";

const main = async () => {
  const host = 'localhost';
  const port = 7000;
  const user = 'default';
  const pwd = 'AoQhB7bNYljT8IiZ7nbgvSQSXiGHRwQX';

  const client = new RedisCluster({
    seeds: [
      {
        host,
        port,
        user,
        pwd,
      }
    ],
  });

  client.onError.listen((err) => {
    console.error('onError', err);
  });

  client.start();

  const exec = async (args: unknown[]) => {
    try {
      const res = await client.cmd(args);
      console.log('->', args);
      console.log('<-', res);
    } catch (error) {
      console.log('->', args);
      console.error('<-', error);
    }
  };

  await exec(['SET', 'foo', 'bar']);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
