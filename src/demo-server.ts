// npx ts-node src/demo-server.ts

/* tslint:disable no-console */

import {RedisTcpServer} from './server/RedisServer';

const main = async () => {
  const server = new RedisTcpServer();
  server.start();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
