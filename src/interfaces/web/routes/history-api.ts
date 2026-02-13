import { Router, Request, Response } from 'express';
import { Engine } from '../../../core/engine.js';

export function setupHistoryRoutes(engine: Engine): Router {
  const router = Router();

  // GET /api/history — get conversation history
  router.get('/', async (req: Request, res: Response) => {
    const { platform, limit: limitStr, offset: offsetStr } = req.query;
    const limit = parseInt(limitStr as string) || 50;
    const offset = parseInt(offsetStr as string) || 0;
    const user = (req as any).user;

    try {
      const db = (engine as any).db;
      if (!db) {
        res.json({ conversations: [], total: 0 });
        return;
      }

      // Try to query via repository
      if (typeof (engine as any).getConversationHistory === 'function') {
        const history = await (engine as any).getConversationHistory({
          userId: user?.userId,
          platform: platform as string,
          limit,
          offset,
        });
        res.json(history);
        return;
      }

      // Fallback: return empty
      res.json({ conversations: [], total: 0 });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to load history: ${err.message}` });
    }
  });

  // GET /api/history/:id — get single conversation with messages
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const db = (engine as any).db;
      if (!db) {
        res.status(404).json({ error: 'Database not available' });
        return;
      }

      if (typeof (engine as any).getConversationMessages === 'function') {
        const conversation = await (engine as any).getConversationMessages(req.params.id);
        res.json(conversation);
        return;
      }

      res.json({ id: req.params.id, messages: [] });
    } catch (err: any) {
      res.status(500).json({ error: `Failed to load conversation: ${err.message}` });
    }
  });

  return router;
}
