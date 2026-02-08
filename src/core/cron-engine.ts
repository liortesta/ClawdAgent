import { CronJob } from 'cron';
import { getDb } from '../memory/database.js';
import logger from '../utils/logger.js';

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

  setNotifier(fn: typeof this.notifyFn) { this.notifyFn = fn; }

  registerAction(name: string, handler: ActionHandler) {
    this.actionHandlers.set(name, handler);
  }

  async addTask(task: CronTask): Promise<void> {
    this.tasks.set(task.id, task);

    const job = new CronJob(task.expression, async () => {
      logger.info('Cron executing', { id: task.id, name: task.name, action: task.action });
      try {
        const handler = this.actionHandlers.get(task.action);
        if (!handler) {
          logger.warn('No handler for cron action', { action: task.action });
          return;
        }
        const result = await handler(task);
        task.lastRun = new Date().toISOString();

        if (this.notifyFn && result) {
          await this.notifyFn(task.userId, task.platform, `⏰ **${task.name}**\n${result}`);
        }
        await this.persistTask(task);
      } catch (err: any) {
        logger.error('Cron task failed', { id: task.id, error: err.message });
      }
    }, null, task.enabled, 'Asia/Jerusalem');

    this.jobs.set(task.id, job);
    await this.persistTask(task);
    logger.info('Cron task added', { id: task.id, name: task.name, expression: task.expression });
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
      const rows = await db.execute(`SELECT * FROM cron_tasks WHERE enabled = true`);
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
      await db.execute(
        `INSERT INTO cron_tasks (id, user_id, name, expression, action, action_data, platform, enabled, last_run, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET enabled = $8, last_run = $9`,
        [task.id, task.userId, task.name, task.expression, task.action,
         JSON.stringify(task.actionData), task.platform, task.enabled,
         task.lastRun ?? null, task.createdAt],
      );
    } catch { /* table may not exist yet */ }
  }

  private async deletePersistedTask(taskId: string): Promise<void> {
    try {
      const db = getDb();
      await db.execute(`DELETE FROM cron_tasks WHERE id = $1`, [taskId]);
    } catch {}
  }

  stopAll(): void {
    for (const [, job] of this.jobs) { job.stop(); }
    this.jobs.clear();
  }
}
