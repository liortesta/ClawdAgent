import logger from '../utils/logger.js';
import { MetaAgent } from './meta-agent.js';

interface RepairRecord {
  timestamp: Date;
  issue: string;
  action: string;
  success: boolean;
}

interface ErrorRecord {
  timestamp: Date;
  category: string;
  message: string;
}

// Known fix patterns — automatic repair without AI
const KNOWN_FIXES: Record<string, {
  match: (issue: string) => boolean;
  fix: () => Promise<boolean>;
  label: string;
}> = {
  ssh_reconnect: {
    match: (issue) => /ssh|tunnel|ssh.tunnel|ECONNREFUSED.*13000/i.test(issue),
    fix: async () => {
      try {
        const { createWebhookTunnel } = await import('../services/ssh-tunnel.js');
        const tunnel = createWebhookTunnel();
        if (tunnel) { tunnel.start(); return true; }
        return false;
      } catch { return false; }
    },
    label: 'SSH tunnel reconnect',
  },
  openclaw_restart: {
    match: (issue) => /openclaw|gateway.*down|pm2/i.test(issue),
    fix: async () => {
      try {
        const { executeTool } = await import('./tool-executor.js');
        const result = await executeTool('bash', { command: 'ssh $(cat /tmp/clawdagent-ssh-host 2>/dev/null || echo localhost) "pm2 restart openclaw 2>/dev/null || pm2 restart all"' });
        return result.success;
      } catch { return false; }
    },
    label: 'OpenClaw PM2 restart',
  },
  rate_limit_wait: {
    match: (issue) => /rate.limit|429|too.many.requests|throttl/i.test(issue),
    fix: async () => {
      logger.info('Rate limit detected — waiting 60s before retry');
      await new Promise(r => setTimeout(r, 60_000));
      return true;
    },
    label: 'Rate limit cooldown (60s)',
  },
  model_switch: {
    match: (issue) => /model.*error|overloaded|capacity|model.*unavailable|529/i.test(issue),
    fix: async () => {
      logger.info('Model issue detected — will switch to fallback on next request');
      return true; // Engine already handles provider fallback
    },
    label: 'Model fallback switch',
  },
  database_reconnect: {
    match: (issue) => /database|postgres|connection.*reset|ECONNRESET.*5432/i.test(issue),
    fix: async () => {
      try {
        const { initDatabase } = await import('../memory/database.js');
        await initDatabase();
        return true;
      } catch { return false; }
    },
    label: 'Database reconnect',
  },
  redis_reconnect: {
    match: (issue) => /redis|cache.*down|ECONNREFUSED.*6379/i.test(issue),
    fix: async () => {
      try {
        const { initCache } = await import('../memory/cache.js');
        initCache();
        return true;
      } catch { return false; }
    },
    label: 'Redis reconnect',
  },
  memory_gc: {
    match: (issue) => /memory|heap|out.of.memory|OOM/i.test(issue),
    fix: async () => {
      if (global.gc) { global.gc(); return true; }
      return false;
    },
    label: 'Force garbage collection',
  },
  json_parse_skip: {
    match: (issue) => /json.*parse|unexpected.token|SyntaxError.*JSON/i.test(issue),
    fix: async () => {
      logger.info('JSON parse error — skipping malformed input');
      return true; // Non-actionable, just acknowledge
    },
    label: 'JSON parse skip',
  },
  timeout_retry: {
    match: (issue) => /timeout|ETIMEDOUT|ESOCKETTIMEDOUT|socket.hang.up/i.test(issue),
    fix: async () => {
      logger.info('Timeout detected — will retry on next request');
      await new Promise(r => setTimeout(r, 5_000));
      return true;
    },
    label: 'Timeout wait + retry',
  },
};

// AI chat function for smart diagnosis
let aiChatFn: ((system: string, message: string) => Promise<string>) | null = null;

export function setSelfRepairAI(fn: (system: string, message: string) => Promise<string>) {
  aiChatFn = fn;
}

export class SelfRepair {
  private meta: MetaAgent;
  private repairHistory: RepairRecord[] = [];
  private errorLog: ErrorRecord[] = [];
  private readonly ERROR_WINDOW_MS = 60 * 60 * 1000; // 1 hour window

  // Circuit breaker: silence issues that fail repeatedly to prevent log spam
  private issueFailCount: Map<string, number> = new Map();
  private issueSilencedUntil: Map<string, number> = new Map();
  private static readonly MAX_CONSECUTIVE_FAILURES = 3;
  private static readonly SILENCE_DURATION_MS = 60 * 60 * 1000; // 1 hour silence

  constructor(meta: MetaAgent) {
    this.meta = meta;
  }

  /** Normalize issue string to a stable key for circuit breaker tracking */
  private issueKey(issue: string): string {
    // Collapse varying numbers (e.g. "Running for 56h" vs "Running for 57h") into a stable key
    return issue.replace(/\d+/g, 'N').toLowerCase().trim();
  }

  /** Check if an issue is currently silenced by the circuit breaker */
  private isSilenced(issue: string): boolean {
    const key = this.issueKey(issue);
    const until = this.issueSilencedUntil.get(key);
    if (!until) return false;
    if (Date.now() < until) return true;
    // Silence expired — reset
    this.issueSilencedUntil.delete(key);
    this.issueFailCount.delete(key);
    return false;
  }

  /** Record a failure and potentially silence the issue */
  private recordFailure(issue: string): void {
    const key = this.issueKey(issue);
    const count = (this.issueFailCount.get(key) || 0) + 1;
    this.issueFailCount.set(key, count);
    if (count >= SelfRepair.MAX_CONSECUTIVE_FAILURES) {
      this.issueSilencedUntil.set(key, Date.now() + SelfRepair.SILENCE_DURATION_MS);
      logger.info(`Self-repair: circuit breaker — silencing "${key}" for 1h after ${count} consecutive failures`);
    }
  }

  /** Record a success and reset the circuit breaker for this issue */
  private recordSuccess(issue: string): void {
    const key = this.issueKey(issue);
    this.issueFailCount.delete(key);
    this.issueSilencedUntil.delete(key);
  }

  /** Track an error for frequency analysis */
  trackError(category: string, message: string): void {
    this.errorLog.push({ timestamp: new Date(), category, message });
    // Prune old entries
    const cutoff = Date.now() - this.ERROR_WINDOW_MS;
    this.errorLog = this.errorLog.filter(e => e.timestamp.getTime() > cutoff);
  }

  /** Get error frequency by category in the last hour */
  getErrorFrequency(): Record<string, number> {
    const cutoff = Date.now() - this.ERROR_WINDOW_MS;
    const recent = this.errorLog.filter(e => e.timestamp.getTime() > cutoff);
    const freq: Record<string, number> = {};
    for (const e of recent) {
      freq[e.category] = (freq[e.category] || 0) + 1;
    }
    return freq;
  }

  async diagnoseAndRepair(): Promise<{ repaired: string[]; failed: string[] }> {
    const diagnosis = await this.meta.selfDiagnose();
    if (diagnosis.healthy) return { repaired: [], failed: [] };

    const repaired: string[] = [];
    const failed: string[] = [];

    for (let i = 0; i < diagnosis.issues.length; i++) {
      const issue = diagnosis.issues[i];
      const suggestedFix = diagnosis.fixes[i] ?? 'No fix available';

      // Circuit breaker: skip issues that have failed too many times
      if (this.isSilenced(issue)) {
        logger.debug('Self-repair: skipping silenced issue', { issue });
        continue;
      }

      logger.warn('Self-repair: attempting fix', { issue, suggestedFix });

      try {
        // 1. Try known fix patterns first (fast, no AI needed)
        let success = await this.tryKnownFix(issue);

        // 2. If no known fix matched, try AI-powered diagnosis
        if (!success && aiChatFn) {
          success = await this.tryAIDiagnosis(issue, suggestedFix);
        }

        // 3. Fallback to legacy pattern matching
        if (!success) {
          success = await this.legacyRepair(issue, suggestedFix);
        }

        this.repairHistory.push({ timestamp: new Date(), issue, action: suggestedFix, success });

        if (success) {
          repaired.push(issue);
          this.recordSuccess(issue);
          logger.info('Self-repair: fixed!', { issue });
        } else {
          failed.push(issue);
          this.recordFailure(issue);
          logger.error('Self-repair: failed', { issue });
        }
      } catch (error: any) {
        failed.push(issue);
        this.recordFailure(issue);
        this.repairHistory.push({ timestamp: new Date(), issue, action: suggestedFix, success: false });
        logger.error('Self-repair: error', { issue, error: error.message });
      }
    }

    return { repaired, failed };
  }

  /** Try known fix patterns (fast path) */
  private async tryKnownFix(issue: string): Promise<boolean> {
    for (const [id, pattern] of Object.entries(KNOWN_FIXES)) {
      if (pattern.match(issue)) {
        logger.info(`Self-repair: applying known fix [${id}]: ${pattern.label}`);
        try {
          const success = await pattern.fix();
          if (success) {
            logger.info(`Self-repair: known fix [${id}] succeeded`);
            return true;
          }
        } catch (err: any) {
          logger.warn(`Self-repair: known fix [${id}] failed`, { error: err.message });
        }
      }
    }
    return false;
  }

  /** AI-powered diagnosis for unknown issues */
  private async tryAIDiagnosis(issue: string, suggestedFix: string): Promise<boolean> {
    if (!aiChatFn) return false;

    try {
      const errorFreq = this.getErrorFrequency();
      const recentRepairs = this.repairHistory.slice(-5).map(r => `${r.issue} → ${r.action} (${r.success ? 'OK' : 'FAIL'})`).join('\n');

      const response = await aiChatFn(
        `You are a system repair agent. Diagnose the issue and suggest a concrete fix.
Available actions: restart_service, reconnect_db, reconnect_redis, clear_cache, wait_and_retry, skip, escalate.
Respond ONLY with JSON: { "action": "action_name", "params": { ... }, "explanation": "..." }`,
        `Issue: ${issue}
Suggested fix: ${suggestedFix}
Error frequency (last hour): ${JSON.stringify(errorFreq)}
Recent repairs: ${recentRepairs || 'none'}`,
      );

      const cleaned = response.replace(/```json|```/g, '').trim();
      const plan = JSON.parse(cleaned);

      if (plan.action === 'escalate' || plan.action === 'skip') {
        logger.info('Self-repair AI suggests skipping', { explanation: plan.explanation });
        return false;
      }

      if (plan.action === 'wait_and_retry') {
        const waitMs = plan.params?.waitMs ?? 10_000;
        await new Promise(r => setTimeout(r, waitMs));
        return true;
      }

      if (plan.action === 'reconnect_db') {
        const { initDatabase } = await import('../memory/database.js');
        await initDatabase();
        return true;
      }

      if (plan.action === 'reconnect_redis') {
        const { initCache } = await import('../memory/cache.js');
        initCache();
        return true;
      }

      if (plan.action === 'clear_cache') {
        const { getCache } = await import('../memory/cache.js');
        const cache = getCache();
        if (cache) { await cache.flushdb(); return true; }
        return false;
      }

      logger.info('Self-repair AI action not implemented', { action: plan.action });
      return false;
    } catch (err: any) {
      logger.warn('Self-repair AI diagnosis failed', { error: err.message });
      return false;
    }
  }

  /** Legacy pattern matching (original behavior) */
  private async legacyRepair(issue: string, _suggestedFix: string): Promise<boolean> {
    if (issue.includes('memory')) {
      if (global.gc) { global.gc(); return true; }
      return false;
    }

    if (issue.includes('Database') || issue.includes('database')) {
      try {
        const { initDatabase } = await import('../memory/database.js');
        await initDatabase();
        return true;
      } catch { return false; }
    }

    if (issue.includes('Redis') || issue.includes('redis')) {
      try {
        const { initCache } = await import('../memory/cache.js');
        initCache();
        return true;
      } catch { return false; }
    }

    if (issue.includes('success rate')) {
      logger.warn('Low success rate detected — reviewing error patterns', {
        recentErrors: this.meta.getRecentErrors().slice(-5),
      });
      return false;
    }

    logger.warn('Self-repair: no automatic fix available', { issue, _suggestedFix });
    return false;
  }

  getRepairHistory(): RepairRecord[] { return [...this.repairHistory]; }
  getLastRepair(): RepairRecord | null { return this.repairHistory[this.repairHistory.length - 1] ?? null; }
  getErrorLog(): ErrorRecord[] { return [...this.errorLog]; }
}
