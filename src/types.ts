import type {RespEncoder} from "json-joy/es2020/json-pack/resp";
import type {RespStreamingDecoder} from "json-joy/es2020/json-pack/resp/RespStreamingDecoder";

export type PartialExcept<T, K extends keyof T> = Partial<T> & Pick<T, K>;

export interface RedisClientCodecOpts {
  encoder: RespEncoder;
  decoder: RespStreamingDecoder;
}
