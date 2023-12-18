import {RespPush} from 'json-joy/es2020/json-pack/resp/extensions';
import type {Cmd, MultiCmd} from '../types';

export const isMultiCmd = (cmd: Cmd | MultiCmd): cmd is MultiCmd => cmd[0] instanceof Array;

export const isPushSubscribe = (val: unknown): boolean => {
  if (!(val instanceof Array)) return false;
  const type = val[0];
  if (type instanceof Uint8Array) {
    if (type.length !== 9) return false;
    return type[0] === 115 && // s
      type[1] === 117 && // u
      type[2] === 98 && // b
      type[3] === 115 && // s
      type[4] === 99 && // c
      type[5] === 114 && // r
      type[6] === 105 && // i
      type[7] === 98 && // b
      type[8] === 101; // e
  }
  if (typeof type === 'string') return type === 'subscribe';
  return false;
};

export const isPushMessage = (val: unknown): boolean => {
  if (!(val instanceof Array)) return false;
  const type = val[0];
  if (type instanceof Uint8Array) {
    if (type.length !== 7) return false;
    return type[0] === 109 && // m
      type[1] === 101 && // e
      type[2] === 115 && // s
      type[3] === 115 && // s
      type[4] === 97 && // a
      type[5] === 103 && // g
      type[6] === 101; // e
  }
  if (typeof type === 'string') return type === 'message';
  return false;
};
