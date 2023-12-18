import * as net from 'net';
import {RedisClient} from '../node/RedisClient';
import {StandaloneTestSetup} from './types';
import * as commands from './commands';
import {ReconnectingSocket} from '../node';
import {RespEncoder} from 'json-joy/es2020/json-pack/resp/RespEncoder';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';

const host = '127.0.0.1';
const port = 6379;
const clients: RedisClient[] = [];

const setupCluster: StandaloneTestSetup = async () => {
  const client = new RedisClient({
    socket: new ReconnectingSocket({
      createSocket: () => net.connect({host, port}),
    }),
    encoder: new RespEncoder(),
    decoder: new RespStreamingDecoder(),
  });
  client.onError.listen((err) => {
    console.error('onError', err);
  });
  // client.onPush.listen((push) => {
  //   console.log(push);
  // });
  client.start();
  clients.push(client);
  await client.whenReady;
  return {client};
};

describe('standalone (client per test)', () => {
  commands.standalone(setupCluster);
});

afterAll(() => {
  for (const client of clients) client.stop();
});
