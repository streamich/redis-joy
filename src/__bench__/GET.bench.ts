// npx ts-node src/__bench__/GET.bench.ts

/* tslint:disable no-console */

import {Suite} from 'benchmark';
import * as net from 'net';
import {StandaloneClient} from '../standalone';
import * as config from '../__tests__/config';
import {RespEncoder} from 'json-joy/es2020/json-pack/resp';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';
import {Redis} from 'ioredis';
import {createClient} from 'redis';
import {ReconnectingSocket} from '../util/ReconnectingSocket';

const host = config.standalone.host;
const port = config.standalone.port;
const client = new StandaloneClient({
  socket: new ReconnectingSocket({
    createSocket: () => net.connect({host, port}),
  }),
  encoder: new RespEncoder(),
  decoder: new RespStreamingDecoder(),
});
client.start();

const ioredis = new Redis({
  host,
  port,
});

const key = '{partition}:scope:this_is_a_key';
const value = 'b45165ed3cd437b9ffad02a2aad22a4ddc69162470e2622982889ce5826f6e3d';

const main = async () => {
  const redis = await createClient()
    .on('error', (err) => console.log('Redis Client Error', err))
    .connect();

  await client.cmd(['SET', 'a', 'b']);
  await ioredis.set('a', 'b');
  await redis.set('a', 'b');

  const suite = new Suite();
  suite
    .add('redis-joy', async () => {
      await client.cmd(['SET', key, value]);
      const res = await client.cmd(['GET', key], {utf8Res: true});
      if (res !== value) throw new Error('Unexpected response');
    })
    .add('ioredis', async () => {
      await ioredis.set(key, value);
      // const res = await ioredis.get(key);
      // if (res !== value) throw new Error('Unexpected response');
    })
    .add('redis', async () => {
      await redis.set(key, value);
      // const res = await redis.get(key);
      // if (res !== value) throw new Error('Unexpected response');
    })
    .on('cycle', (event: any) => {
      console.log(String(event.target));
    })
    .on('complete', () => {
      console.log('Fastest is ' + suite.filter('fastest').map('name'));
    })
    .run({async: true});
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
