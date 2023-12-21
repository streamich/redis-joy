import type {ParsedCmd} from "../types";
import type {RedisCore} from "./RedisCore";
import type {RedisServerConnection} from "./connection/types";

export interface ICommand {
  name: string;
  exec: (cmd: ParsedCmd, core: RedisCore, connection: RedisServerConnection) => unknown;
}

// export interface RedisServerConnection {
//   onCommand: (cmd: ParsedCmd) => void;
//   write: (data: string) => void;
//   writeBuf: (buf: Uint8Array) => void;
// }
