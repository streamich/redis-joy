import * as net from 'net';
import * as config from '../../__tests__/config';
import {ReconnectingSocket} from '../../util/ReconnectingSocket';
import {StandaloneClient} from '../StandaloneClient';
import {ScriptRegistry} from '../../ScriptRegistry';
import {KvBlobStore} from '../../__tests__/kv/KvBlobStore';
import {utf8} from '../../util/buf';
import {runKvBlobStoreTests} from '../../__tests__/kv/runKvBlobStoreTests';

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

runKvBlobStoreTests(setup().kv);
