import logger from '../../utils/logger.js';
import config from '../../config.js';
import type { DesktopAction } from './controller.js';

// Dangerous patterns that should be blocked
const BLOCKED_TEXT_PATTERNS = [
  /rm\s+(-rf?|--recursive)/i,
  /format\s+[a-z]:/i,
  /del\s+\/[sfq]/i,
  /shutdown/i,
  /reboot/i,
  /mkfs/i,
  /dd\s+if=/i,
  /:(){ :\|:& };:/,     // fork bomb
  />\s*\/dev\/sd/i,
  /reg\s+delete/i,
  /net\s+user.*\/delete/i,
];

// Apps that should never be opened programmatically
const BLOCKED_APPS = [
  'regedit',
  'diskpart',
  'bcdedit',
  'sfc',
  'format.com',
];

export interface SafetyCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a desktop action is safe to execute.
 * Blocks dangerous text input, risky app launches, and enforces rate limits.
 */
export function checkDesktopSafety(action: DesktopAction): SafetyCheckResult {
  // Check typed text for dangerous patterns
  if (action.type === 'type' && action.text) {
    for (const pattern of BLOCKED_TEXT_PATTERNS) {
      if (pattern.test(action.text)) {
        logger.warn('Desktop safety: blocked dangerous text input', { text: action.text.slice(0, 100), pattern: pattern.source });
        return { allowed: false, reason: `Blocked: text matches dangerous pattern "${pattern.source}"` };
      }
    }
  }

  // Check app launch
  if (action.type === 'openApp') {
    const appName = (action.appName ?? action.text ?? '').toLowerCase();
    for (const blocked of BLOCKED_APPS) {
      if (appName.includes(blocked)) {
        logger.warn('Desktop safety: blocked app launch', { appName });
        return { allowed: false, reason: `Blocked: "${appName}" is not allowed to be opened programmatically` };
      }
    }
  }

  // Check hotkey for dangerous combos (e.g. Alt+F4 in certain contexts is OK, but we log it)
  if (action.type === 'hotkey' && action.keys) {
    const combo = action.keys.map(k => k.toLowerCase()).sort().join('+');
    // Alt+F4 — allowed but logged
    if (combo.includes('alt') && combo.includes('f4')) {
      logger.info('Desktop safety: Alt+F4 detected — closing window', { keys: action.keys });
    }
  }

  return { allowed: true };
}

/**
 * Rate limiter for desktop actions.
 * Prevents runaway action loops by limiting actions per minute.
 */
export class DesktopRateLimiter {
  private actions: number[] = [];
  private maxPerMinute: number;

  constructor(maxPerMinute?: number) {
    this.maxPerMinute = maxPerMinute ?? config.DESKTOP_MAX_ACTIONS_PER_MINUTE ?? 60;
  }

  /**
   * Check if an action is allowed under the rate limit.
   * Returns true if allowed, false if rate limited.
   */
  check(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60_000;

    // Clean old entries
    this.actions = this.actions.filter(t => t > oneMinuteAgo);

    if (this.actions.length >= this.maxPerMinute) {
      logger.warn('Desktop rate limit exceeded', { count: this.actions.length, max: this.maxPerMinute });
      return false;
    }

    this.actions.push(now);
    return true;
  }

  /** Get current action count in the last minute. */
  getCurrentCount(): number {
    const oneMinuteAgo = Date.now() - 60_000;
    this.actions = this.actions.filter(t => t > oneMinuteAgo);
    return this.actions.length;
  }

  /** Reset the rate limiter. */
  reset(): void {
    this.actions = [];
  }
}
