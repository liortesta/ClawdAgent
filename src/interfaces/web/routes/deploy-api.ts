import { Router, Request, Response } from 'express';
import { existsSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { spawn } from 'child_process';
import logger from '../../../utils/logger.js';

const PROJECT_ROOT = '/home/clickdrop-clawdagent/htdocs/clawdagent.clickdrop.online';

/** All deploy targets the agent can write to — each has a matching nginx location */
const DEPLOY_TARGETS: Record<string, string> = {
  games: join(PROJECT_ROOT, 'games'),
  projects: join(PROJECT_ROOT, 'projects'),
  apps: join(PROJECT_ROOT, 'apps'),
};

const BASE_URL = 'https://clawdagent.clickdrop.online';

export function setupDeployRoutes(): Router {
  const router = Router();

  // GET /api/deploy/targets — list available deploy targets and their contents
  router.get('/targets', (_req: Request, res: Response) => {
    const targets = Object.entries(DEPLOY_TARGETS).map(([name, path]) => {
      const exists = existsSync(path);
      let items: string[] = [];
      if (exists) {
        try {
          items = readdirSync(path).filter(f => {
            try { return statSync(join(path, f)).isDirectory(); } catch { return false; }
          });
        } catch { /* ignore */ }
      }
      return {
        name,
        path,
        url: `${BASE_URL}/${name}/`,
        exists,
        deployedApps: items.map(item => ({
          name: item,
          url: `${BASE_URL}/${name}/${item}/`,
        })),
      };
    });
    res.json({ targets });
  });

  // GET /api/deploy/list — flat list of all deployed apps across all targets
  router.get('/list', (_req: Request, res: Response) => {
    const allApps: Array<{ name: string; target: string; url: string; size?: string }> = [];

    for (const [target, basePath] of Object.entries(DEPLOY_TARGETS)) {
      if (!existsSync(basePath)) continue;
      try {
        const items = readdirSync(basePath).filter(f => {
          try { return statSync(join(basePath, f)).isDirectory(); } catch { return false; }
        });
        for (const item of items) {
          allApps.push({
            name: item,
            target,
            url: `${BASE_URL}/${target}/${item}/`,
          });
        }
      } catch { /* ignore */ }
    }

    res.json({ apps: allApps, total: allApps.length });
  });

  // POST /api/deploy/publish — deploy files from a source directory to a target
  router.post('/publish', async (req: Request, res: Response) => {
    const { source, target, name } = req.body;

    if (!source || !target || !name) {
      res.status(400).json({ error: 'source, target, and name are required' });
      return;
    }

    if (!DEPLOY_TARGETS[target]) {
      res.status(400).json({ error: `Invalid target. Available: ${Object.keys(DEPLOY_TARGETS).join(', ')}` });
      return;
    }

    // Sanitize name — only allow alphanumeric, hyphens, underscores
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safeName) {
      res.status(400).json({ error: 'Invalid app name' });
      return;
    }

    const sourcePath = resolve(source);
    if (!existsSync(sourcePath)) {
      res.status(400).json({ error: `Source directory not found: ${source}` });
      return;
    }

    const destPath = join(DEPLOY_TARGETS[target], safeName);

    try {
      // Copy source to deployment target
      const result = await execCommand(`mkdir -p "${destPath}" && cp -r "${sourcePath}/"* "${destPath}/"`);
      if (result.exitCode !== 0) {
        res.status(500).json({ error: `Deploy failed: ${result.output}` });
        return;
      }

      const url = `${BASE_URL}/${target}/${safeName}/`;
      logger.info('App deployed', { name: safeName, target, url });
      res.json({ success: true, url, path: destPath, name: safeName, target });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/deploy/:target/:name — remove a deployed app
  router.delete('/:target/:name', async (req: Request, res: Response) => {
    const target = req.params.target as string;
    const name = req.params.name as string;

    if (!DEPLOY_TARGETS[target]) {
      res.status(400).json({ error: `Invalid target: ${target}` });
      return;
    }

    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '');
    const appPath = join(DEPLOY_TARGETS[target], safeName);

    if (!existsSync(appPath)) {
      res.status(404).json({ error: 'App not found' });
      return;
    }

    try {
      await execCommand(`rm -rf "${appPath}"`);
      logger.info('App removed', { name: safeName, target });
      res.json({ success: true, message: `Removed ${safeName} from ${target}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}

function execCommand(command: string): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('bash', ['-c', command], { timeout: 30_000 });
    let output = '';
    child.stdout.on('data', (d: Buffer) => { output += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { output += d.toString(); });
    child.on('close', (code) => resolve({ output, exitCode: code ?? 0 }));
    child.on('error', (err) => resolve({ output: err.message, exitCode: 1 }));
  });
}
