## Getting started

Bootstrap the repo with Yarn:

```
git clone git@github.com:streamich/redis-joy.git
cd redis-joy
yarn
```


## Running tests

### Standalone

To run basic unit tests, you need to spin up a local Redis server. You can do it with Docker:

```
docker run --rm -p 6379:6379 redis:latest
```

Connection configuration settings are in `src/__tests__/config.ts`.

Then you can run tests with:

```
yarn test
```


### Cluster

To run cluster tests, you need to spin up a local Redis cluster. You then need
to set the connection parameter in `src/__tests__/config.ts`.

Finally, you run the tests with `CLUSTER_TESTS=true yarn test`.
