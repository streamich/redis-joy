import type {RespEncoder} from '@jsonjoy.com/json-pack/lib/resp';
import type {RespStreamingDecoder} from '@jsonjoy.com/json-pack/lib/resp/RespStreamingDecoder';

export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export interface RedisClientCodecOpts {
  encoder: RespEncoder;
  decoder: RespStreamingDecoder;
}

export type MultiCmd = Cmd[];
export type Cmd = Arg[];
export type Arg = string | number | Uint8Array;
export type ParsedCmd = [cmd: string, ...args: Uint8Array[]];

export type PublicKeys<T> = Pick<T, keyof T>;
