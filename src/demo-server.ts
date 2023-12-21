// npx ts-node src/demo-server.ts

import {RedisTcpServer} from "./server/RedisTcpServer";

/* tslint:disable no-console */

const main = async () => {
  const server = new RedisTcpServer();
  server.start();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
