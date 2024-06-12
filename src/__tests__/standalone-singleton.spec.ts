import * as net from 'net';
import {StandaloneClient} from '../standalone/StandaloneClient';
import {ClusterTestSetup} from './types';
import * as commands from './commands';
import {ReconnectingSocket} from '../util/ReconnectingSocket';
import {RespEncoder} from '@jsonjoy.com/json-pack/lib/resp/RespEncoder';
import {RespStreamingDecoder} from '@jsonjoy.com/json-pack/lib/resp/RespStreamingDecoder';
import * as config from './config';

const host = config.standalone.host;
const port = config.standalone.port;
const client = new StandaloneClient({
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
