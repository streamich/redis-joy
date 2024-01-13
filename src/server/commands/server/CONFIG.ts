import {Command} from '../../Command';

export const cmd = new Command('CONFIG', (cmd, core) => {
  const subcommand = Buffer.from(cmd[1]).toString().toUpperCase();
  switch (subcommand) {
    case 'GET': {
      const setting = Buffer.from(cmd[2]).toString();
      switch (setting.toUpperCase()) {
        case 'save':
          return ['save', ''];
        case 'appendonly':
          return ['appendonly', 'no'];
        default:
          return [setting, ''];
      }
    }
  }
  return [];
});
