import {ParsedCmd} from '../types';
import {RedisRuntime} from './RedisRuntime';
import {RedisServerConnection} from './connection/types';

export class RedisServer {
  public readonly runtime = new RedisRuntime();

  public onConnection(connection: RedisServerConnection) {
    connection.oncmd = (cmd: ParsedCmd) => {
      try {
        const res = this.runtime.exec(cmd, connection);
        connection.send(res);
      } catch (err) {
        if (err instanceof Error) connection.send(err);
        else connection.send(new Error('ERR unknown error'));
      }
    };
  }
}
