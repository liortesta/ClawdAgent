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
import { setupCLIRoutes } from './routes/cli-api.js';
import { setupOpenClawRoutes } from './routes/openclaw-api.js';
import { setupEvolutionRoutes } from './routes/evolution-api.js';
import { setupA2ARoutes, setupACPRoutes, setupAgentCardRoute } from './routes/a2a-api.js';
import { setupBrowserRoutes } from './routes/browser-api.js';
import { setupFacebookRoutes } from './routes/facebook-api.js';
import { setupFacebookAgentRoutes } from './routes/facebook-agent-api.js';
import { setupTwitterRoutes } from './routes/twitter-api.js';
import { setupTwitterAgentRoutes } from './routes/twitter-agent-api.js';
import { setupLinkedInRoutes } from './routes/linkedin-api.js';
import { setupLinkedInAgentRoutes } from './routes/linkedin-agent-api.js';
import { setupTikTokRoutes } from './routes/tiktok-api.js';
import { setupTikTokAgentRoutes } from './routes/tiktok-agent-api.js';
import { setupVoiceAgentRoutes } from './routes/voice-agent-api.js';
import { setupMobileAgentRoutes } from './routes/mobile-agent-api.js';
import { setupTerminalRoutes } from './routes/terminal-api.js';
import { setupDeployRoutes } from './routes/deploy-api.js';
import { BrowserSessionManager } from '../../actions/browser/session-manager.js';
import { getAllModels } from '../../core/model-router.js';
import { resolve as resolvePath } from 'path';
import { metricsMiddleware, renderMetrics } from '../../core/metrics.js';
import { getAllCircuitBreakerStats } from '../../core/circuit-breaker.js';
import { IncomingMessage } from 'http';
import { Socket, connect as netConnect } from 'net';

export class WebServer extends BaseInterface {
  name = 'Web';
  private app: express.Express;
  private server: ReturnType<typeof createServer>;
  private wss: WebSocketServer;

  constructor(engine: Engine) {
    super(engine);
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ noServer: true });

    // Kill orphaned browser processes from previous runs
    BrowserSessionManager.cleanupOrphans();

    this.setupMiddleware();
    this.setupRoutes();
    setupWebSocket(this.wss, this.engine);
    this.setupUpgradeRouter();
  }

  /** Route WebSocket upgrade requests — VNC proxy vs regular WS (chat/notifications) */
  private setupUpgradeRouter() {
    this.server.on('upgrade', (req: IncomingMessage, socket: Socket, head: Buffer) => {
      const url = req.url ?? '';

      // VNC proxy: /browser-vnc/<sessionId>
      const vncMatch = url.match(/^\/browser-vnc\/([a-f0-9-]+)/);
      if (vncMatch) {
        this.handleVncUpgrade(vncMatch[1], req, socket, head);
        return;
      }

      // Voice stream: /voice-stream — Twilio media stream ↔ OpenAI Realtime bridge
      if (url.startsWith('/voice-stream')) {
        this.wss.handleUpgrade(req, socket, head, async (ws) => {
          const { TwilioVoiceAgent } = await import('../../actions/voice/twilio-voice-agent.js');
          TwilioVoiceAgent.getInstance().handleMediaStream(ws as any);
        });
        return;
      }

      // All other paths → regular WebSocket (chat, notifications)
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.wss.emit('connection', ws, req);
      });
    });
  }

  /** Proxy a VNC WebSocket connection to the session's websockify port */
  private handleVncUpgrade(sessionId: string, req: IncomingMessage, socket: Socket, head: Buffer) {
    const mgr = BrowserSessionManager.getInstance();
    const session = mgr.getSession(sessionId);

    if (!session || session.status !== 'running') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const url = req.url ?? '';

    // Raw TCP proxy to the session's websockify port on localhost
    const target = netConnect({ host: '127.0.0.1', port: session.wsPort }, () => {
      // Forward the original HTTP upgrade request
      target.write(`GET ${url} HTTP/1.1\r\n`);
      const headers = req.rawHeaders;
      for (let i = 0; i < headers.length; i += 2) {
        target.write(`${headers[i]}: ${headers[i + 1]}\r\n`);
      }
      target.write('\r\n');
      if (head.length > 0) target.write(head);

      // Bi-directional pipe
      socket.pipe(target);
      target.pipe(socket);
    });

    target.on('error', () => { socket.destroy(); });
    socket.on('error', () => { target.destroy(); });
    socket.on('close', () => { target.destroy(); });
    target.on('close', () => { socket.destroy(); });
  }

  private setupMiddleware() {
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-eval'"],  // unsafe-eval needed for noVNC
          styleSrc: ["'self'", "'unsafe-inline'"],  // unsafe-inline kept for styles only (dynamic CSS-in-JS)
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameSrc: ["'self'"],          // Allow noVNC iframes
          frameAncestors: ["'self'"],    // Allow embedding in our own pages (noVNC iframe)
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
    this.app.use(metricsMiddleware);

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
    // Prometheus metrics endpoint (no auth — standard for scraping)
    this.app.get('/metrics', (_req, res) => {
      res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
      res.send(renderMetrics());
    });

    // Circuit breaker stats (authenticated)
    this.app.get('/api/circuit-breakers', authMiddleware, (_req, res) => {
      res.json(getAllCircuitBreakerStats());
    });

    // Request timeout middleware — 120s for all API routes
    this.app.use('/api', (req, res, next) => {
      const timeout = setTimeout(() => {
        if (!res.headersSent) {
          logger.warn('Request timeout', { method: req.method, path: req.path });
          res.status(504).json({ error: 'Request timeout — processing took too long' });
        }
      }, 120_000);
      res.on('finish', () => clearTimeout(timeout));
      res.on('close', () => clearTimeout(timeout));
      next();
    });

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
      getSSHServers: () => {
        try {
          const { getServerListForAgent } = require('./routes/servers-api.js');
          return getServerListForAgent();
        } catch { return []; }
      },
    }));
    // Specific API routes (all require auth) — register before the catch-all
    this.app.use('/api/settings', authMiddleware, setupSettingsRoutes());
    this.app.use('/api/skills', authMiddleware, setupSkillsRoutes());
    this.app.use('/api/servers', authMiddleware, setupServersRoutes());
    this.app.use('/api/logs', authMiddleware, setupLogsRoutes());
    this.app.use('/api/costs', authMiddleware, setupCostsRoutes(this.engine));
    this.app.use('/api/cron', authMiddleware, setupCronRoutes(this.engine));
    this.app.use('/api/history', authMiddleware, setupHistoryRoutes());
    this.app.use('/api/whatsapp', authMiddleware, setupWhatsAppQRRoutes());
    this.app.use('/api/trading', authMiddleware, setupTradingRoutes());
    this.app.use('/api/cli', authMiddleware, setupCLIRoutes(this.engine));
    this.app.use('/api/openclaw', authMiddleware, setupOpenClawRoutes());
    this.app.use('/api/evolution', authMiddleware, setupEvolutionRoutes({
      getLLMTracker: () => (this.engine as any)._llmTracker ?? null,
      getEcosystemScanner: () => (this.engine as any)._ecosystemScanner ?? null,
      getEvolutionEngine: () => (this.engine as any)._evolutionEngine ?? null,
      getServiceTracker: () => (this.engine as any)._serviceTracker ?? null,
    }));
    // RAG routes — lazy proxy so routes work even when RAGEngine is set after server start
    this.app.use('/api/rag', authMiddleware, (req, res, next) => {
      const rag = this.engine.getRAGEngine();
      if (!rag) { res.status(503).json({ error: 'Knowledge base is initializing, please try again shortly' }); return; }
      if (!(this as any)._ragRouter) (this as any)._ragRouter = setupRAGRoutes(rag);
      (this as any)._ragRouter(req, res, next);
    });

    // ── Browser View routes ─────────────────────────────────────────────────
    this.app.use('/api/browser', authMiddleware, setupBrowserRoutes(this.engine));
    // ── Facebook Account routes ──────────────────────────────────────────────
    this.app.use('/api/facebook', authMiddleware, setupFacebookRoutes());
    this.app.use('/api/facebook-agent', authMiddleware, setupFacebookAgentRoutes());
    this.app.use('/api/twitter', authMiddleware, setupTwitterRoutes());
    this.app.use('/api/twitter-agent', authMiddleware, setupTwitterAgentRoutes());
    this.app.use('/api/linkedin', authMiddleware, setupLinkedInRoutes());
    this.app.use('/api/linkedin-agent', authMiddleware, setupLinkedInAgentRoutes());
    this.app.use('/api/tiktok', authMiddleware, setupTikTokRoutes());
    this.app.use('/api/tiktok-agent', authMiddleware, setupTikTokAgentRoutes());
    // ── Voice Agent routes (webhook endpoints are NOT behind auth — Twilio needs access) ──
    this.app.use('/api/voice-agent', setupVoiceAgentRoutes());
    this.app.use('/api/mobile-agent', authMiddleware, setupMobileAgentRoutes());
    // ── SSH Terminal routes ──────────────────────────────────────────────
    this.app.use('/api/terminal', authMiddleware, setupTerminalRoutes());
    // ── Deploy routes — agent can deploy built apps to web-accessible directories ──
    this.app.use('/api/deploy', authMiddleware, setupDeployRoutes());
    // Serve noVNC static files (HTML5 VNC client)
    this.app.use('/novnc', express.static('/usr/share/novnc'));

    // ── Protocol Endpoints (A2A + ACP) ─────────────────────────────────────
    // Agent Card — public (no auth), per A2A spec: GET /.well-known/agent.json
    this.app.use('/.well-known', setupAgentCardRoute(this.engine));
    // A2A Protocol — JSON-RPC 2.0 + REST + SSE (auth required)
    this.app.use('/a2a', authMiddleware, setupA2ARoutes(this.engine));
    // ACP Protocol — REST agent messaging (auth required)
    this.app.use('/acp', authMiddleware, setupACPRoutes(this.engine));
    logger.info('A2A + ACP protocol endpoints registered');

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
    // Cleanup headed browser sessions (kills Xvfb, VNC, websockify, Playwright)
    await BrowserSessionManager.getInstance().closeAll().catch(() => {});
    this.wss.close();
    return new Promise<void>((resolve) => { this.server.close(() => resolve()); });
  }
}
