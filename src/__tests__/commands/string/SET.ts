import {ClusterTestSetup} from '../../types';

export const run = (setup: ClusterTestSetup) => {
  describe('SET', () => {
    test('can set a key', async () => {
      const {client} = await setup();
      const res = await client.cmd(['SET', 'foo', 'bar']);
      expect(res).toBe('OK');
    });

    test('can set a key with partition brackets', async () => {
      const {client} = await setup();
      const res = await client.cmd(['SET', '{foo}', 'bar']);
      expect(res).toBe('OK');
    });
  });
};
