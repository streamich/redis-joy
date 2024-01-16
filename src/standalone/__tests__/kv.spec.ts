import * as net from 'net';
import * as config from '../../__tests__/config';
import {ReconnectingSocket} from '../../util/ReconnectingSocket';
import {StandaloneClient} from '../StandaloneClient';
import {ScriptRegistry} from '../../ScriptRegistry';
import {KvBlobStore} from '../../__tests__/kv/KvBlobStore';
import {utf8} from '../../util/buf';

const setup = () => {
  const host = config.standalone.host;
  const port = config.standalone.port;
  const scripts = new ScriptRegistry();
  const client = new StandaloneClient({
    scripts,
    socket: new ReconnectingSocket({
      createSocket: () => net.connect({host, port}),
    }),
  });
  const kv = new KvBlobStore(utf8 `kv:`, client);
  client.start();
  return {client, scripts, kv};
};

let cnt = 0;
const getKey = () => utf8`key-${cnt}:${Date.now()}`;

test('can set and get a key', async () => {
  const {kv} = setup();
  const key = getKey();
  await kv.create(key, utf8 `hello`);
  const value = await kv.get(key);
  expect(value).toEqual(utf8 `hello`);
});
