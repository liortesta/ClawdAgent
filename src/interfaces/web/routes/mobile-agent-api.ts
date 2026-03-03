/**
 * Mobile Agent API routes — control autonomous Android app agents via Appium.
 */
import { Router, Request, Response } from 'express';
import { MobileAgent, type MobileAgentConfig, type MobileApp, type MobileActionType } from '../../../actions/mobile/mobile-agent.js';
import logger from '../../../utils/logger.js';

export function setupMobileAgentRoutes(): Router {
  const router = Router();

  /** GET /api/mobile-agent/connection — check Appium server connectivity */
  router.get('/connection', async (_req: Request, res: Response) => {
    const appiumUrl = process.env.APPIUM_URL || 'http://localhost:4723';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(`${appiumUrl}/status`, { signal: ctrl.signal });
      clearTimeout(timer);
      const data = await resp.json();
      res.json({ connected: true, url: appiumUrl, status: data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({ connected: false, url: appiumUrl, error: msg });
    }
  });

  /** POST /api/mobile-agent/connection/test — test a custom Appium URL */
  router.post('/connection/test', async (req: Request, res: Response) => {
    const { url } = req.body ?? {};
    if (!url) { res.status(400).json({ error: 'url is required' }); return; }
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const resp = await fetch(`${String(url).replace(/\/$/, '')}/status`, { signal: ctrl.signal });
      clearTimeout(timer);
      const data = await resp.json();
      res.json({ connected: true, url, status: data });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({ connected: false, url, error: msg });
    }
  });

  /** GET /api/mobile-agent/devices — list ADB devices */
  router.get('/devices', async (_req: Request, res: Response) => {
    try {
      const { execSync } = await import('child_process');
      const output = execSync('adb devices -l', { timeout: 5000 }).toString();
      const lines = output.trim().split('\n').slice(1); // skip header
      const devices = lines
        .filter(l => l.trim() && !l.startsWith('*'))
        .map(line => {
          const parts = line.trim().split(/\s+/);
          const id = parts[0];
          const status = parts[1];
          const props: Record<string, string> = {};
          for (const p of parts.slice(2)) {
            const [k, v] = p.split(':');
            if (k && v) props[k] = v;
          }
          return { id, status, model: props['model'] || 'unknown', device: props['device'] || 'unknown', product: props['product'] || '' };
        });
      res.json({ devices });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.json({ devices: [], error: `ADB not available: ${msg}` });
    }
  });

  /** GET /api/mobile-agent/agents — list all running mobile agents */
  router.get('/agents', (_req: Request, res: Response) => {
    res.json({ agents: MobileAgent.listAgents() });
  });

  /** GET /api/mobile-agent/agents/:id — get agent status */
  router.get('/agents/:id', (req: Request, res: Response) => {
    const agent = MobileAgent.getAgent(req.params.id as string);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    res.json(agent.getStatus());
  });

  /** POST /api/mobile-agent/agents — create and start an agent */
  router.post('/agents', async (req: Request, res: Response) => {
    try {
      const { app, deviceId, appiumUrl, config } = req.body ?? {};
      if (!app || !deviceId) { res.status(400).json({ error: 'app and deviceId are required' }); return; }

      const agentId = `${deviceId}:${app}`;
      const agentConfig: MobileAgentConfig = {
        id: agentId,
        app: app as MobileApp,
        deviceId,
        appiumUrl: appiumUrl || process.env.APPIUM_URL || 'http://localhost:4723',
        actions: (config?.actions as MobileActionType[]) ?? ['like', 'scroll'],
        schedule: config?.schedule ?? {
          like:    { intervalMinutes: 15, dailyLimit: 30 },
          comment: { intervalMinutes: 60, dailyLimit: 5 },
          follow:  { intervalMinutes: 30, dailyLimit: 10 },
          scroll:  { intervalMinutes: 5, dailyLimit: 100 },
          share:   { intervalMinutes: 45, dailyLimit: 5 },
          retweet: { intervalMinutes: 30, dailyLimit: 10 },
          reply:   { intervalMinutes: 60, dailyLimit: 5 },
        },
        activeHours: config?.activeHours ?? {
          weekday: { start: 8, end: 22 },
          weekend: { start: 10, end: 23 },
        },
        content: {
          tone: config?.content?.tone ?? 'Authentic, friendly, engaged',
          language: config?.content?.language ?? 'English',
          topics: config?.content?.topics ?? ['technology', 'AI'],
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

      const agent = MobileAgent.createAgent(agentConfig);
      await agent.start();
      res.json({ ok: true, status: agent.getStatus() });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to create mobile agent', { error: message });
      res.status(400).json({ error: message });
    }
  });

  /** POST /api/mobile-agent/agents/:id/stop */
  router.post('/agents/:id/stop', async (req: Request, res: Response) => {
    try {
      const agent = MobileAgent.getAgent(req.params.id as string);
      if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
      await agent.stop();
      MobileAgent.removeAgent(req.params.id as string);
      res.json({ ok: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(400).json({ error: message });
    }
  });

  /** POST /api/mobile-agent/agents/:id/pause */
  router.post('/agents/:id/pause', (req: Request, res: Response) => {
    const agent = MobileAgent.getAgent(req.params.id as string);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    agent.pause();
    res.json({ ok: true, status: agent.getStatus() });
  });

  /** POST /api/mobile-agent/agents/:id/resume */
  router.post('/agents/:id/resume', (req: Request, res: Response) => {
    const agent = MobileAgent.getAgent(req.params.id as string);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    agent.resume();
    res.json({ ok: true, status: agent.getStatus() });
  });

  /** PUT /api/mobile-agent/agents/:id/config — update config */
  router.put('/agents/:id/config', (req: Request, res: Response) => {
    const agent = MobileAgent.getAgent(req.params.id as string);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    agent.updateConfig(req.body);
    res.json({ ok: true, config: agent.getConfig() });
  });

  /** GET /api/mobile-agent/agents/:id/logs */
  router.get('/agents/:id/logs', (req: Request, res: Response) => {
    const agent = MobileAgent.getAgent(req.params.id as string);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    const limit = parseInt(req.query.limit as string) || 50;
    res.json({ logs: agent.getLogs(limit) });
  });

  /** GET /api/mobile-agent/agents/:id/config */
  router.get('/agents/:id/config', (req: Request, res: Response) => {
    const agent = MobileAgent.getAgent(req.params.id as string);
    if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
    res.json(agent.getConfig());
  });

  /** GET /api/mobile-agent/agents/:id/screenshot — live device screenshot */
  router.get('/agents/:id/screenshot', async (req: Request, res: Response) => {
    try {
      const agent = MobileAgent.getAgent(req.params.id as string);
      if (!agent) { res.status(404).json({ error: 'Agent not found' }); return; }
      const base64png = await agent.takeScreenshot();
      if (!base64png) { res.status(503).json({ error: 'Screenshot unavailable' }); return; }
      res.json({ screenshot: base64png });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: msg });
    }
  });

  return router;
}
