import * as commands from './commands';
import {setupStandalone} from './setupStandalone';

describe('standalone (client per test)', () => {
  commands.standalone(setupStandalone);
});
