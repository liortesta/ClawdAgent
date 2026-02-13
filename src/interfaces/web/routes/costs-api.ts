import { Router, Request, Response } from 'express';
import { Engine } from '../../../core/engine.js';

export function setupCostsRoutes(engine: Engine): Router {
  const router = Router();

  // GET /api/costs/today — today's usage summary
  router.get('/today', (_req: Request, res: Response) => {
    try {
      const tracker = engine.getUsageTracker();
      if (!tracker) {
        res.json({ totalCost: 0, totalCalls: 0, byModel: {}, byAction: {} });
        return;
      }
      const summary = tracker.getTodaySummary();
      res.json(summary);
    } catch {
      res.json({ totalCost: 0, totalCalls: 0, byModel: {}, byAction: {} });
    }
  });

  // GET /api/costs/history — cost history (from usage tracker or DB)
  router.get('/history', async (_req: Request, res: Response) => {
    try {
      const tracker = engine.getUsageTracker();
      if (!tracker) {
        res.json({ days: [], total: 0 });
        return;
      }

      // Try to get history if the tracker supports it
      if (typeof (tracker as any).getHistory === 'function') {
        const history = await (tracker as any).getHistory();
        res.json(history);
        return;
      }

      // Fallback: return today's data as single-day history
      const today = tracker.getTodaySummary();
      const todayStr = new Date().toISOString().split('T')[0];
      res.json({
        days: [{ date: todayStr, cost: today.totalCost, calls: today.totalCalls, byModel: today.byModel }],
        total: today.totalCost,
      });
    } catch {
      res.json({ days: [], total: 0 });
    }
  });

  // GET /api/costs/breakdown — detailed cost breakdown
  router.get('/breakdown', (_req: Request, res: Response) => {
    try {
      const tracker = engine.getUsageTracker();
      if (!tracker) {
        res.json({ byProvider: {}, byModel: {}, byAgent: {} });
        return;
      }

      const summary = tracker.getTodaySummary();
      // Group by provider from model names
      const byProvider: Record<string, number> = {};
      for (const [model, data] of Object.entries(summary.byModel as Record<string, any>)) {
        let provider = 'other';
        if (model.includes('claude')) provider = 'anthropic';
        else if (model.includes('gpt')) provider = 'openai';
        else if (model.includes('deepseek') || model.includes('llama') || model.includes('mistral')) provider = 'openrouter';
        byProvider[provider] = (byProvider[provider] ?? 0) + (data.cost ?? 0);
      }

      res.json({
        byProvider,
        byModel: summary.byModel,
        byAgent: summary.byAction ?? {},
      });
    } catch {
      res.json({ byProvider: {}, byModel: {}, byAgent: {} });
    }
  });

  return router;
}
