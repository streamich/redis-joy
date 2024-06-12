import * as net from 'net';
import {StandaloneClient} from '../standalone/StandaloneClient';
import {StandaloneTestSetup} from './types';
import {RespEncoder} from '@jsonjoy.com/json-pack/lib/resp/RespEncoder';
import {RespStreamingDecoder} from '@jsonjoy.com/json-pack/lib/resp/RespStreamingDecoder';
import {ReconnectingSocket} from '../util/ReconnectingSocket';
import * as config from './config';

const host = config.standalone.host;
const port = config.standalone.port;
const clients: StandaloneClient[] = [];

export const setupStandalone: StandaloneTestSetup = async () => {
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
