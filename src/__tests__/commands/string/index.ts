import {TestSetup} from '../../types';
import * as SET from './SET';
import * as GET from './GET';

export const run = (setup: TestSetup) => {
  describe('string commands', () => {
    SET.run(setup);
    GET.run(setup);
  });
};
