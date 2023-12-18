import {TestSetup} from '../../types';

export const run = (setup: TestSetup) => {
  describe('GET', () => {
    test('missing key returns null', async () => {
      const {client} = await setup();
      const res = await client.cmd(['GET', 'missing_key']);
      expect(res).toBe(null);
    });

    test('can get a key', async () => {
      const {client} = await setup();
      const key = 'fetch_existing_key_' + Date.now();
      await client.cmd(['SET', key, '42']);
      const res = await client.cmd(['GET', key], {utf8Res: true});
      expect(res).toBe('42');
    });

    test('key can contain UTF-8 characters', async () => {
      const {client} = await setup();
      const key = 'key_with_emoji_😛_' + Date.now();
      await client.cmd(['SET', key, '42'], {utf8: true});
      const keyBuf = Buffer.from(key);
      const res = await client.cmd(['GET', keyBuf], {utf8Res: true});
      expect(res).toBe('42');
    });

    test('value can contain UTF-8 characters', async () => {
      const {client} = await setup();
      const key = 'value_with_emoji_' + Date.now();
      await client.cmd(['SET', key, '😅'], {utf8: true});
      const res = await client.cmd(['GET', key], {utf8Res: true});
      expect(res).toBe('😅');
    });
  });
};

export const standalone = (setup: TestSetup) => {
  describe('GET', () => {
    test('can get a key after disconnect', async () => {
      const {client} = await setup();
      const key = 'fetch_existing_key_disconnect_' + Date.now();
      await client.cmd(['SET', key, '42']);
      (client as any).socket.socket.destroy();
      const res = await client.cmd(['GET', key], {utf8Res: true});
      expect(res).toBe('42');
    });
  });
};
