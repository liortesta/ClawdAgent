import { Request, Response, NextFunction } from 'express';
import { checkRateLimit } from '../../../security/rate-limiter.js';
import { RateLimitError } from '../../../utils/errors.js';

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    checkRateLimit(ip);
    next();
  } catch (error) {
    if (error instanceof RateLimitError) {
      res.status(429).json({ error: error.message });
      return;
    }
    next(error);
  }
}
