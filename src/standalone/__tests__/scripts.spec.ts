import * as net from 'net';
import * as config from '../../__tests__/config';
import {ReconnectingSocket} from '../../util/ReconnectingSocket';
import {StandaloneClient} from '../StandaloneClient';
import {ScriptRegistry} from '../../ScriptRegistry';

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
  client.start();
  return {client, scripts};
};

test('can run a script', async () => {
  const {client} = setup();
  client.scripts.set('hello-scripting', "return 'Hello, scripting!'");
  const res = await client.eval('hello-scripting', 0, [], [], {utf8Res: true});
  expect(res).toBe('Hello, scripting!');
  client.stop();
});

test('can run a with keys and arguments', async () => {
  const {client} = setup();
  client.scripts.set('add', `return tonumber(redis.call("get",KEYS[1])) + tonumber(ARGV[1])`);
  const key = 'script-key-test';
  await client.cmd(['SET', key, '1']);
  const res = await client.eval('add', 1, [key], ['2'], {utf8Res: true});
  expect(res).toBe(3);
  client.stop();
});
