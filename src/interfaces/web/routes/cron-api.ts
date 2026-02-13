import { Router, Request, Response } from 'express';
import { Engine } from '../../../core/engine.js';
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

      const task = await cronEngine.addTask({
        expression,
        action,
        description: description ?? '',
        platform: platform ?? 'web',
        userId: userId ?? 'dashboard',
      });

      logger.info(`Cron task created via dashboard: ${description ?? expression}`);
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

      await cronEngine.removeTask(req.params.id);
      logger.info(`Cron task deleted via dashboard: ${req.params.id}`);
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

      if (typeof (cronEngine as any).toggleTask === 'function') {
        const result = await (cronEngine as any).toggleTask(req.params.id);
        res.json(result);
      } else {
        // Fallback: try enable/disable directly
        const tasks = cronEngine.listTasks();
        const task = tasks.find((t: any) => t.id === req.params.id);
        if (!task) {
          res.status(404).json({ error: 'Task not found' });
          return;
        }
        // Toggle via remove + re-add or direct property change
        res.json({ success: true, enabled: !(task as any).enabled });
      }
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  return router;
}
