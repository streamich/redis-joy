import {bufferToUint8Array} from 'json-joy/es2020/util/buffers/bufferToUint8Array';

export const cmpUint8Array = (a: Uint8Array, b: Uint8Array): 1 | 0 | -1 => {
  const len1 = a.length;
  const len2 = b.length;
  if (len1 > len2) return 1;
  if (len1 < len2) return -1;
  for (let i = 0; i < len1; i++) {
    const o1 = a[i];
    const o2 = b[i];
    if (o1 > o2) return 1;
    if (o1 < o2) return -1;
  }
  return 0;
};

export const ascii = (txt: TemplateStringsArray | string | [string], ...args: any[]): Uint8Array => {
  if (typeof txt === 'string') return utf8([txt]);
  let str = '';
  for (let i = 0; i < txt.length; i++) {
    str += txt[i];
    if (i < args.length) str += args[i];
  }
  const len = str.length;
  const res = new Uint8Array(len);
  for (let i = 0; i < len; i++) res[i] = str.charCodeAt(i);
  return res;
};

export const utf8 = (txt: TemplateStringsArray | [string] | string, ...args: any[]): Uint8Array => {
  if (typeof txt === 'string') return utf8([txt]);
  let str = '';
  for (let i = 0; i < txt.length; i++) {
    str += txt[i];
    if (i < args.length) str += args[i];
  }
  return bufferToUint8Array(Buffer.from(str, 'utf8'));
};
