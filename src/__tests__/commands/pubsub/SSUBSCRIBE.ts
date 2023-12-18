import {until} from 'thingies';
import {StandaloneTestSetup} from '../../types';

export const standalone = (setup: StandaloneTestSetup) => {
  describe('SSUBSCRIBE', () => {
    test('can subscribe to a channel', async () => {
      const {client} = await setup();
      const channel = 'shard_channel_' + Date.now();
      client.ssub(channel, () => {});
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    test('can un-subscribe from a channel', async () => {
      const {client} = await setup();
      const channel = 'shard_channel_sub_unsub_' + Date.now();
      const unsubscribe = client.ssub(channel, (recv) => {});
      await new Promise((resolve) => setTimeout(resolve, 5));
      unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    test('can receive a message on a channel', async () => {
      const {client} = await setup();
      const channel = 'shard_channel_' + Date.now();
      const msgs: unknown[] = [];
      client.ssub(channel, (recv) => {
        msgs.push(recv);
      });
      client.spub(channel, new Uint8Array([1, 2, 3]));
      await until(() => msgs.length === 1);
      expect(msgs[0]).toEqual(new Uint8Array([1, 2, 3]));
    });

    test('can receive multiple messages on a channel', async () => {
      const {client} = await setup();
      const channel = 'shard_channel_multiple_' + Date.now();
      const msgs: unknown[] = [];
      client.ssub(channel, (recv) => {
        msgs.push(recv);
      });
      client.spub(channel, new Uint8Array([1]));
      client.spub(channel, new Uint8Array([2]));
      client.spub(channel, new Uint8Array([3]));
      await until(() => msgs.length === 3);
      expect(msgs).toEqual([new Uint8Array([1]), new Uint8Array([2]), new Uint8Array([3])]);
    });

    test('does not receive more messages after un-subscription', async () => {
      const {client} = await setup();
      const channel = 'shard_unsubscribe_' + Date.now();
      const msgs: unknown[] = [];
      const unsubscribe = client.ssub(channel, (recv) => {
        msgs.push(recv);
      });
      await client.spublish(channel, new Uint8Array([1]));
      await client.spublish(channel, new Uint8Array([2]));
      unsubscribe();
      await client.spublish(channel, new Uint8Array([3]));
      await until(() => msgs.length === 2);
      expect(msgs).toEqual([new Uint8Array([1]), new Uint8Array([2])]);
    });

    test('can subscribe twice from the same client', async () => {
      const {client} = await setup();
      const channel = 'shard_twice_' + Date.now();
      const msgs: unknown[] = [];
      client.ssub(channel, (recv) => {
        msgs.push(recv);
      });
      client.ssub(channel, (recv) => {
        msgs.push(recv);
      });
      await client.spublish(channel, new Uint8Array([1]));
      await until(() => msgs.length === 2);
      expect(msgs).toEqual([new Uint8Array([1]), new Uint8Array([1])]);
    });

    test('can subscribe twice from the same client and unsubscribe on subscription', async () => {
      const {client} = await setup();
      const channel = 'shard_twice_and_unsub_' + Date.now();
      const msgs: unknown[] = [];
      const unsubscribe1 = client.ssub(channel, (recv) => {
        msgs.push([1, recv]);
      });
      client.ssub(channel, (recv) => {
        msgs.push([2, recv]);
      });
      await client.spublish(channel, new Uint8Array([1]));
      unsubscribe1();
      await client.spublish(channel, new Uint8Array([2]));
      await until(() => msgs.length === 3);
      expect(msgs).toEqual([
        [1, new Uint8Array([1])],
        [2, new Uint8Array([1])],
        [2, new Uint8Array([2])],
      ]);
    });

    test('can subscribe twice from different clients', async () => {
      const {client} = await setup();
      const {client: client2} = await setup();
      const channel = 'subscribe_twice_diff_clients_' + Date.now();
      const msgs: unknown[] = [];
      const [, subscribed1] = client.ssubscribe(channel, (recv) => {
        msgs.push(recv);
      });
      const [, subscribed2] = client2.ssubscribe(channel, (recv) => {
        msgs.push(recv);
      });
      await subscribed1;
      await subscribed2;
      await client.spublish(channel, new Uint8Array([1]));
      await until(() => msgs.length === 2);
      expect(msgs).toEqual([new Uint8Array([1]), new Uint8Array([1])]);
    });
  });
};
