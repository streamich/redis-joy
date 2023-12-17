export type RedisMode = 'cluster' | 'sentinel' | 'standalone';

export interface RedisHelloResponse {
  server: 'redis' | string;
  version: string;
  proto: number;
  id: number;
  mode: RedisMode;
  role: 'master' | 'replica' | string;
  modules: RedisModuleResponse[];
}

export interface RedisModuleResponse {
  name: string;
  ver: number;
  path: string;
  args: string[];
}
