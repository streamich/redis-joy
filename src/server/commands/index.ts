import {commands as stringCommands} from './string';
import {commands as connectionCommands} from './connection';
import {commands as serverCommands} from './server';

export const commands = [
  ...stringCommands,
  ...connectionCommands,
  ...serverCommands,
];
