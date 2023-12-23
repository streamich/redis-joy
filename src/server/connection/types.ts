import type {ParsedCmd} from "../../types";

export interface RedisServerConnection {
  oncmd: (cmd: ParsedCmd) => void;
  send(data: unknown): void;
  close(): void;
}
