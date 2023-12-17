import {TestSetup} from '../../types';
import * as SUBSCRIBE from './SUBSCRIBE';

export const run = (setup: TestSetup) => {
  describe('pubsub commands', () => {
    SUBSCRIBE.run(setup);
  });
};
