import {Command} from '../../Command';

export const cmd = new Command('PING', (cmd, core) => {
  return 'PONG';
});
