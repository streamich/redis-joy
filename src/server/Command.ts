import type {ParsedCmd} from "../types";
import type {RedisCore} from "./RedisCore";
import type {ICommand} from "./types";

export class Command implements ICommand {
  constructor(
    public readonly name: string,
    public readonly exec: (cmd: ParsedCmd, core: RedisCore) => unknown,
  ) {}
}
