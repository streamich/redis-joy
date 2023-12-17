import {TestSetup} from '../types';
import * as string from './string';

export const run = (setup: TestSetup) => {
  describe('commands', () => {
    string.run(setup);
  });
};
