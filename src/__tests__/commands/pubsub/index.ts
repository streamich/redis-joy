import {StandaloneTestSetup} from '../../types';
import * as SUBSCRIBE from './SUBSCRIBE';

export const standalone = (setup: StandaloneTestSetup) => {
  describe('pubsub commands', () => {
    SUBSCRIBE.standalone(setup);
  });
};
