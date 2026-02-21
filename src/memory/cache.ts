import Redis from 'ioredis';
import config from '../config.js';
import logger from '../utils/logger.js';

let redis: any;
let redisAvailable = false;
let errorLogged = false;

export function initCache(): any {
  try {
    redis = new (Redis as any)(config.REDIS_URL, {
      maxRetriesPerRequest: 1,
      retryStrategy(times: number) {
        if (times > 3) {
          if (!errorLogged) {
            logger.warn('Redis unavailable — cache disabled (running without Redis)');
            errorLogged = true;
          }
          return null; // Stop retrying
        }
        return Math.min(times * 500, 3000);
      },
      lazyConnect: true, // Don't connect immediately — prevents crash on startup
      enableOfflineQueue: false,
      connectTimeout: 3000,
    });

    redis.on('connect', () => {
      redisAvailable = true;
      errorLogged = false;
      logger.info('Redis connected');
    });

    redis.on('error', (err: Error) => {
      redisAvailable = false;
      if (!errorLogged) {
        logger.warn('Redis not available — running without cache', { error: err.message });
        errorLogged = true;
      }
    });

    redis.on('close', () => {
      redisAvailable = false;
    });

    // Connect in background — don't block startup
    redis.connect().catch(() => {
      redisAvailable = false;
      if (!errorLogged) {
        logger.warn('Redis connection failed — running without cache');
        errorLogged = true;
      }
    });
  } catch (err: any) {
    logger.warn('Redis init failed — running without cache', { error: err.message });
    redisAvailable = false;
  }

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
