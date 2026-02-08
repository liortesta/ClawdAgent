import { Router, Request, Response } from 'express';
import { Engine } from '../../../core/engine.js';

export function setupApiRoutes(engine: Engine): Router {
  const router = Router();

  router.post('/chat', async (req: Request, res: Response) => {
    const { text } = req.body;
    const user = (req as any).user;

    const response = await engine.process({
      platform: 'web', userId: user.userId, userName: user.userId, chatId: 'web', text,
    });

    res.json({ message: response.text, agent: response.agentUsed, tokens: response.tokensUsed });
  });

  router.get('/status', (_req: Request, res: Response) => {
    res.json({ status: 'online', uptime: process.uptime(), memory: process.memoryUsage().heapUsed });
  });

  return router;
}
