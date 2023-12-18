# redis-joy

An implementation of Redis client in TypeScript.

- Supports Redis 7+.
- Supports Redis cluster mode.
- Supports Redis RESP3 serialization protocol.
- Very fast RESP3 message encoder and streaming decoder.
- Supports TLS connections.
- Supports all subscription types: `SUBSCRIBE`, `PSUBSCRIBE`, `SSUBSCRIBE`.


## Benchmarks

`redis-joy` performs substantially faster than `ioredis` and `redis` packages:

```
npx ts-node src/__bench__/GET.bench.ts
redis-joy x 320,967 ops/sec ±5.26% (79 runs sampled)
ioredis x 152,971 ops/sec ±6.76% (76 runs sampled)
redis x 221,573 ops/sec ±50.06% (53 runs sampled)
Fastest is redis-joy
```
