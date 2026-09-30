import { redisOptionsFromUrl } from './redis';

describe('redisOptionsFromUrl', () => {
  it('parses host, port and db', () => {
    expect(redisOptionsFromUrl('redis://localhost:6380/2')).toMatchObject({
      host: 'localhost',
      port: 6380,
      db: 2,
    });
  });

  it('parses credentials and TLS', () => {
    const o = redisOptionsFromUrl('rediss://app:p%40ss@cache.internal');
    expect(o).toMatchObject({
      host: 'cache.internal',
      port: 6379,
      username: 'app',
      password: 'p@ss',
      tls: {},
    });
  });
});
