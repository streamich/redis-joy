import {TestSetup} from '../../types';

export const run = (setup: TestSetup) => {
  describe('SUBSCRIBE', () => {
    test('can subscribe to a key', async () => {
      const {client} = await setup();
      const key = 'subscribe_key_' + Date.now();
      const res = await client.cmd(['SUBSCRIBE', key]);
      expect(res).toBe(undefined);
    });
  });
};
