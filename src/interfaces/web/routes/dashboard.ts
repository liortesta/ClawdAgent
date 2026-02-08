import { Router } from 'express';

export function setupDashboardRoutes(deps: {
  getUptime: () => number;
  getCronTasks: () => any[];
  getUsageSummary: () => any;
  getWorkflowCount: () => number;
  getMcpInfo: () => { servers: number; tools: number };
}): Router {
  const router = Router();

  router.get('/status', (_req, res) => {
    const mem = process.memoryUsage();
    res.json({
      status: 'online',
      uptime: deps.getUptime(),
      memory: { heapUsed: Math.round(mem.heapUsed / 1024 / 1024), heapTotal: Math.round(mem.heapTotal / 1024 / 1024), rss: Math.round(mem.rss / 1024 / 1024) },
      mcp: deps.getMcpInfo(),
      workflows: deps.getWorkflowCount(),
    });
  });

  router.get('/costs', (_req, res) => {
    res.json(deps.getUsageSummary());
  });

  router.get('/cron', (_req, res) => {
    res.json(deps.getCronTasks());
  });

  router.get('/containers', async (_req, res) => {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      const { stdout } = await execAsync('docker ps --format "{{.ID}}\\t{{.Names}}\\t{{.Status}}\\t{{.Image}}\\t{{.Ports}}"');
      const containers = stdout.trim().split('\n').filter(Boolean).map(line => {
        const [id, name, status, image, ports] = line.split('\t');
        return { id, name, status, image, ports };
      });
      res.json(containers);
    } catch { res.json([]); }
  });

  return router;
}
