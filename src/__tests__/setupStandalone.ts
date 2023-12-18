import * as net from 'net';
import {RedisClient} from '../node/RedisClient';
import {StandaloneTestSetup} from './types';
import {ReconnectingSocket} from '../node';
import {RespEncoder} from 'json-joy/es2020/json-pack/resp/RespEncoder';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';
import * as config from './config';

const host = config.standalone.host;
const port = config.standalone.port;
const clients: RedisClient[] = [];

export const setupStandalone: StandaloneTestSetup = async () => {
  const client = new RedisClient({
    socket: new ReconnectingSocket({
      createSocket: () => net.connect({host, port}),
    }),
    encoder: new RespEncoder(),
    decoder: new RespStreamingDecoder(),
  });
  // client.onError.listen((err) => {
  //   console.error('onError', err);
  // });
  // client.onPush.listen((push) => {
  //   console.log(push);
  // });
  client.start();
  clients.push(client);
  await client.whenReady;
  return {client};
};

afterAll(() => {
  for (const client of clients) client.stop();
});
