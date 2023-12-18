import {StandaloneTestSetup} from '../../types';
import * as SUBSCRIBE from './SUBSCRIBE';
import * as PSUBSCRIBE from './PSUBSCRIBE';

export const standalone = (setup: StandaloneTestSetup) => {
  describe('pubsub commands', () => {
    SUBSCRIBE.standalone(setup);
    PSUBSCRIBE.standalone(setup);
  });
};
