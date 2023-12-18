import {StandaloneTestSetup, TestSetup} from '../types';
import * as string from './string';
import * as pubsub from './pubsub';

export const run = (setup: TestSetup) => {
  describe('commands', () => {
    string.run(setup);
  });
};

export const standalone = (setup: StandaloneTestSetup) => {
  describe('commands', () => {
    pubsub.standalone(setup);
  });
};
