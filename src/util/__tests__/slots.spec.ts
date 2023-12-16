import {getSlot, getSlotAscii} from '../slots';
import {randomBytes} from 'crypto';

const calculateSlot = require('cluster-key-slot');

describe('getSlot', () => {
  it('fuzzing', () => {
    for (let i = 0; i < 1000; i++) {
      const size = Math.round(Math.random() * 1000);
      const buf = randomBytes(size);
      const slot = getSlot(buf);
      const slot2 = calculateSlot(buf);
      expect(slot).toEqual(slot2);
    }
  });

  it('fuzzing with {brackets}', () => {
    for (let i = 0; i < 1000; i++) {
      const pre = randomBytes(Math.round(Math.random() * 10));
      const mid = randomBytes(Math.round(Math.random() * 10));
      const post = randomBytes(Math.round(Math.random() * 10));
      const buf = Buffer.concat([pre, Buffer.from('{'), mid, Buffer.from('}'), post]);
      const slot = getSlot(buf);
      const slot2 = calculateSlot(buf);
      expect(slot).toEqual(slot2);
    }
  });
});

const randomChar = (): number => {
  let char = randomBytes(1)[0];
  if (char < 35) char += 35;
  if (char > 126) char -= 80;
  return Math.min(126, Math.max(35, char));
};

const randomString = (length: number): string => {
  let str = '';
  for (let i = 0; i < length; i++) str += String.fromCharCode(randomChar());
  return str;
};

describe('getSlotAscii', () => {
  it('fuzzing', () => {
    for (let i = 0; i < 1000; i++) {
      const size = Math.round(Math.random() * 1000);
      const str = randomString(size);
      const slot = getSlotAscii(str);
      const slot2 = calculateSlot(str);
      expect(slot).toEqual(slot2);
    }
  });

  it('fuzzing with {brackets}', () => {
    for (let i = 0; i < 1000; i++) {
      const pre = randomString(Math.round(Math.random() * 10));
      const mid = randomString(Math.round(Math.random() * 10));
      const post = randomString(Math.round(Math.random() * 10));
      const str = pre + '{' + mid + '}' + post;
      const slot = getSlotAscii(str);
      const slot2 = calculateSlot(str);
      expect(slot).toEqual(slot2);
    }
  });
});
