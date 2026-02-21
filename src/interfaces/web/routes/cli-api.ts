import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import logger from '../../../utils/logger.js';
import { Engine } from '../../../core/engine.js';

export function setupCLIRoutes(engine: Engine): Router {
  const router = Router();

  // GET /api/cli/status — Claude Code CLI connection status
  router.get('/status', (_req: Request, res: Response) => {
    const adapter = engine.getAIClient().getClaudeCodeAdapter();
    if (!adapter) {
      res.json({ available: false, authenticated: false, cliPath: 'claude', lastCheckAt: 0 });
      return;
    }
    const status = (adapter as any).provider?.getStatus?.() ?? {
      available: adapter.available,
      authenticated: adapter.available,
      cliPath: 'claude',
      lastCheckAt: 0,
    };
    res.json(status);
  });

  // POST /api/cli/auth — Open browser for Claude CLI OAuth login
  router.post('/auth', (_req: Request, res: Response) => {
    try {
      // Spawn `claude login` which opens the browser for OAuth
      const proc = spawn('claude', ['login'], {
        shell: true,
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      });
      proc.unref();

      logger.info('Claude CLI login triggered from dashboard');
      res.json({ ok: true, message: 'Browser opened for Anthropic authentication. Complete login in the browser, then click Re-check.' });
    } catch (err: any) {
      logger.error('Failed to trigger Claude CLI login', { error: err.message });
      res.status(500).json({ ok: false, message: `Failed to launch Claude CLI: ${err.message}` });
    }
  });

  // POST /api/cli/recheck — Re-check CLI availability after auth
  router.post('/recheck', async (_req: Request, res: Response) => {
    try {
      await engine.getAIClient().initClaudeCode();
      const adapter = engine.getAIClient().getClaudeCodeAdapter();
      const status = (adapter as any)?.provider?.getStatus?.() ?? {
        available: adapter?.available ?? false,
        authenticated: adapter?.available ?? false,
        cliPath: 'claude',
        lastCheckAt: Date.now(),
      };
      logger.info('Claude CLI re-checked from dashboard', { available: status.available, authenticated: status.authenticated });
      res.json(status);
    } catch (err: any) {
      logger.error('CLI recheck failed', { error: err.message });
      res.status(500).json({ available: false, authenticated: false, error: err.message });
    }
  });

  return router;
}
