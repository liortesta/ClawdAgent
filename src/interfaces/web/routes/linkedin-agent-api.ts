/**
 * LinkedIn Agent API routes — control autonomous LinkedIn agents.
 */
import { Router, Request, Response } from 'express';
import { LinkedInAgent, type LinkedInAgentConfig } from '../../../actions/browser/linkedin-agent.js';
import { LinkedInAccountManager } from '../../../actions/browser/linkedin-manager.js';
import logger from '../../../utils/logger.js';

export function setupLinkedInAgentRoutes(): Router {
  const router = Router();

  /** GET /api/linkedin-agent/agents — list all running agents */
  router.get('/agents', (_req: Request, res: Response) => {
    res.json({ agents: LinkedInAgent.listAgents() });
  });

  /** GET /api/linkedin-agent/agents/:accountId — get agent status */
  router.get('/agents/:accountId', (req: Request, res: Response) => {
    const agent = LinkedInAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    res.json(agent.getStatus());
  });

  /** POST /api/linkedin-agent/agents — create and start an agent */
  router.post('/agents', async (req: Request, res: Response) => {
    try {
      const { accountId, config } = req.body ?? {};
      if (!accountId) { res.status(400).json({ error: 'accountId is required' }); return; }

      // Verify account exists
      const account = LinkedInAccountManager.getInstance().getAccount(accountId);
      if (!account) { res.status(404).json({ error: 'Account not found' }); return; }

      // Build config with defaults
      const agentConfig: LinkedInAgentConfig = {
        accountId,
        actions: config?.actions ?? ['like', 'comment'],
        schedule: config?.schedule ?? {
          post: { intervalMinutes: 360, dailyLimit: 2 },
          comment: { intervalMinutes: 30, dailyLimit: 10 },
          like: { intervalMinutes: 15, dailyLimit: 30 },
          connect: { intervalMinutes: 60, dailyLimit: 10 },
          article: { intervalMinutes: 720, dailyLimit: 1 },
        },
        activeHours: config?.activeHours ?? {
          weekday: { start: 8, end: 22 },
          weekend: { start: 10, end: 23 },
        },
        content: {
          tone: config?.content?.tone ?? 'professional and insightful',
          language: config?.content?.language ?? 'English',
          topics: config?.content?.topics ?? ['AI', 'technology', 'startups'],
          industry: config?.content?.industry ?? 'Technology',
          targetAccounts: config?.content?.targetAccounts ?? [],
          promoLink: config?.content?.promoLink,
          promoFrequency: config?.content?.promoFrequency ?? 0,
          maxLength: config?.content?.maxLength ?? 700,
        },
        safety: config?.safety ?? {
          minDelaySeconds: 90,
          maxActionsPerHour: 8,
          pauseOnErrorCount: 2,
          pauseDurationMinutes: 60,
        },
        testMode: config?.testMode ?? false,
      };

      const agent = LinkedInAgent.createAgent(agentConfig);
      await agent.start();

      res.json({ ok: true, status: agent.getStatus() });
    } catch (err: any) {
      logger.warn('Failed to create LinkedIn agent', { error: err.message });
      res.status(400).json({ error: err.message });
    }
  });

  /** POST /api/linkedin-agent/agents/:accountId/stop — stop an agent */
  router.post('/agents/:accountId/stop', async (req: Request, res: Response) => {
    try {
      const agent = LinkedInAgent.getAgent(req.params.accountId as string);
      if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
      await agent.stop();
      LinkedInAgent.removeAgent(req.params.accountId as string);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  /** POST /api/linkedin-agent/agents/:accountId/pause — pause an agent */
  router.post('/agents/:accountId/pause', (req: Request, res: Response) => {
    const agent = LinkedInAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    agent.pause();
    res.json({ ok: true, status: agent.getStatus() });
  });

  /** POST /api/linkedin-agent/agents/:accountId/resume — resume a paused agent */
  router.post('/agents/:accountId/resume', (req: Request, res: Response) => {
    const agent = LinkedInAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    agent.resume();
    res.json({ ok: true, status: agent.getStatus() });
  });

  /** PUT /api/linkedin-agent/agents/:accountId/config — update agent config */
  router.put('/agents/:accountId/config', (req: Request, res: Response) => {
    const agent = LinkedInAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    agent.updateConfig(req.body);
    res.json({ ok: true, config: agent.getConfig() });
  });

  /** GET /api/linkedin-agent/agents/:accountId/logs — get agent logs */
  router.get('/agents/:accountId/logs', (req: Request, res: Response) => {
    const agent = LinkedInAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({ logs: agent.getLogs(limit) });
  });

  /** GET /api/linkedin-agent/agents/:accountId/config — get agent config */
  router.get('/agents/:accountId/config', (req: Request, res: Response) => {
    const agent = LinkedInAgent.getAgent(req.params.accountId as string);
    if (!agent) { res.status(404).json({ error: 'No agent for this account' }); return; }
    res.json(agent.getConfig());
  });

  return router;
}
