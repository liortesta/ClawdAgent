import { Queue } from 'bullmq';
import config from '../config.js';
import logger from '../utils/logger.js';

const connection = { url: config.REDIS_URL };

export function startScheduler() {
  const queue = new Queue('clawdagent', { connection });

  // Health checks every 5 minutes
  queue.upsertJobScheduler('health-check-scheduler', { every: 300000 }, { name: 'health-check', data: {} });

  // GitHub sync every 15 minutes
  queue.upsertJobScheduler('github-sync-scheduler', { every: 900000 }, { name: 'github-sync', data: {} });

  // Cleanup old data daily at midnight
  queue.upsertJobScheduler('cleanup-scheduler', { pattern: '0 0 * * *' }, { name: 'cleanup', data: {} });

  logger.info('Job schedulers started');
  return queue;
}

export async function scheduleReminder(data: { userId: string; message: string; platform: string }, delayMs: number) {
  const queue = new Queue('clawdagent', { connection });
  await queue.add('reminder', data, { delay: delayMs });
  logger.info('Reminder scheduled', { userId: data.userId, delayMs });
}
