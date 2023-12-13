import type {RedisClient} from "../node";

export const endpointByClient = new WeakMap<RedisClient, string>();
