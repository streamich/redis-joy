import {ascii} from '../../util/buf';
import {RedisRuntime} from '../RedisRuntime';

test('can set and get a key', () => {
  const runtime = new RedisRuntime();
  runtime.exec(['SET', ascii`foo`, ascii`bar`]);
  const res = runtime.exec(['GET', ascii`foo`]);
  expect(res).toEqual(ascii`bar`);
});
