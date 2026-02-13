import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import config from '../config.js';
import logger from '../utils/logger.js';

export interface AgentJob {
  agentId: string;
  userId: string;
  platform: string;
  message: string;
  conversationId?: string;
  priority?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentJobResult {
  agentId: string;
  response: string;
  tokensUsed?: number;
  model?: string;
  duration?: number;
}

type AgentHandler = (job: AgentJob) => Promise<AgentJobResult>;

const QUEUE_PREFIX = 'clawdagent-agent';

export class AgentQueueManager {
  private queues: Map<string, Queue> = new Map();
  private workers: Map<string, Worker> = new Map();
  private connection: IORedis;
  private handler: AgentHandler | null = null;
  private initialized = false;
  private redisAvailable = false;

  constructor() {
    this.connection = new IORedis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: true,
      retryStrategy: (times: number) => {
        if (times > 3) return null; // Stop retrying after 3 attempts
        return Math.min(times * 500, 3000);
      },
    });
    // Suppress unhandled ioredis error events
    this.connection.on('error', () => { /* handled — Redis unavailable */ });
  }

  async init(agentIds: string[]): Promise<void> {
    try {
      await this.connection.connect();
      this.redisAvailable = true;
    } catch {
      logger.warn('Redis unavailable — agent queues disabled (in-memory processing only)');
      this.initialized = true;
      return;
    }

    for (const agentId of agentIds) {
      this.createQueueForAgent(agentId);
    }

    this.initialized = true;
    logger.info('Agent queue manager initialized', {
      queues: this.queues.size,
      agents: agentIds,
    });
  }

  setHandler(handler: AgentHandler): void {
    this.handler = handler;

    // Start workers for all existing queues
    for (const [agentId, queue] of this.queues) {
      if (!this.workers.has(agentId)) {
        this.startWorker(agentId, queue.name);
      }
    }
  }

  private createQueueForAgent(agentId: string): Queue {
    const queueName = `${QUEUE_PREFIX}-${agentId}`;
    const queue = new Queue(queueName, {
      connection: this.connection,
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
        attempts: 2,
        backoff: { type: 'exponential', delay: 1000 },
      },
    });

    this.queues.set(agentId, queue);
    return queue;
  }

  private startWorker(agentId: string, queueName: string): void {
    if (!this.handler) return;

    const handler = this.handler;
    const worker = new Worker(
      queueName,
      async (job: Job<AgentJob>) => {
        const start = Date.now();
        logger.debug(`Agent queue processing: ${agentId}`, { jobId: job.id });

        const result = await handler(job.data);

        logger.debug(`Agent queue completed: ${agentId}`, {
          jobId: job.id,
          duration: Date.now() - start,
        });

        return result;
      },
      {
        connection: this.connection,
        concurrency: agentId === 'general' ? 3 : 1, // General agent handles more concurrent requests
        limiter: {
          max: 10,
          duration: 60000, // Max 10 jobs per minute per agent
        },
      },
    );

    worker.on('failed', (job, err) => {
      logger.warn(`Agent queue job failed: ${agentId}`, {
        jobId: job?.id,
        error: err.message,
      });
    });

    worker.on('error', (err) => {
      logger.error(`Agent queue worker error: ${agentId}`, { error: err.message });
    });

    this.workers.set(agentId, worker);
  }

  /** Enqueue a job for a specific agent */
  async enqueue(job: AgentJob): Promise<string> {
    if (!this.redisAvailable) {
      // Fallback: process directly if handler is available
      if (this.handler) {
        await this.handler(job);
      }
      return 'direct-' + Date.now();
    }

    let queue = this.queues.get(job.agentId);
    if (!queue) {
      queue = this.createQueueForAgent(job.agentId);
      if (this.handler) {
        this.startWorker(job.agentId, queue.name);
      }
    }

    const bullJob = await queue.add('process', job, {
      priority: job.priority ?? 5,
    });

    return bullJob.id ?? '';
  }

  /** Get queue stats for monitoring */
  async getStats(): Promise<Record<string, { waiting: number; active: number; completed: number; failed: number }>> {
    const stats: Record<string, { waiting: number; active: number; completed: number; failed: number }> = {};

    for (const [agentId, queue] of this.queues) {
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed');
      stats[agentId] = {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        completed: counts.completed ?? 0,
        failed: counts.failed ?? 0,
      };
    }

    return stats;
  }

  /** Pause a specific agent's queue */
  async pauseAgent(agentId: string): Promise<void> {
    const queue = this.queues.get(agentId);
    if (queue) {
      await queue.pause();
      logger.info(`Agent queue paused: ${agentId}`);
    }
  }

  /** Resume a specific agent's queue */
  async resumeAgent(agentId: string): Promise<void> {
    const queue = this.queues.get(agentId);
    if (queue) {
      await queue.resume();
      logger.info(`Agent queue resumed: ${agentId}`);
    }
  }

  async shutdown(): Promise<void> {
    for (const [id, worker] of this.workers) {
      await worker.close();
      logger.debug(`Agent worker stopped: ${id}`);
    }
    for (const [id, queue] of this.queues) {
      await queue.close();
      logger.debug(`Agent queue closed: ${id}`);
    }
    this.workers.clear();
    this.queues.clear();
    this.connection.disconnect();
  }

  isReady(): boolean { return this.initialized; }
  getQueueCount(): number { return this.queues.size; }
}
