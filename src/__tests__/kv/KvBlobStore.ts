import type {StandaloneClient} from '../../standalone';

export type KvBlobStoreClient = Pick<StandaloneClient, 'cmd'>;

export class KvBlobStore {
  constructor(
    private readonly pfx: Uint8Array,
    private readonly redis: KvBlobStoreClient,
  ) {}

  public async create(key: Uint8Array, value: Uint8Array): Promise<void> {
    const redisKey = Buffer.concat([this.pfx, key]);
    const result = await this.redis.cmd(['SET', redisKey, value, 'NX']);
    if (result !== 'OK') throw new Error('KEY_EXISTS');
  }

  public async update(key: Uint8Array, value: Uint8Array): Promise<void> {
    const redisKey = Buffer.concat([this.pfx, key]);
    const result = await this.redis.cmd(['SET', redisKey, value, 'XX']);
    if (result !== 'OK') throw new Error('CANNOT_UPDATE');
  }

  public async get(key: Uint8Array): Promise<Uint8Array> {
    const redisKey = Buffer.concat([this.pfx, key]);
    const result = await this.redis.cmd(['GET', redisKey]);
    if (!(result instanceof Uint8Array)) throw new Error('NOT_FOUND');
    return result;
  }

  public async remove(key: Uint8Array): Promise<boolean> {
    const redisKey = Buffer.concat([this.pfx, key]);
    const result = await this.redis.cmd(['DEL', redisKey]);
    return !!result;
  }

  public async exists(key: Uint8Array): Promise<boolean> {
    const redisKey = Buffer.concat([this.pfx, key]);
    const result = await this.redis.cmd(['EXISTS', redisKey]);
    return result === 1;
  }

  public async length(key: Uint8Array): Promise<number> {
    const redisKey = Buffer.concat([this.pfx, key]);
    const result = await this.redis.cmd(['STRLEN', redisKey], {utf8Res: true});
    return Number(result);
  }
}
