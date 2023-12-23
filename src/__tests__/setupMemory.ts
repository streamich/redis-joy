import {RedisMemoryServer} from '../server/RedisMemoryServer';
import {StandaloneTestSetup} from './types';

export const setupMemory: StandaloneTestSetup = async () => {
  const server = new RedisMemoryServer();
  const client = server.connectClient();
  return {client};
};
