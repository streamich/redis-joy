import {until} from 'thingies';
import {StandaloneTestSetup} from '../../types';
import {ascii} from '../../../util/buf';

export const standalone = (setup: StandaloneTestSetup) => {
  describe('PSUBSCRIBE', () => {
    test('can subscribe to a pattern', async () => {
      const {client} = await setup();
      const pattern = 's*bscribe_channel_just_sub_' + Date.now();
      client.psub(pattern, () => {});
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    test('can un-subscribe from a pattern', async () => {
      const {client} = await setup();
      const channel = 's*bscribe_channel_sub_unsub_' + Date.now();
      const unsubscribe = client.psub(channel, (recv) => {});
      await new Promise((resolve) => setTimeout(resolve, 5));
      unsubscribe();
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    test('can receive a message by pattern', async () => {
      const {client} = await setup();
      const pattern = 's*bscribe_channel_' + Date.now();
      const msgs: unknown[] = [];
      client.psub(pattern, (recv) => {
        msgs.push(recv);
      });
      client.publish(pattern, new Uint8Array([1, 2, 3]));
      await until(() => msgs.length === 1);
      expect(msgs[0]).toEqual([ascii(pattern), new Uint8Array([1, 2, 3])]);
    });

    test('can receive multiple messages by pattern', async () => {
      const {client} = await setup();
      const pattern = 's*bscribe_channel_multiple_' + Date.now();
      const msgs: unknown[] = [];
      client.psub(pattern, (recv) => {
        msgs.push(recv);
      });
      client.pub(pattern, new Uint8Array([1]));
      client.pub(pattern, new Uint8Array([2]));
      client.pub(pattern, new Uint8Array([3]));
      await until(() => msgs.length === 3);
      expect(msgs).toEqual([
        [ascii(pattern), new Uint8Array([1])],
        [ascii(pattern), new Uint8Array([2])],
        [ascii(pattern), new Uint8Array([3])],
      ]);
    });

    test('does not receive more messages after un-subscription', async () => {
      const {client} = await setup();
      const pattern = 'p*ttern_unsubscribe_' + Date.now();
      const msgs: unknown[] = [];
      const unsubscribe = client.psub(pattern, (recv) => {
        msgs.push(recv);
      });
      await client.publish(pattern, new Uint8Array([1]));
      await client.publish(pattern, new Uint8Array([2]));
      unsubscribe();
      await client.publish(pattern, new Uint8Array([3]));
      await until(() => msgs.length === 2);
      expect(msgs).toEqual([
        [ascii(pattern), new Uint8Array([1])],
        [ascii(pattern), new Uint8Array([2])],
      ]);
    });

    test('can subscribe twice from the same client', async () => {
      const {client} = await setup();
      const pattern = 'p?ttern_twice_' + Date.now();
      const msgs: unknown[] = [];
      client.psub(pattern, (recv) => {
        msgs.push(recv);
      });
      client.psub(pattern, (recv) => {
        msgs.push(recv);
      });
      await client.publish(pattern, new Uint8Array([1]));
      await until(() => msgs.length === 2);
      expect(msgs).toEqual([
        [ascii(pattern), new Uint8Array([1])],
        [ascii(pattern), new Uint8Array([1])],
      ]);
    });

    test('can subscribe twice from the same client and unsubscribe on subscription', async () => {
      const {client} = await setup();
      const pattern = 'pattern_twice_and_unsub_' + Date.now();
      const msgs: unknown[] = [];
      const unsubscribe1 = client.psub(pattern, (recv) => {
        msgs.push([1, recv]);
      });
      client.psub(pattern, (recv) => {
        msgs.push([2, recv]);
      });
      await client.publish(pattern, new Uint8Array([1]));
      unsubscribe1();
      await client.publish(pattern, new Uint8Array([2]));
      await until(() => msgs.length === 3);
      expect(msgs).toEqual([
        [1, [ascii(pattern), new Uint8Array([1])]],
        [2, [ascii(pattern), new Uint8Array([1])]],
        [2, [ascii(pattern), new Uint8Array([2])]],
      ]);
    });

    test('can subscribe twice from different clients', async () => {
      const {client} = await setup();
      const {client: client2} = await setup();
      const pattern = 'p?attern_twice_diff_clients_' + Date.now();
      const msgs: unknown[] = [];
      const [, subscribed1] = client.psubscribe(pattern, (recv) => {
        msgs.push(recv);
      });
      const [, subscribed2] = client2.psubscribe(pattern, (recv) => {
        msgs.push(recv);
      });
      await subscribed1;
      await subscribed2;
      await client.publish(pattern, new Uint8Array([1]));
      await until(() => msgs.length === 2);
      expect(msgs).toEqual([
        [ascii(pattern), new Uint8Array([1])],
        [ascii(pattern), new Uint8Array([1])],
      ]);
    });
  });
};
