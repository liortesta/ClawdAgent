import config from '../config.js';
import { RateLimitError } from '../utils/errors.js';

interface RateEntry {
  count: number;
  resetAt: number;
}

const limits: Map<string, RateEntry> = new Map();

export function checkRateLimit(userId: string): void {
  const now = Date.now();
  const entry = limits.get(userId);

  if (!entry || now > entry.resetAt) {
    limits.set(userId, { count: 1, resetAt: now + config.RATE_LIMIT_WINDOW_MS });
    return;
  }

  entry.count++;
  if (entry.count > config.RATE_LIMIT_MAX) {
    const waitSeconds = Math.ceil((entry.resetAt - now) / 1000);
    throw new RateLimitError(`Rate limit exceeded. Try again in ${waitSeconds}s`);
  }
}

export function resetRateLimit(userId: string): void {
  limits.delete(userId);
}

// Cleanup old entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of limits) {
    if (now > entry.resetAt) limits.delete(key);
  }
}, 60000);
