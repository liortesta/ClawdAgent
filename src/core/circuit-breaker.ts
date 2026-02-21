/**
 * Circuit Breaker — Prevents cascading failures from external service outages.
 *
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Service is down, requests fail immediately (no waiting)
 * - HALF_OPEN: Testing recovery — allows one probe request
 *
 * Transitions:
 * - CLOSED → OPEN: When failure threshold is exceeded
 * - OPEN → HALF_OPEN: After cooldown period expires
 * - HALF_OPEN → CLOSED: If probe request succeeds
 * - HALF_OPEN → OPEN: If probe request fails
 */

import logger from '../utils/logger.js';

type CircuitState = 'closed' | 'open' | 'half_open';

interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit */
  failureThreshold?: number;
  /** Time in ms to wait before attempting recovery */
  cooldownMs?: number;
  /** Time window in ms for counting failures */
  windowMs?: number;
}

interface CircuitStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailure: number | null;
  lastSuccess: number | null;
  openedAt: number | null;
  totalRequests: number;
  totalFailures: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures: number[] = [];
  private successes = 0;
  private lastFailure: number | null = null;
  private lastSuccess: number | null = null;
  private openedAt: number | null = null;
  private totalRequests = 0;
  private totalFailures = 0;

  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly windowMs: number;
  private readonly name: string;

  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.windowMs = options.windowMs ?? 60_000;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.totalRequests++;

    if (this.state === 'open') {
      // Check if cooldown has elapsed
      if (this.openedAt && Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'half_open';
        logger.info(`Circuit breaker [${this.name}] → HALF_OPEN (testing recovery)`);
      } else {
        throw new CircuitOpenError(this.name, this.cooldownMs - (Date.now() - (this.openedAt ?? 0)));
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /** Check if the circuit allows requests */
  isAvailable(): boolean {
    if (this.state === 'closed' || this.state === 'half_open') return true;
    if (this.openedAt && Date.now() - this.openedAt >= this.cooldownMs) return true;
    return false;
  }

  /** Get current stats */
  getStats(): CircuitStats {
    return {
      state: this.state,
      failures: this.getRecentFailureCount(),
      successes: this.successes,
      lastFailure: this.lastFailure,
      lastSuccess: this.lastSuccess,
      openedAt: this.openedAt,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
    };
  }

  /** Force reset the circuit to closed state */
  reset(): void {
    this.state = 'closed';
    this.failures = [];
    this.openedAt = null;
    logger.info(`Circuit breaker [${this.name}] manually reset → CLOSED`);
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccess = Date.now();

    if (this.state === 'half_open') {
      this.state = 'closed';
      this.failures = [];
      this.openedAt = null;
      logger.info(`Circuit breaker [${this.name}] → CLOSED (recovery confirmed)`);
    }
  }

  private onFailure(): void {
    const now = Date.now();
    this.failures.push(now);
    this.lastFailure = now;
    this.totalFailures++;

    // Prune old failures outside the window
    this.failures = this.failures.filter(t => now - t < this.windowMs);

    if (this.state === 'half_open') {
      // Probe failed — reopen
      this.state = 'open';
      this.openedAt = now;
      logger.warn(`Circuit breaker [${this.name}] → OPEN (probe failed)`);
      return;
    }

    if (this.failures.length >= this.failureThreshold) {
      this.state = 'open';
      this.openedAt = now;
      logger.warn(`Circuit breaker [${this.name}] → OPEN (${this.failures.length} failures in ${this.windowMs}ms window)`);
    }
  }

  private getRecentFailureCount(): number {
    const now = Date.now();
    this.failures = this.failures.filter(t => now - t < this.windowMs);
    return this.failures.length;
  }
}

/** Error thrown when circuit is open */
export class CircuitOpenError extends Error {
  readonly retryAfterMs: number;

  constructor(serviceName: string, retryAfterMs: number) {
    super(`Circuit breaker [${serviceName}] is OPEN — service unavailable. Retry in ${Math.ceil(retryAfterMs / 1000)}s`);
    this.name = 'CircuitOpenError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ── Pre-configured Breakers ──────────────────────────────────────────────────

/** Global circuit breakers for external services */
const breakers = new Map<string, CircuitBreaker>();

/** Get or create a circuit breaker for a service */
export function getCircuitBreaker(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
  let cb = breakers.get(name);
  if (!cb) {
    cb = new CircuitBreaker(name, options);
    breakers.set(name, cb);
  }
  return cb;
}

/** Get stats for all circuit breakers (for dashboard) */
export function getAllCircuitBreakerStats(): Record<string, CircuitStats> {
  const stats: Record<string, CircuitStats> = {};
  for (const [name, cb] of breakers) {
    stats[name] = cb.getStats();
  }
  return stats;
}
