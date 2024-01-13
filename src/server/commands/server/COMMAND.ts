import {Command} from '../../Command';

export const cmd = new Command('COMMAND', (cmd, core) => {
  const subcommand = Buffer.from(cmd[1]).toString().toUpperCase();
  switch (subcommand) {
    case 'DOCS': {
      return [];
    }
  }
  return [];
});
