import { CronJob } from 'cron';
import { sql } from 'drizzle-orm';
import { getDb } from '../memory/database.js';
import config from '../config.js';
import logger from '../utils/logger.js';
import { recordFailureForPanic } from './kill-switch.js';

export interface CronTask {
  id: string;
  userId: string;
  name: string;
  expression: string;
  action: string;
  actionData: Record<string, unknown>;
  platform: string;
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
}

// ─── Dead Letter Queue Types ─────────────────────────────────────
export interface DLQEntry {
  id: string;
  taskId: string;
  taskName: string;
  action: string;
  error: string;
  attempt: number;
  maxAttempts: number;
  failedAt: string;
  willRetryAt?: string;
  status: 'pending_retry' | 'dead';
}

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = [5_000, 30_000, 120_000]; // 5s, 30s, 2min

const CRON_PATTERNS: Array<{ pattern: RegExp; expression: string }> = [
  { pattern: /every\s*(\d+)\s*min/i, expression: '*/$1 * * * *' },
  { pattern: /every\s*(\d+)\s*hour/i, expression: '0 */$1 * * *' },
  { pattern: /every\s*hour/i, expression: '0 * * * *' },
  { pattern: /every\s*day\s*(?:at)?\s*(\d{1,2}):?(\d{2})?/i, expression: '$2 $1 * * *' },
  { pattern: /every\s*morning/i, expression: '0 8 * * *' },
  { pattern: /every\s*evening/i, expression: '0 20 * * *' },
  { pattern: /every\s*night/i, expression: '0 22 * * *' },
  { pattern: /every\s*monday/i, expression: '0 9 * * 1' },
  { pattern: /every\s*sunday/i, expression: '0 9 * * 0' },
  { pattern: /every\s*week/i, expression: '0 9 * * 1' },
  { pattern: /every\s*month/i, expression: '0 9 1 * *' },
  { pattern: /כל\s*בוקר/i, expression: '0 8 * * *' },
  { pattern: /כל\s*ערב/i, expression: '0 20 * * *' },
  { pattern: /כל\s*שעה/i, expression: '0 * * * *' },
  { pattern: /כל\s*יום/i, expression: '0 9 * * *' },
  { pattern: /כל\s*שבוע/i, expression: '0 9 * * 0' },
  { pattern: /כל\s*חודש/i, expression: '0 9 1 * *' },
];

export function parseCronExpression(input: string): string | null {
  for (const { pattern, expression } of CRON_PATTERNS) {
    const match = input.match(pattern);
    if (match) {
      let expr = expression;
      for (let i = 1; i < match.length; i++) {
        expr = expr.replace(`$${i}`, match[i] || '0');
      }
      return expr;
    }
  }
  const cronRegex = /^[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+\s+[\d*\/,-]+$/;
  if (cronRegex.test(input.trim())) return input.trim();
  return null;
}

type ActionHandler = (task: CronTask) => Promise<string>;

export class CronEngine {
  private jobs: Map<string, CronJob> = new Map();
  private tasks: Map<string, CronTask> = new Map();
  private actionHandlers: Map<string, ActionHandler> = new Map();
  private notifyFn: ((userId: string, platform: string, message: string) => Promise<void>) | null = null;

  // ─── DLQ + Idempotency ───────────────────────────────────────
  private dlq: DLQEntry[] = [];
  private runningLocks: Set<string> = new Set(); // idempotency: prevents concurrent duplicate runs
  private retryTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  setNotifier(fn: typeof this.notifyFn) { this.notifyFn = fn; }

  registerAction(name: string, handler: ActionHandler) {
    this.actionHandlers.set(name, handler);
  }

  async addTask(task: CronTask): Promise<void> {
    this.tasks.set(task.id, task);

    const job = new CronJob(task.expression, async () => {
      // Idempotency lock — skip if this task is already running
      if (this.runningLocks.has(task.id)) {
        logger.warn('Cron skipped (already running)', { id: task.id, name: task.name });
        return;
      }
      this.runningLocks.add(task.id);

      logger.info('Cron executing', { id: task.id, name: task.name, action: task.action });
      try {
        const handler = this.actionHandlers.get(task.action);
        if (!handler) {
          logger.warn('No handler for cron action', { action: task.action });
          this.runningLocks.delete(task.id);
          return;
        }
        const result = await handler(task);
        task.lastRun = new Date().toISOString();

        // Clear any pending retries on success
        this.clearRetries(task.id);

        if (this.notifyFn && result) {
          await this.notifyFn(task.userId, task.platform, `⏰ **${task.name}**\n${result}`);
        }
        await this.persistTask(task);
      } catch (err: any) {
        logger.error('Cron task failed', { id: task.id, error: err.message });
        this.handleFailure(task, err.message, 1);
      } finally {
        this.runningLocks.delete(task.id);
      }
    }, null, task.enabled, config.CRON_TIMEZONE);

    this.jobs.set(task.id, job);
    await this.persistTask(task);
    logger.info('Cron task added', { id: task.id, name: task.name, expression: task.expression });
  }

  /**
   * Handle a task failure — retry with exponential backoff, or move to DLQ.
   */
  private handleFailure(task: CronTask, error: string, attempt: number): void {
    recordFailureForPanic(); // feed auto-panic anomaly detector

    if (attempt < MAX_RETRY_ATTEMPTS) {
      const backoffMs = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
      const retryAt = new Date(Date.now() + backoffMs).toISOString();

      const entry: DLQEntry = {
        id: `dlq_${task.id}_${attempt}`,
        taskId: task.id, taskName: task.name, action: task.action,
        error, attempt, maxAttempts: MAX_RETRY_ATTEMPTS,
        failedAt: new Date().toISOString(), willRetryAt: retryAt,
        status: 'pending_retry',
      };
      this.dlq.push(entry);

      logger.warn('Cron retry scheduled', { taskId: task.id, attempt, nextRetryMs: backoffMs });

      const timer = setTimeout(async () => {
        this.retryTimers.delete(task.id);
        if (this.runningLocks.has(task.id)) return; // still running from another trigger
        this.runningLocks.add(task.id);

        try {
          const handler = this.actionHandlers.get(task.action);
          if (!handler) { this.runningLocks.delete(task.id); return; }

          const result = await handler(task);
          task.lastRun = new Date().toISOString();
          entry.status = 'dead'; // mark DLQ entry as resolved (reused field, but entry stays for history)
          this.clearRetries(task.id);

          logger.info('Cron retry succeeded', { taskId: task.id, attempt });
          if (this.notifyFn && result) {
            await this.notifyFn(task.userId, task.platform, `⏰ **${task.name}** (retry #${attempt})\n${result}`);
          }
          await this.persistTask(task);
        } catch (retryErr: any) {
          logger.error('Cron retry failed', { taskId: task.id, attempt, error: retryErr.message });
          this.handleFailure(task, retryErr.message, attempt + 1);
        } finally {
          this.runningLocks.delete(task.id);
        }
      }, backoffMs);

      this.retryTimers.set(task.id, timer);
    } else {
      // Max retries exhausted — move to permanent DLQ
      const deadEntry: DLQEntry = {
        id: `dlq_${task.id}_dead_${Date.now()}`,
        taskId: task.id, taskName: task.name, action: task.action,
        error, attempt, maxAttempts: MAX_RETRY_ATTEMPTS,
        failedAt: new Date().toISOString(),
        status: 'dead',
      };
      this.dlq.push(deadEntry);

      logger.error('Cron task moved to DLQ (max retries exhausted)', {
        taskId: task.id, name: task.name, attempts: attempt, lastError: error,
      });

      // Notify admin about permanent failure
      if (this.notifyFn) {
        this.notifyFn(task.userId, task.platform,
          `🚨 **CRON DLQ** — "${task.name}" failed ${attempt} times and is now dead.\nLast error: ${error.slice(0, 200)}`
        ).catch(() => { /* best effort notification */ });
      }
    }

    // Cap DLQ at 500 entries
    if (this.dlq.length > 500) {
      this.dlq = this.dlq.slice(-500);
    }
  }

  private clearRetries(taskId: string): void {
    const timer = this.retryTimers.get(taskId);
    if (timer) { clearTimeout(timer); this.retryTimers.delete(taskId); }
  }

  // ─── DLQ Accessors (for dashboard API) ──────────────────────
  /** Get all DLQ entries */
  getDLQ(): DLQEntry[] { return this.dlq; }

  /** Get only permanently dead entries */
  getDeadLetters(): DLQEntry[] { return this.dlq.filter(e => e.status === 'dead'); }

  /** Get DLQ stats */
  getDLQStats(): { total: number; pendingRetry: number; dead: number } {
    return {
      total: this.dlq.length,
      pendingRetry: this.dlq.filter(e => e.status === 'pending_retry').length,
      dead: this.dlq.filter(e => e.status === 'dead').length,
    };
  }

  /** Retry a dead letter manually */
  async retryDeadLetter(dlqId: string): Promise<boolean> {
    const entry = this.dlq.find(e => e.id === dlqId && e.status === 'dead');
    if (!entry) return false;

    const task = this.tasks.get(entry.taskId);
    if (!task) return false;

    // Reset and re-attempt
    logger.info('Manual DLQ retry', { dlqId, taskId: entry.taskId });
    this.handleFailure(task, 'manual_retry', 1);
    return true;
  }

  /** Clear resolved/old DLQ entries */
  clearDLQ(olderThanMs = 86_400_000): number {
    const cutoff = Date.now() - olderThanMs;
    const before = this.dlq.length;
    this.dlq = this.dlq.filter(e => new Date(e.failedAt).getTime() > cutoff);
    return before - this.dlq.length;
  }

  async removeTask(taskId: string): Promise<boolean> {
    const job = this.jobs.get(taskId);
    if (job) { job.stop(); this.jobs.delete(taskId); }
    this.tasks.delete(taskId);
    await this.deletePersistedTask(taskId);
    return !!job;
  }

  async enableTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const job = this.jobs.get(taskId);
    if (task && job) { task.enabled = true; job.start(); await this.persistTask(task); }
  }

  async disableTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    const job = this.jobs.get(taskId);
    if (task && job) { task.enabled = false; job.stop(); await this.persistTask(task); }
  }

  listTasks(userId?: string): CronTask[] {
    const all = Array.from(this.tasks.values());
    return userId ? all.filter(t => t.userId === userId) : all;
  }

  getTaskCount(): number { return this.tasks.size; }

  async loadFromDb(): Promise<void> {
    try {
      const db = getDb();
      const rows = await db.execute(sql`SELECT * FROM cron_tasks WHERE enabled = true`);
      for (const row of rows.rows as any[]) {
        const task: CronTask = {
          id: row.id, userId: row.user_id, name: row.name,
          expression: row.expression, action: row.action,
          actionData: JSON.parse(row.action_data ?? '{}'),
          platform: row.platform ?? 'telegram', enabled: row.enabled,
          lastRun: row.last_run, createdAt: row.created_at,
        };
        if (task.enabled) await this.addTask(task);
        else this.tasks.set(task.id, task);
      }
      logger.info('Cron tasks loaded from DB', { count: this.tasks.size });
    } catch (err: any) {
      logger.debug('No cron tasks table yet', { error: err.message });
    }
  }

  private async persistTask(task: CronTask): Promise<void> {
    try {
      const db = getDb();
      const actionData = JSON.stringify(task.actionData);
      const lastRun = task.lastRun ?? null;
      await db.execute(sql`INSERT INTO cron_tasks (id, user_id, name, expression, action, action_data, platform, enabled, last_run, created_at)
         VALUES (${task.id}, ${task.userId}, ${task.name}, ${task.expression}, ${task.action},
         ${actionData}, ${task.platform}, ${task.enabled}, ${lastRun}, ${task.createdAt})
         ON CONFLICT (id) DO UPDATE SET enabled = ${task.enabled}, last_run = ${lastRun}`);
    } catch { /* table may not exist yet */ }
  }

  private async deletePersistedTask(taskId: string): Promise<void> {
    try {
      const db = getDb();
      await db.execute(sql`DELETE FROM cron_tasks WHERE id = ${taskId}`);
    } catch {}
  }

  stopAll(): void {
    for (const [, job] of this.jobs) { job.stop(); }
    this.jobs.clear();
    for (const [, timer] of this.retryTimers) { clearTimeout(timer); }
    this.retryTimers.clear();
    this.runningLocks.clear();
  }
}
