import { Router, Request, Response } from 'express';
import { Engine } from '../../../core/engine.js';
import { parseCronExpression } from '../../../core/cron-engine.js';
import { nanoid } from 'nanoid';
import logger from '../../../utils/logger.js';

export function setupCronRoutes(engine: Engine): Router {
  const router = Router();

  // GET /api/cron — list all cron tasks
  router.get('/', (_req: Request, res: Response) => {
    try {
      const cronEngine = engine.getCronEngine();
      if (!cronEngine) {
        res.json([]);
        return;
      }
      const tasks = cronEngine.listTasks();
      res.json(tasks);
    } catch {
      res.json([]);
    }
  });

  // POST /api/cron — create cron task
  router.post('/', async (req: Request, res: Response) => {
    const { expression, action, description, platform, userId } = req.body;
    if (!expression || !action) {
      res.status(400).json({ error: 'expression and action are required' });
      return;
    }

    try {
      const cronEngine = engine.getCronEngine();
      if (!cronEngine) {
        res.status(503).json({ error: 'Cron engine not available' });
        return;
      }

      // Parse natural language to cron expression if needed
      const cronExpr = parseCronExpression(expression) ?? expression;

      const task = {
        id: nanoid(),
        userId: userId ?? 'dashboard',
        name: description || action,
        expression: cronExpr,
        action,
        actionData: {} as Record<string, unknown>,
        platform: platform ?? 'web',
        enabled: true,
        createdAt: new Date().toISOString(),
      };

      await cronEngine.addTask(task);

      logger.info(`Cron task created via dashboard: ${task.name} (${task.expression})`);
      res.status(201).json(task);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // PUT /api/cron/:id — update cron task
  router.put('/:id', async (req: Request, res: Response) => {
    try {
      const cronEngine = engine.getCronEngine();
      if (!cronEngine) {
        res.status(503).json({ error: 'Cron engine not available' });
        return;
      }

      if (typeof (cronEngine as any).updateTask === 'function') {
        const updated = await (cronEngine as any).updateTask(req.params.id, req.body);
        res.json(updated);
      } else {
        res.status(501).json({ error: 'Update not supported' });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // DELETE /api/cron/:id — delete cron task
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const cronEngine = engine.getCronEngine();
      if (!cronEngine) {
        res.status(503).json({ error: 'Cron engine not available' });
        return;
      }

      const taskId = String(req.params.id);
      await cronEngine.removeTask(taskId);
      logger.info(`Cron task deleted via dashboard: ${taskId}`);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/cron/:id/toggle — enable/disable
  router.post('/:id/toggle', async (req: Request, res: Response) => {
    try {
      const cronEngine = engine.getCronEngine();
      if (!cronEngine) {
        res.status(503).json({ error: 'Cron engine not available' });
        return;
      }

      const toggleId = String(req.params.id);
      const tasks = cronEngine.listTasks();
      const task = tasks.find((t: any) => t.id === toggleId);
      if (!task) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      const isEnabled = (task as any).enabled !== false;
      if (isEnabled) {
        await cronEngine.disableTask(toggleId);
      } else {
        await cronEngine.enableTask(toggleId);
      }
      res.json({ success: true, enabled: !isEnabled });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // ─── DLQ Endpoints ────────────────────────────────────────────

  // GET /api/cron/dlq — list dead letter queue entries
  router.get('/dlq', (_req: Request, res: Response) => {
    try {
      const cronEngine = engine.getCronEngine();
      if (!cronEngine) { res.json({ entries: [], stats: { total: 0, pendingRetry: 0, dead: 0 } }); return; }
      res.json({ entries: cronEngine.getDLQ(), stats: cronEngine.getDLQStats() });
    } catch {
      res.json({ entries: [], stats: { total: 0, pendingRetry: 0, dead: 0 } });
    }
  });

  // GET /api/cron/dlq/stats — DLQ summary stats
  router.get('/dlq/stats', (_req: Request, res: Response) => {
    try {
      const cronEngine = engine.getCronEngine();
      if (!cronEngine) { res.json({ total: 0, pendingRetry: 0, dead: 0 }); return; }
      res.json(cronEngine.getDLQStats());
    } catch {
      res.json({ total: 0, pendingRetry: 0, dead: 0 });
    }
  });

  // POST /api/cron/dlq/:id/retry — manually retry a dead letter
  router.post('/dlq/:id/retry', async (req: Request, res: Response) => {
    try {
      const cronEngine = engine.getCronEngine();
      if (!cronEngine) { res.status(503).json({ error: 'Cron engine not available' }); return; }
      const dlqId = String(req.params.id);
      const success = await cronEngine.retryDeadLetter(dlqId);
      if (success) {
        logger.info('DLQ manual retry triggered', { dlqId: req.params.id });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'DLQ entry not found or not in dead state' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/cron/dlq — clear old DLQ entries (default: older than 24h)
  router.delete('/dlq', (_req: Request, res: Response) => {
    try {
      const cronEngine = engine.getCronEngine();
      if (!cronEngine) { res.json({ cleared: 0 }); return; }
      const cleared = cronEngine.clearDLQ();
      logger.info('DLQ cleared', { cleared });
      res.json({ cleared });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
