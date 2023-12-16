// npx ts-node src/demo-cluster.ts

import {ClusterCmdOpts, RedisCluster} from './cluster/RedisCluster';
import type {Cmd, MultiCmd} from './types';

const main = async () => {
  // const host = 'localhost';
  // const host = '127.0.0.1';
  // const host = '172.17.0.2';
  // const host = 'redis-15083.c28691.us-east-1-4.ec2.cloud.rlrcp.com';
  const host = 'redis-15083.c28691.us-east-1-4.ec2.cloud.rlrcp.com';
  // const host = '54.166.70.167';
  // const port = 7000;
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

  const exec = async (args: Cmd | MultiCmd, opts?: ClusterCmdOpts) => {
    try {
      const res = await client.cmd(args, opts);
      console.log('->', args);
      console.log('<-', res);
    } catch (error) {
      console.log('->', args);
      console.error('<-', error);
    }
  };

  await exec(['SET', 'foo', 1]);
  await exec(['SET', '{foo}bar', 'foobar']);
  await exec(['SET', 'bar', 2]);
  await exec(['SET', 'baz', 3]);
  await exec(['SET', 'qux', 4]);
  await exec(['SET', 'quux', 5], {key: 'quux'});

  await exec(['INCR', 'foo']);

  await Promise.all([
    exec(['GET', 'foo'], {utf8Res: true}),
    exec(['GET', 'bar']),
    exec(['GET', 'baz']),
    exec(['GET', 'qux']),
    exec(['GET', 'quux']),
  ]);

  await exec([['MULTI'], ['SET', 'foo', 1], ['SET', '{foo}bar', 2], ['SET', 'baz{foo}', 3], ['EXEC']], {
    key: '{foo}bar',
  });
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
