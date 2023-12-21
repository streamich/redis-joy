import {Command} from "../../Command";
import {StringKeyNode} from "../../RedisCore";

export const cmd = new Command(
  'SET',
  (cmd, core) => {
    const key = cmd[1];
    const value = cmd[2];
    if (!(key instanceof Uint8Array)) throw new Error('ERR unknown key');
    if (!(value instanceof Uint8Array)) throw new Error('ERR unknown value');
    const node = core.find(key);
    if (node) {
      node.v = value;
    } else {
      const node = new StringKeyNode(key, value);
      core.insert(node);
    }
    return 'OK';
  },
);
