import Redis from 'ioredis';
import config from '../config.js';
import logger from '../utils/logger.js';

let redis: any;

export function initCache(): any {
  redis = new (Redis as any)(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      const delay = Math.min(times * 200, 3000);
      return delay;
    },
  });

  redis.on('connect', () => logger.info('Redis connected'));
  redis.on('error', (err: Error) => logger.error('Redis error', { error: err.message }));

  return redis;
}

export function getCache(): any {
  if (!redis) throw new Error('Cache not initialized. Call initCache() first.');
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const data = await getCache().get(key);
  return data ? JSON.parse(data) : null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
  await getCache().set(key, JSON.stringify(value), 'EX', ttlSeconds);
}

export async function cacheDel(key: string): Promise<void> {
  await getCache().del(key);
}

export async function closeCache() {
  if (redis) {
    await redis.quit();
    logger.info('Redis connection closed');
  }
}
