import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { existsSync } from 'fs';
import { resolve as pathResolve } from 'path';
import helmet from 'helmet';
import config from '../../config.js';
import logger from '../../utils/logger.js';
import { Engine } from '../../core/engine.js';
import { BaseInterface } from '../base.js';
import { setupApiRoutes } from './routes/api.js';
import { setupAuthRoutes } from './routes/auth.js';
import { setupWebSocket } from './routes/ws.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { setupDashboardRoutes } from './routes/dashboard.js';
import { setupWebhookRoutes } from './routes/webhook.js';
import { setupSettingsRoutes } from './routes/settings.js';
import { setupSkillsRoutes } from './routes/skills-api.js';
import { setupServersRoutes } from './routes/servers-api.js';
import { setupLogsRoutes } from './routes/logs-api.js';
import { setupCostsRoutes } from './routes/costs-api.js';
import { setupCronRoutes } from './routes/cron-api.js';
import { setupHistoryRoutes } from './routes/history-api.js';
import { setupWhatsAppQRRoutes } from './routes/whatsapp-qr.js';
import { setupTradingRoutes } from './routes/trading-api.js';
import { setupRAGRoutes } from './routes/rag-api.js';
import { getAllModels } from '../../core/model-router.js';
import { resolve as resolvePath } from 'path';

export class WebServer extends BaseInterface {
  name = 'Web';
  private app: express.Express;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;

  constructor(engine: Engine) {
    super(engine);
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    setupWebSocket(this.wss, this.engine);
  }

  private setupMiddleware() {
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }));

    // CORS — restrict to same-origin in production
    this.app.use((_req, res, next) => {
      const allowedOrigins = config.NODE_ENV === 'production'
        ? [] // Same-origin only in production
        : ['http://localhost:5173', 'http://localhost:3000']; // Dev servers

      const origin = _req.headers.origin;
      if (origin && allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
      if (_req.method === 'OPTIONS') { res.status(204).end(); return; }
      next();
    });

    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(rateLimitMiddleware);

    // Global error handler for malformed JSON (entity.parse.failed)
    this.app.use((err: any, _req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (err.type === 'entity.parse.failed') {
        logger.warn('Malformed JSON in request body', { message: err.message });
        res.status(400).json({ error: 'Invalid JSON in request body' });
        return;
      }
      next(err);
    });
  }

  private setupRoutes() {
    // Webhook routes — authenticated via OPENCLAW_GATEWAY_TOKEN in webhook handler
    this.app.use('/webhook', setupWebhookRoutes());
    this.app.use('/api/auth', setupAuthRoutes());
    // Dashboard API routes — MUST be before the catch-all /api route
    this.app.use('/api/dashboard', authMiddleware, setupDashboardRoutes({
      getUptime: () => process.uptime(),
      getCronTasks: () => this.engine.getCronEngine()?.listTasks() ?? [],
      getUsageSummary: () => this.engine.getUsageTracker()?.getTodaySummary() ?? { totalCost: 0, byModel: {}, byAction: {}, totalCalls: 0 },
      getWorkflowCount: () => 0,
      getMcpInfo: () => ({ servers: 0, tools: 0 }),
      getSkills: () => this.engine.getSkillsEngine().getAllSkills(),
      getModels: () => getAllModels(),
      getProviders: () => this.engine.getAIClient().getAvailableProviders(),
      getMcpServers: () => this.loadMcpServerList(),
      getSSHServers: () => [],
    }));
    // Specific API routes (all require auth) — register before the catch-all
    this.app.use('/api/settings', authMiddleware, setupSettingsRoutes());
    this.app.use('/api/skills', authMiddleware, setupSkillsRoutes());
    this.app.use('/api/servers', authMiddleware, setupServersRoutes());
    this.app.use('/api/logs', authMiddleware, setupLogsRoutes());
    this.app.use('/api/costs', authMiddleware, setupCostsRoutes(this.engine));
    this.app.use('/api/cron', authMiddleware, setupCronRoutes(this.engine));
    this.app.use('/api/history', authMiddleware, setupHistoryRoutes(this.engine));
    this.app.use('/api/whatsapp', authMiddleware, setupWhatsAppQRRoutes());
    this.app.use('/api/trading', authMiddleware, setupTradingRoutes());
    // RAG routes (requires RAG engine — initialized later via setRAGEngine)
    if (this.engine.getRAGEngine()) {
      this.app.use('/api/rag', authMiddleware, setupRAGRoutes(this.engine.getRAGEngine()!));
    }
    // Catch-all /api route (chat + status) — MUST be after specific routes
    this.app.use('/api', authMiddleware, setupApiRoutes(this.engine));
    // Serve legacy dashboard HTML
    this.app.use('/dashboard', express.static(new URL('./public', import.meta.url).pathname));
    // Health check — minimal info (no internals exposed to unauthenticated users)
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    // Detailed status — requires auth (prevents fingerprinting)
    this.app.get('/api/status', authMiddleware, (_req, res) => {
      const mem = process.memoryUsage();
      res.json({
        name: 'ClawdAgent',
        status: 'running',
        uptime: Math.floor(process.uptime()),
        version: '6.0.0',
        memory: {
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
        providers: this.engine.getAIClient().getAvailableProviders(),
        interfaces: ['Telegram', 'WhatsApp', 'Web'],
      });
    });
    // Serve React dashboard from web/dist (built with Vite)
    const distPath = pathResolve(process.cwd(), 'web', 'dist');
    if (existsSync(distPath)) {
      this.app.use(express.static(distPath));
      // SPA catch-all: serve index.html for any non-API route (Express 5 syntax)
      this.app.get('{*path}', (_req, res) => {
        res.sendFile(pathResolve(distPath, 'index.html'));
      });
      logger.info('Serving React dashboard from web/dist');
    } else {
      this.app.get('/', (_req, res) => res.json({
        name: 'ClawdAgent',
        status: 'running',
        uptime: process.uptime(),
        dashboard: 'Run "cd web && npm run build" to enable the dashboard',
      }));
      logger.warn('web/dist not found — dashboard not served. Run: cd web && npm run build');
    }
  }

  async start() {
    return new Promise<void>((resolve) => {
      this.server.listen(config.PORT, config.BIND_HOST, () => {
        logger.info(`Web server started on ${config.BIND_HOST}:${config.PORT}`);
        if (config.BIND_HOST === '0.0.0.0') {
          logger.warn('Server bound to 0.0.0.0 — accessible from all interfaces. Use BIND_HOST=127.0.0.1 for local-only access.');
        }
        resolve();
      });
    });
  }

  /** Load MCP server list from .mcp.json for graph visualization */
  private loadMcpServerList(): Array<{ id: string; tools?: string[] }> {
    try {
      const mcpPath = resolvePath(process.cwd(), '.mcp.json');
      if (!existsSync(mcpPath)) return [];
      const raw = require('fs').readFileSync(mcpPath, 'utf-8');
      const parsed = JSON.parse(raw);
      const servers = parsed?.mcpServers ?? {};
      return Object.keys(servers).map(id => ({ id }));
    } catch {
      return [];
    }
  }

  async stop() {
    this.wss.close();
    return new Promise<void>((resolve) => { this.server.close(() => resolve()); });
  }
}
