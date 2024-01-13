import type {ParsedCmd} from '../types';
import type {RedisCore} from './RedisCore';
import type {RedisServerConnection} from './connection/types';
import type {ICommand} from './types';

export class Command implements ICommand {
  constructor(
    public readonly name: string,
    public readonly exec: (cmd: ParsedCmd, core: RedisCore, connection: RedisServerConnection) => unknown,
  ) {}
}
