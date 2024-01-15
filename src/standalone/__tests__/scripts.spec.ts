import * as net from 'net';
import * as config from '../../__tests__/config';
import {ReconnectingSocket} from '../../util/ReconnectingSocket';
import {StandaloneClient} from '../StandaloneClient';
import {ScriptRegistry} from '../../ScriptRegistry';

const host = config.standalone.host;
const port = config.standalone.port;
const scripts = new ScriptRegistry();
const client = new StandaloneClient({
  scripts,
  socket: new ReconnectingSocket({
    createSocket: () => net.connect({host, port}),
  }),
});
client.start();

scripts.set('hello-scripting', "return 'Hello, scripting!'");

test('can run a script', async () => {
  const res = await client.eval('hello-scripting', 0, [], [], {utf8Res: true});
  expect(res).toBe('Hello, scripting!');
});
