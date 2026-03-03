/**
 * TikTok Agent API routes — control autonomous TikTok engagement agents.
 */
import { Router, Request, Response } from 'express';
import { TikTokAgent, type TikTokAgentConfig } from '../../../actions/browser/tiktok-agent.js';
import { TikTokAccountManager } from '../../../actions/browser/tiktok-manager.js';
import logger from '../../../utils/logger.js';

export function setupTikTokAgentRoutes(): Router {
  const router = Router();

  /** GET /api/tiktok-agent/agents — list all running agents */
  router.get('/agents', (_req: Request, res: Response) => {
    res.json({ agents: TikTokAgent.listAgents() });
  });

  /** GET /api/tiktok-agent/agents/:accountId — get agent status */
  router.get('/agents/:accountId', (req: Request, res: Response) => {
    const agent = TikTokAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    res.json(agent.getStatus());
  });

  /** POST /api/tiktok-agent/agents — create and start an agent */
  router.post('/agents', async (req: Request, res: Response) => {
    try {
      const { accountId, config } = req.body ?? {};
      if (!accountId) { res.status(400).json({ error: 'accountId is required' }); return; }

      const account = TikTokAccountManager.getInstance().getAccount(accountId);
      if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

      const agentConfig: TikTokAgentConfig = {
        accountId,
        actions: config?.actions ?? ['like', 'follow'],
        schedule: config?.schedule ?? {
          like:    { intervalMinutes: 15, dailyLimit: 30 },
          comment: { intervalMinutes: 60, dailyLimit: 5 },
          follow:  { intervalMinutes: 30, dailyLimit: 10 },
          save:    { intervalMinutes: 20, dailyLimit: 20 },
        },
        activeHours: config?.activeHours ?? {
          weekday: { start: 8, end: 22 },
          weekend: { start: 10, end: 23 },
        },
        content: {
          tone: config?.content?.tone ?? 'AI enthusiast, authentic and friendly',
          language: config?.content?.language ?? 'English',
          topics: config?.content?.topics ?? ['AI', 'technology'],
          hashtags: config?.content?.hashtags ?? ['#AI', '#Tech'],
          targetAccounts: config?.content?.targetAccounts ?? [],
          maxLength: config?.content?.maxLength ?? 150,
        },
        safety: config?.safety ?? {
          minDelaySeconds: 180,
          maxActionsPerHour: 5,
          pauseOnErrorCount: 2,
          pauseDurationMinutes: 120,
        },
        testMode: config?.testMode ?? false,
      };

      const agent = TikTokAgent.createAgent(agentConfig);
      await agent.start();

      res.json({ ok: true, status: agent.getStatus() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to create TikTok agent', { error: message });
      res.status(400).json({ error: message });
    }
  });

  /** POST /api/tiktok-agent/agents/:accountId/stop — stop an agent */
  router.post('/agents/:accountId/stop', async (req: Request, res: Response) => {
    try {
      const agent = TikTokAgent.getAgent(req.params.accountId as string);
      if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
      await agent.stop();
      TikTokAgent.removeAgent(req.params.accountId as string);
      res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /** POST /api/tiktok-agent/agents/:accountId/pause — pause an agent */
  router.post('/agents/:accountId/pause', (req: Request, res: Response) => {
    const agent = TikTokAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    agent.pause();
    res.json({ ok: true, status: agent.getStatus() });
  });

  /** POST /api/tiktok-agent/agents/:accountId/resume — resume a paused agent */
  router.post('/agents/:accountId/resume', (req: Request, res: Response) => {
    const agent = TikTokAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    agent.resume();
    res.json({ ok: true, status: agent.getStatus() });
  });

  /** PUT /api/tiktok-agent/agents/:accountId/config — update agent config */
  router.put('/agents/:accountId/config', (req: Request, res: Response) => {
    const agent = TikTokAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    agent.updateConfig(req.body);
    res.json({ ok: true, config: agent.getConfig() });
  });

  /** GET /api/tiktok-agent/agents/:accountId/logs — get agent logs */
  router.get('/agents/:accountId/logs', (req: Request, res: Response) => {
    const agent = TikTokAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({ logs: agent.getLogs(limit) });
  });

  /** GET /api/tiktok-agent/agents/:accountId/config — get agent config */
  router.get('/agents/:accountId/config', (req: Request, res: Response) => {
    const agent = TikTokAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    res.json(agent.getConfig());
  });

  return router;
}
