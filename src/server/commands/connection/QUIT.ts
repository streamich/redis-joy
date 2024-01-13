import {Command} from '../../Command';

export const cmd = new Command('QUIT', (cmd, core, connection) => {
  connection.close();
  return 'OK';
});
