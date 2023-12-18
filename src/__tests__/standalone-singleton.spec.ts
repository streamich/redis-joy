import * as net from 'net';
import {RedisClient} from '../node/RedisClient';
import {ClusterTestSetup} from './types';
import * as commands from './commands';
import {ReconnectingSocket} from '../node';
import {RespEncoder} from 'json-joy/es2020/json-pack/resp/RespEncoder';
import {RespStreamingDecoder} from 'json-joy/es2020/json-pack/resp/RespStreamingDecoder';
import * as config from './config';

const host = config.standalone.host;
const port = config.standalone.port;
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
client.start();

const setupCluster: ClusterTestSetup = async () => {
  await client.whenReady;
  return {client};
};

describe('standalone (singleton client)', () => {
  commands.run(setupCluster);
});

afterAll(() => {
  client.stop();
});
