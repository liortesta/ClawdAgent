import { Worker } from 'bullmq';
import config from '../config.js';
import logger from '../utils/logger.js';
import { handleReminder } from './jobs/reminder.js';
import { handleHealthCheck } from './jobs/health-check.js';
import { handleGithubSync } from './jobs/github-sync.js';
import { handleCleanup } from './jobs/cleanup.js';
import { isCacheAvailable } from '../memory/cache.js';

const connection = { url: config.REDIS_URL };

export function startWorker(): Worker | null {
  // BullMQ requires Redis — skip gracefully if not available
  if (!isCacheAvailable()) {
    logger.warn('Queue worker skipped — Redis not available');
    return null;
  }

  const worker = new Worker('clawdagent', async (job) => {
    logger.info('Processing job', { name: job.name, id: job.id });

    switch (job.name) {
      case 'reminder': return handleReminder(job.data);
      case 'health-check': return handleHealthCheck(job.data);
      case 'github-sync': return handleGithubSync(job.data);
      case 'cleanup': return handleCleanup(job.data);
      default: logger.warn('Unknown job type', { name: job.name });
    }
  }, { connection, concurrency: 5 });

  worker.on('completed', (job) => logger.debug('Job completed', { name: job?.name, id: job?.id }));
  worker.on('failed', (job, err) => logger.error('Job failed', { name: job?.name, error: err.message }));
  worker.on('error', (err) => logger.warn('Worker error (non-fatal)', { error: err.message }));

  logger.info('Queue worker started');
  return worker;
}
