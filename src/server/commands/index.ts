import {commands as stringCommands} from './string';
import {commands as connectionCommands} from './connection';

export const commands = [
  ...stringCommands,
  ...connectionCommands,
];
