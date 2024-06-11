import {Router, RouteMatcher} from '@jsonjoy.com/jit-router';
import {ParsedCmd} from '../types';
import {commands} from './commands';
import {RedisCore} from './RedisCore';
import type {Command} from './Command';
import type {RedisServerConnection} from './connection/types';

export class RedisRuntime {
  public readonly core: RedisCore = new RedisCore();
  protected readonly matcher: RouteMatcher;

  constructor() {
    const router = new Router();
    for (const cmd of commands) router.add(cmd.name, cmd);
    this.matcher = router.compile();
  }

  public exec(cmd: ParsedCmd, connection: RedisServerConnection) {
    const cmdName = cmd[0].toUpperCase();
    const match = this.matcher(cmdName);
    if (!match) throw new Error(`ERR unknown command '${cmdName}'`);
    const command = match.data as Command;
    const result = command.exec(cmd, this.core, connection);
    return result;
  }
}
