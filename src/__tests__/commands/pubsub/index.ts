import {StandaloneTestSetup} from '../../types';
import * as SUBSCRIBE from './SUBSCRIBE';
import * as PSUBSCRIBE from './PSUBSCRIBE';
import * as SSUBSCRIBE from './SSUBSCRIBE';

export const standalone = (setup: StandaloneTestSetup) => {
  describe('pubsub commands', () => {
    SUBSCRIBE.standalone(setup);
    PSUBSCRIBE.standalone(setup);
    SSUBSCRIBE.standalone(setup);
  });
};
