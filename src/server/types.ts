import type {ParsedCmd} from "../types";
import {RedisCore} from "./RedisCore";

export interface ICommand {
  name: string;
  exec: (cmd: ParsedCmd, core: RedisCore) => unknown;
}

export interface RedisServerConnection {
  write: (data: string) => void;
  writeBuf: (buf: Uint8Array) => void;
}
