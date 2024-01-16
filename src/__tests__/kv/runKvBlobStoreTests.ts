import {KvBlobStore} from './KvBlobStore';
import {blob, utf8} from '../../util/buf';
import {of} from 'thingies';

let cnt = 0;
const getKey = () => utf8`key-${cnt}:${Math.random()}${Date.now()}`;

export const runKvBlobStoreTests = (kv: KvBlobStore) => {
  test('can set and get a key', async () => {
    const key = getKey();
    await kv.create(key, utf8`hello`);
    const value = await kv.get(key);
    expect(value).toEqual(utf8`hello`);
  });

  describe('create', () => {
    test('creates a value', async () => {
      const key = getKey();
      await kv.create(key, blob(1, 2, 3));
      const result = await kv.get(key);
      expect(result).toEqual(blob(1, 2, 3));
    });

    test('cannot rewrite key', async () => {
      const key = getKey();
      await kv.create(key, blob(1, 2, 3));
      let error;
      try {
        await kv.create(key, blob(1, 2, 3));
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(Error);
      expect(await kv.get(key)).toEqual(blob(1, 2, 3));
      const value = await kv.get(key);
      expect(value).toEqual(blob(1, 2, 3));
    });
  });

  describe('update', () => {
    test('throws when updating non-existing key', async () => {
      const key = getKey();
      const [, error] = await of(kv.update(key, Buffer.from([1, 2, 3])));
      expect(error).toBeInstanceOf(Error);
    });

    test('can update existing key', async () => {
      const key = getKey();
      await kv.create(key, utf8`foo`);
      await kv.update(key, utf8`bar`);
      const res = await kv.get(key);
      expect(res).toEqual(utf8`bar`);
    });
  });

  describe('get', () => {
    test('returns value', async () => {
      const key = getKey();
      await kv.create(key, utf8`foo`);
      expect(await kv.get(key)).toEqual(utf8`foo`);
    });

    test('throws PublicErrorNotFound for non-existing key', async () => {
      const key = getKey();
      let error;
      try {
        await kv.get(key);
      } catch (err) {
        error = err;
      }
      expect(error).toBeInstanceOf(Error);
    });

    test('can set and get nulls', async () => {
      await kv.remove(blob(0));
      const key = blob(0);
      await kv.create(key, blob(0));
      expect(await kv.get(key)).toEqual(blob(0));
      await kv.remove(blob(0));
    });
  });

  describe('remove', () => {
    test('can delete key', async () => {
      const key = getKey();
      await kv.create(key, utf8`foo`);
      expect(await kv.get(key)).toEqual(utf8`foo`);
      await kv.remove(key);
      const [, error] = await of(kv.get(key));
      expect(error).toBeInstanceOf(Error);
    });

    test('does not throw on missing key', async () => {
      const key = getKey();
      await kv.remove(key);
    });

    test('can set new key (remove and set)', async () => {
      const key = getKey();
      await kv.create(key, utf8`foo`);
      await kv.remove(key);
      await kv.create(key, utf8`bar`);
      expect(await kv.get(key)).toEqual(utf8`bar`);
    });

    test('returns true if item was deleted', async () => {
      const key = getKey();
      await kv.create(key, Buffer.from('foo'));
      expect(await kv.remove(key)).toBe(true);
      expect(await kv.remove(key)).toBe(false);
    });

    test('returns false when deleting non-existing key', async () => {
      const key = getKey();
      expect(await kv.remove(key)).toBe(false);
    });
  });

  describe('exists', () => {
    test('returns false if key does not exist', async () => {
      const key = getKey();
      expect(await kv.exists(key)).toBe(false);
    });

    test('returns true if key exists', async () => {
      const key = getKey();
      await kv.create(key, Buffer.from('foo'));
      expect(await kv.exists(key)).toBe(true);
    });

    test('returns false if key was deleted', async () => {
      const key = getKey();
      await kv.create(key, Buffer.from('foo'));
      await kv.remove(key);
      expect(await kv.exists(key)).toBe(false);
    });

    test('returns true if key was re-created', async () => {
      const key = getKey();
      await kv.create(key, Buffer.from('foo'));
      await kv.remove(key);
      await kv.create(key, Buffer.from('bar'));
      expect(await kv.exists(key)).toBe(true);
    });
  });

  describe('length', () => {
    test('returns size of value in bytes', async () => {
      const key = getKey();
      await kv.create(key, Buffer.from('test'));
      const res = await kv.length(key);
      expect(res).toBe(4);
    });

    test('the length of emoji', async () => {
      const key = getKey();
      await kv.create(key, Buffer.from('🤷‍♂️'));
      const res = await kv.length(key);
      expect(res).toBe(13);
      const value = await kv.get(key);
      expect(value).toEqual(utf8`🤷‍♂️`);
    });

    test('returns size of value in bytes after update', async () => {
      const key = getKey();
      await kv.create(key, Buffer.from('test'));
      await kv.update(key, Buffer.from('agaga'));
      const res = await kv.length(key);
      expect(res).toBe(5);
    });

    test('returns 0 for a non-existing key', async () => {
      const key = getKey();
      const res = await kv.length(key);
      expect(res).toBe(0);
    });

    test('returns 0 for deleted key', async () => {
      const key = getKey();
      await kv.create(key, Buffer.from('test'));
      await kv.remove(key);
      const res = await kv.length(key);
      expect(res).toBe(0);
    });
  });
};
