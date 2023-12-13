// npx ts-node src/demo-cluster.ts

import {RedisCluster} from "./cluster/RedisCluster";

const main = async () => {
  // const host = 'localhost';
  // const host = '127.0.0.1';
  // const host = '172.17.0.2';
  // const host = 'redis-15083.c28691.us-east-1-4.ec2.cloud.rlrcp.com';
  const host = '54.166.70.167';
  // const port = 7000;
  const port = 15083;
  const user = 'default';
  const pwd = '7UAmqOMRcZ0KFZUfzze2KaWW8w0Fe8pP';

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
  // await exec(['GET', 'foo']);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
