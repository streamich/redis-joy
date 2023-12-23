import {Command} from "../../Command";

export const cmd = new Command(
  'GET',
  (cmd, core) => {
    const key = cmd[1];
    if (!(key instanceof Uint8Array)) throw new Error('ERR unknown key');
    const node = core.find(key);
    if (!node) return null;
    return node.v;
  },
);
