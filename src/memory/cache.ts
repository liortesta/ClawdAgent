import Redis from 'ioredis';
import config from '../config.js';
import logger from '../utils/logger.js';

let redis: any;
let redisAvailable = false;
let errorLogged = false;

export function initCache(): any {
  redis = new (Redis as any)(config.REDIS_URL, {
    maxRetriesPerRequest: 1,
    retryStrategy(times: number) {
      if (times > 5) {
        // Stop retrying after 5 attempts — Redis is not available
        if (!errorLogged) {
          logger.warn('Redis unavailable — cache disabled (running without Redis)');
          errorLogged = true;
        }
        return null; // Stop retrying
      }
      return Math.min(times * 500, 5000);
    },
    lazyConnect: false,
    enableOfflineQueue: false,
  });

  redis.on('connect', () => {
    redisAvailable = true;
    errorLogged = false;
    logger.info('Redis connected');
  });

  redis.on('error', (err: Error) => {
    redisAvailable = false;
    // Only log the first error, not every 3 seconds
    if (!errorLogged) {
      logger.warn('Redis error — cache operations will be skipped', { error: err.message });
      errorLogged = true;
    }
  });

  redis.on('close', () => {
    redisAvailable = false;
  });

  return redis;
}

export function isCacheAvailable(): boolean {
  return redisAvailable;
}

export function getCache(): any {
  if (!redis) throw new Error('Cache not initialized. Call initCache() first.');
  return redis;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  if (!redisAvailable) return null;
  try {
    const data = await getCache().get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds = 3600): Promise<void> {
  if (!redisAvailable) return;
  try {
    await getCache().set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Silently skip cache write when Redis is down
  }
}

export async function cacheDel(key: string): Promise<void> {
  if (!redisAvailable) return;
  try {
    await getCache().del(key);
  } catch {
    // Silently skip cache delete when Redis is down
  }
}

export async function closeCache() {
  if (redis) {
    try {
      await redis.quit();
      logger.info('Redis connection closed');
    } catch {
      // Already disconnected
    }
  }
}
