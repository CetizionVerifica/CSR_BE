import { type RedisOptions } from 'ioredis';

/** Parses redis://[:password@]host:port[/db] (rediss:// enables TLS) into ioredis options. */
export function redisOptionsFromUrl(url: string): RedisOptions {
  const u = new URL(url);
  const db = u.pathname && u.pathname !== '/' ? Number(u.pathname.slice(1)) : 0;
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    ...(u.username ? { username: decodeURIComponent(u.username) } : {}),
    ...(u.password ? { password: decodeURIComponent(u.password) } : {}),
    db: Number.isFinite(db) ? db : 0,
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
