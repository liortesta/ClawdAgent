/**
 * Twitter/X Agent API routes — control autonomous Twitter engagement agents.
 */
import { Router, Request, Response } from 'express';
import { TwitterAgent, type TwitterAgentConfig } from '../../../actions/browser/twitter-agent.js';
import { TwitterAccountManager } from '../../../actions/browser/twitter-manager.js';
import logger from '../../../utils/logger.js';

export function setupTwitterAgentRoutes(): Router {
  const router = Router();

  /** GET /api/twitter-agent/agents — list all running agents */
  router.get('/agents', (_req: Request, res: Response) => {
    res.json({ agents: TwitterAgent.listAgents() });
  });

  /** GET /api/twitter-agent/agents/:accountId — get agent status */
  router.get('/agents/:accountId', (req: Request, res: Response) => {
    const agent = TwitterAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    res.json(agent.getStatus());
  });

  /** POST /api/twitter-agent/agents — create and start an agent */
  router.post('/agents', async (req: Request, res: Response) => {
    try {
      const { accountId, config } = req.body ?? {};
      if (!accountId) { res.status(400).json({ error: 'accountId is required' }); return; }

      // Verify account exists
      const account = TwitterAccountManager.getInstance().getAccount(accountId);
      if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

      // Build config with defaults
      const agentConfig: TwitterAgentConfig = {
        accountId,
        actions: config?.actions ?? ['like', 'reply'],
        schedule: config?.schedule ?? {
          tweet: { intervalMinutes: 180, dailyLimit: 3 },
          reply: { intervalMinutes: 30, dailyLimit: 15 },
          like: { intervalMinutes: 10, dailyLimit: 50 },
          retweet: { intervalMinutes: 120, dailyLimit: 5 },
          follow: { intervalMinutes: 45, dailyLimit: 20 },
          thread: { intervalMinutes: 360, dailyLimit: 1 },
        },
        activeHours: config?.activeHours ?? {
          weekday: { start: 8, end: 22 },
          weekend: { start: 10, end: 23 },
        },
        content: {
          tone: config?.content?.tone ?? 'insightful and authentic',
          language: config?.content?.language ?? 'English',
          topics: config?.content?.topics ?? ['AI', 'technology'],
          hashtags: config?.content?.hashtags ?? ['#AI', '#Tech'],
          targetAccounts: config?.content?.targetAccounts ?? [],
          promoFrequency: config?.content?.promoFrequency ?? 0,
          maxLength: config?.content?.maxLength ?? 280,
        },
        safety: config?.safety ?? {
          minDelaySeconds: 60,
          maxActionsPerHour: 10,
          pauseOnErrorCount: 3,
          pauseDurationMinutes: 60,
        },
        testMode: config?.testMode ?? false,
      };

      const agent = TwitterAgent.createAgent(agentConfig);
      await agent.start();

      res.json({ ok: true, status: agent.getStatus() });
    } catch (err: any) {
      logger.warn('Failed to create Twitter agent', { error: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  /** POST /api/twitter-agent/agents/:accountId/stop — stop an agent */
  router.post('/agents/:accountId/stop', async (req: Request, res: Response) => {
    try {
      const agent = TwitterAgent.getAgent(req.params.accountId as string);
      if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
      await agent.stop();
      TwitterAgent.removeAgent(req.params.accountId as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** POST /api/twitter-agent/agents/:accountId/pause — pause an agent */
  router.post('/agents/:accountId/pause', (req: Request, res: Response) => {
    const agent = TwitterAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    agent.pause();
    res.json({ ok: true, status: agent.getStatus() });
  });

  /** POST /api/twitter-agent/agents/:accountId/resume — resume a paused agent */
  router.post('/agents/:accountId/resume', (req: Request, res: Response) => {
    const agent = TwitterAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    agent.resume();
    res.json({ ok: true, status: agent.getStatus() });
  });

  /** PUT /api/twitter-agent/agents/:accountId/config — update agent config */
  router.put('/agents/:accountId/config', (req: Request, res: Response) => {
    const agent = TwitterAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    agent.updateConfig(req.body);
    res.json({ ok: true, config: agent.getConfig() });
  });

  /** GET /api/twitter-agent/agents/:accountId/logs — get agent logs */
  router.get('/agents/:accountId/logs', (req: Request, res: Response) => {
    const agent = TwitterAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({ logs: agent.getLogs(limit) });
  });

  /** GET /api/twitter-agent/agents/:accountId/config — get agent config */
  router.get('/agents/:accountId/config', (req: Request, res: Response) => {
    const agent = TwitterAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    res.json(agent.getConfig());
  });

  return router;
}
