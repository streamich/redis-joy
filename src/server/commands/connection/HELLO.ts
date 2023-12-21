import {Command} from "../../Command";

export const cmd = new Command(
  'HELLO',
  (cmd, core) => {
    return {
      server: 'redis',
      version: '6.0.9',
      proto: 2,
      id: 1,
      mode: 'standalone',
      role: 'master',
      modules: [],
    };
  },
);
